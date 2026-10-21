"""Refresh the static catalogue using public Wikidata APIs (standard library only)."""
import csv
import json
import re
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/data/players.json"
MANUAL = ROOT / "data/manual_players.csv"
HEADERS = {"User-Agent": "NZTalentRadar/1.0 (github.com/tiffendericbourg/NZ-Talent-Radar)", "Accept": "application/json"}
QUERIES = [
    "SELECT DISTINCT ?person WHERE { ?person wdt:P106 wd:Q937857; wdt:P27 wd:Q664. }",
    "SELECT DISTINCT ?person WHERE { ?person wdt:P106 wd:Q937857; wdt:P1532 wd:Q664. }",
    "SELECT DISTINCT ?person WHERE { ?person wdt:P106 wd:Q937857; wdt:P19 ?place. ?place wdt:P17 wd:Q664. }",
]
NZ_TEAMS = {"Q175315", "Q503755"}

def request(url, params):
    full_url = url + "?" + urlencode(params)
    for attempt in range(3):
        try:
            with urlopen(Request(full_url, headers=HEADERS), timeout=60) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt + 1)

def claims(entity, property_id):
    return [row for row in entity.get("claims", {}).get(property_id, []) if row.get("rank") != "deprecated"]

def item_id(claim):
    value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
    return value.get("id") if isinstance(value, dict) else None

def ids(entity, prop):
    return list(dict.fromkeys(x for x in (item_id(c) for c in claims(entity, prop)) if x))

def label(entities, qid):
    return entities.get(qid, {}).get("labels", {}).get("en", {}).get("value") if qid else None

def birth_date(entity):
    for claim in claims(entity, "P569"):
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value", {})
        if value.get("precision", 0) >= 11:
            raw = value.get("time", "")
            if re.match(r"^\+\d{4}-\d{2}-\d{2}T", raw):
                return raw[1:11]
    return None

def age_on(born, today):
    if not born:
        return None
    try:
        birthday = date.fromisoformat(born)
        return today.year - birthday.year - ((today.month, today.day) < (birthday.month, birthday.day))
    except ValueError:
        return None

def club_from_claims(memberships):
    possible = set()
    for claim in memberships:
        club = item_id(claim)
        qualifiers = claim.get("qualifiers", {})
        if club and club not in NZ_TEAMS and "P580" in qualifiers and "P582" not in qualifiers:
            possible.add(club)
    return next(iter(possible)) if len(possible) == 1 else None

def entities_for(qids):
    result = {}
    for index in range(0, len(qids), 35):
        group = sorted(qids)[index:index + 35]
        payload = request("https://www.wikidata.org/w/api.php", {
            "action": "wbgetentities", "ids": "|".join(group),
            "props": "labels|claims", "languages": "en", "format": "json",
        })
        result.update(payload.get("entities", {}))
        time.sleep(0.1)
    return result

def overlay_manual(by_id, rows, today):
    for row in rows:
        qid = row.get("wikidata_id", "").strip()
        name = row.get("name", "").strip()
        manual_id = row.get("manual_id", "").strip()
        if not (qid or name):
            continue
        key = "wd:" + qid if re.fullmatch(r"Q\d+", qid) else "manual:" + (manual_id or re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"))
        person = by_id.get(key, {"id": key, "name": name, "sources": [], "nationalities": [], "birth_date": None, "wikidata_id": qid or None, "eligibility_status": "potential_to_verify"})
        for field in ("name", "birth_date", "birth_country", "position", "club", "club_country", "league", "national_team", "eligibility_status", "gender", "sorare_slug"):
            if row.get(field, "").strip():
                person[field] = row[field].strip()
        if row.get("nationalities", "").strip():
            person["nationalities"] = [s.strip() for s in row["nationalities"].split("|") if s.strip()]
        urls = [row["source_url"].strip()] if row.get("source_url", "").strip() else []
        if qid:
            urls.append("https://www.wikidata.org/wiki/" + qid)
        person["sources"] = sorted(set(person.get("sources", []) + urls))
        person["age"] = age_on(person.get("birth_date"), today)
        person["updated_at"] = today.isoformat()
        by_id[key] = person

def run():
    today = date.today()
    existing = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {"players": []}
    old = {p["id"]: p for p in existing["players"]}
    with MANUAL.open(newline="", encoding="utf-8-sig") as file:
        manual = list(csv.DictReader(file))
    discovered = set()
    for number, query in enumerate(QUERIES, 1):
        payload = request("https://query.wikidata.org/sparql", {"query": query, "format": "json"})
        discovered.update(row["person"]["value"].rsplit("/", 1)[-1] for row in payload["results"]["bindings"])
        print(f"Discovery {number}/3: {len(discovered)} unique IDs")
    discovered = {qid for qid in discovered if re.fullmatch(r"Q\d+", qid)}
    if not discovered:
        raise RuntimeError("No Wikidata players found")
    people = entities_for(discovered)
    if any(q not in people or "missing" in people[q] for q in discovered):
        raise RuntimeError("Some player details were missing")
    refs = set()
    for entity in people.values():
        for prop in ("P27", "P19", "P413", "P21", "P54"):
            refs.update(ids(entity, prop))
    related = entities_for(refs)
    extra = set()
    for entity in related.values():
        for prop in ("P17", "P118"):
            extra.update(ids(entity, prop))
    related.update(entities_for(extra - set(related)))
    result = dict(old)
    for qid, entity in people.items():
        citizenship = ids(entity, "P27")
        teams = ids(entity, "P54")
        nz_team = next((q for q in teams if q in NZ_TEAMS), None)
        birthplace = next(iter(ids(entity, "P19")), None)
        birth_country = next(iter(ids(related.get(birthplace, {}), "P17")), None)
        club = club_from_claims(claims(entity, "P54"))
        club_country = next(iter(ids(related.get(club, {}), "P17")), None)
        league = next(iter(ids(related.get(club, {}), "P118")), None)
        sex = next(iter(ids(entity, "P21")), None)
        born = birth_date(entity)
        key = "wd:" + qid
        result[key] = {
            "id": key, "name": label(people, qid) or qid, "birth_date": born,
            "age": age_on(born, today),
            "nationalities": [label(related, c) or c for c in citizenship],
            "birth_country": label(related, birth_country),
            "position": label(related, next(iter(ids(entity, "P413")), None)),
            "club": label(related, club), "club_country": label(related, club_country),
            "league": label(related, league),
            "national_team": label(related, nz_team),
            "eligibility_status": "confirmed_international" if nz_team else "nz_nationality" if "Q664" in citizenship else "potential_to_verify",
            "gender": "Women" if sex == "Q6581072" else "Men" if sex == "Q6581097" else None,
            "wikidata_id": qid, "sorare_slug": old.get(key, {}).get("sorare_slug"),
            "sources": ["https://www.wikidata.org/wiki/" + qid],
            "updated_at": today.isoformat(),
        }
    overlay_manual(result, manual, today)
    records = sorted(result.values(), key=lambda p: (p.get("name", "").lower(), p["id"]))
    snapshot = {"generated_at": today.isoformat(), "source": "Wikidata + manual review", "players": records}
    temp = OUTPUT.with_suffix(".json.tmp")
    temp.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(OUTPUT)
    print(f"Total: {len(records)} | New: {len(set(result)-set(old))} | Refreshed: {len(people)}")
    print(f"Known club: {sum(bool(p.get('club')) for p in records)} | Missing birthday: {sum(not p.get('birth_date') for p in records)}")

if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(f"Update aborted. Existing JSON kept: {exc}", file=sys.stderr)
        sys.exit(1)
