"""Find possible NZ / Understat identities in local league exports.

Names and aliases only create candidates: no automatic confirmation.
Supports Understat league JSON and third-party Understat/FPL ID CSV exports.
"""
import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYERS = ROOT / "public/data/players.json"
LEAGUES = ROOT / "data/understat/league_exports"
ALIASES = ROOT / "data/understat/aliases.csv"
VERIFIED = ROOT / "data/understat/verified_players.csv"
REJECTED = ROOT / "data/understat/rejected_players.csv"
CANDIDATES = ROOT / "data/understat/candidates.csv"
FIELDS = ["player_id", "player_name", "understat_id", "understat_name",
          "team", "source_file", "match_method", "status"]


def key(name):
    name = unicodedata.normalize("NFKD", str(name or ""))
    plain = "".join(c for c in name if not unicodedata.combining(c)).casefold()
    return re.sub(r"[^a-z0-9]+", "", plain)


def eligible(player):
    if player.get("eligibility_status") == "potential_to_verify":
        return False
    return (
        "New Zealand" in (player.get("nationalities") or [])
        or "New Zealand" in (player.get("country_for_sport") or [])
        or (player.get("eligibility_status") == "confirmed_international"
            and "New Zealand" in (player.get("national_team") or ""))
    ) and player.get("gender") != "Women"


def source_rows(path):
    path = Path(path)
    if path.suffix.lower() == ".csv":
        with path.open(newline="", encoding="utf-8-sig") as handle:
            return [{str(k).strip(): v for k, v in row.items() if k is not None}
                    for row in csv.DictReader(handle)]
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("players", []) if isinstance(data, dict) else data
    return rows if isinstance(rows, list) else []


def discover(players, league_files, aliases=None):
    indexed = {}
    for person in players:
        if not person.get("name") or not eligible(person):
            continue
        names = [(person["name"], "exact")]
        names.extend((alias, "alias") for alias in (aliases or {}).get(person["id"], []))
        for name, method in names:
            if key(name):
                indexed.setdefault(key(name), []).append((person, method))
    results = {}
    for path in sorted(league_files):
        for item in source_rows(path):
            if not isinstance(item, dict):
                continue
            remote = str(item.get("player_name") or item.get("Understat_Name")
                         or item.get("player") or "").strip()
            identifier = str(item.get("id") or item.get("player_id")
                             or item.get("Understat_ID") or "").strip()
            if not remote or not identifier.isdecimal() or int(identifier) < 1:
                continue
            matches = indexed.get(key(remote), [])
            for person, method in matches:
                pair = (person["id"], identifier)
                if pair in results and results[pair]["match_method"] == "exact":
                    continue
                results[pair] = {
                    "player_id": person["id"], "player_name": person["name"],
                    "understat_id": identifier, "understat_name": remote,
                    "team": str(item.get("team_title") or item.get("team") or ""),
                    "source_file": Path(path).name,
                    "match_method": method,
                    "status": "needs_review",
                }
    return sorted(results.values(), key=lambda p: (p["player_name"], int(p["understat_id"])))


def read_aliases(path, valid_ids):
    aliases = {}
    if not path.exists():
        return aliases
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            player_id = (row.get("player_id") or "").strip()
            alias = (row.get("alias") or "").strip()
            if player_id not in valid_ids:
                raise ValueError(f"Unknown or ineligible NZ player alias: {player_id}")
            if alias:
                aliases.setdefault(player_id, []).append(alias)
    return aliases


def read_rejected(path):
    if not path.exists():
        return set()
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return {(row["player_id"].strip(), row["understat_id"].strip())
                for row in csv.DictReader(handle)}


def run():
    players = json.loads(PLAYERS.read_text(encoding="utf-8"))["players"]
    valid_ids = {player["id"] for player in players if eligible(player)}
    aliases = read_aliases(ALIASES, valid_ids)
    files = sorted(LEAGUES.glob("*.json")) + sorted(LEAGUES.glob("*.csv")) if LEAGUES.exists() else []
    found = discover(players, files, aliases)
    confirmed = set()
    if VERIFIED.exists():
        with VERIFIED.open(newline="", encoding="utf-8-sig") as handle:
            confirmed = {
                (row["player_id"].strip(), row["understat_id"].strip())
                for row in csv.DictReader(handle) if row.get("status", "").strip().lower() == "confirmed"
            }
    rejected = read_rejected(REJECTED)
    found = [row for row in found
             if (row["player_id"], row["understat_id"]) not in confirmed
             and (row["player_id"], row["understat_id"]) not in rejected]
    CANDIDATES.parent.mkdir(parents=True, exist_ok=True)
    with CANDIDATES.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(found)
    print(f"Understat: {len(found)} NZ name/alias candidates needing identity review from {len(files)} local exports; {len(rejected)} known homonyms excluded")


if __name__ == "__main__":
    run()
