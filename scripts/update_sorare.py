"""Link NZ Talent Radar players with Sorare football profiles (read-only API)."""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PLAYERS_FILE = ROOT / "public/data/players.json"
MATCHES_FILE = ROOT / "public/data/sorare_matches.json"
API_URL = "https://api.sorare.com/graphql"

# Current Sorare Football GraphQL schema. No private account data is requested.
PLAYER_QUERY = """
query SearchFootballPlayers($name: String!) {
  searchPlayers(query: $name, pageSize: 10) {
    hits {
      player {
        slug
        displayName
        birthDate
        activeClub { name }
      }
    }
  }
}
"""


def clean_name(name):
    """Compare names without case, accents or punctuation differences."""
    name = unicodedata.normalize("NFKD", name or "")
    name = "".join(char for char in name if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]", "", name.casefold())


def slugify(name):
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "-", text.casefold()).strip("-")


def possible_slugs(player):
    """Guesses are only lookup terms, never accepted without identity checks."""
    if player.get("sorare_slug"):
        return [player["sorare_slug"]]
    name = player.get("name") or ""
    candidates = [slugify(name)]
    parts = name.split()
    if len(parts) > 2:
        candidates.append(slugify(parts[0] + " " + parts[-1]))
    return list(dict.fromkeys(slug for slug in candidates if slug))


def graphql_request(query, variables, api_key):
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "APIKEY": api_key,
        "User-Agent": "NZTalentRadar/1.0 (https://github.com/tiffendericbourg/NZ-Talent-Radar)",
    }
    for attempt in range(3):
        try:
            request = Request(API_URL, data=body, headers=headers, method="POST")
            with urlopen(request, timeout=30) as response:
                payload = json.load(response)
            if payload.get("errors"):
                # Log only the error category: never print the secret or HTTP headers.
                messages = " ".join(str(e.get("message", "")) for e in payload["errors"]).lower()
                if "cannot query field" in messages or "unknown argument" in messages or "doesn't exist" in messages:
                    raise RuntimeError("Sorare GraphQL schema mismatch (invalid field or argument)")
                if "unauthorized" in messages or "authentication" in messages or "forbidden" in messages:
                    raise RuntimeError("Sorare access denied by GraphQL")
                raise RuntimeError("Sorare GraphQL request rejected; check the live schema")
            data = payload.get("data")
            if not isinstance(data, dict) or not isinstance(data.get("searchPlayers"), dict):
                raise RuntimeError("Unexpected Sorare searchPlayers response")
            hits = data["searchPlayers"].get("hits")
            if not isinstance(hits, list):
                raise RuntimeError("Sorare searchPlayers.hits is missing")
            return [hit["player"] for hit in hits
                    if isinstance(hit, dict) and isinstance(hit.get("player"), dict)
                    and hit["player"].get("slug")]
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                if error.code in (401, 403):
                    raise RuntimeError(f"Sorare HTTP {error.code} — verify API access and secret") from None
                raise RuntimeError(f"Sorare HTTP {error.code}") from None
            wait = error.headers.get("Retry-After", "")
            seconds = min(int(wait), 60) if wait.isdigit() else 3 * (attempt + 1)
            time.sleep(seconds)
        except (URLError, TimeoutError):
            if attempt == 2:
                raise RuntimeError("Sorare request failed after retries") from None
            time.sleep(3 * (attempt + 1))


def match_identity(player, candidate):
    """Only an exact name AND full birth date can confirm a match automatically."""
    if not candidate:
        return "not_found"
    birth = str(candidate.get("birthDate") or "")[:10]
    same_name = clean_name(player.get("name")) == clean_name(candidate.get("displayName"))
    same_birth = bool(player.get("birth_date") and birth and player["birth_date"] == birth)
    same_club = bool(player.get("club") and candidate.get("activeClub")
                     and clean_name(player["club"]) == clean_name(candidate["activeClub"].get("name")))
    different_club = bool(player.get("club") and candidate.get("activeClub")
                          and not same_club)
    if same_name and same_birth and not different_club:
        return "confirmed"
    return "needs_review"


def lookup_player(player, api_key, request_func=graphql_request):
    """Search real Sorare players by name; slug guesses alone are unreliable."""
    name = (player.get("name") or "").strip()
    if not name:
        return {"status": "not_found", "candidate": None}
    candidates = request_func(PLAYER_QUERY, {"name": name}, api_key) or []
    # Keep unique Sorare identities, even if a result appears twice.
    unique = {candidate["slug"]: candidate for candidate in candidates if candidate.get("slug")}
    matches = [candidate for candidate in unique.values()
               if match_identity(player, candidate) == "confirmed"]
    if len(matches) == 1:
        return {"status": "confirmed", "candidate": matches[0]}
    if matches:
        return {"status": "needs_review", "candidate": matches[0]}
    if unique:
        possible = next((c for c in unique.values()
                         if clean_name(c.get("displayName")) == clean_name(name)), None)
        return {"status": "needs_review", "candidate": possible or next(iter(unique.values()))}
    return {"status": "not_found", "candidate": None}


def run(limit=0):
    key = os.environ.get("SORARE_API_KEY", "").strip()
    if not key:
        raise RuntimeError("SORARE_API_KEY is missing from the environment")
    original = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))
    players = original.get("players")
    if not isinstance(players, list) or not players:
        raise RuntimeError("No player data; Sorare update cancelled")

    # Continue where the previous weekly run stopped.
    # This matters when the Wikidata catalogue contains hundreds of players.
    earlier = {}
    if MATCHES_FILE.exists():
        previous = json.loads(MATCHES_FILE.read_text(encoding="utf-8"))
        earlier = {row["player_id"]: row for row in previous.get("matches", [])
                   if row.get("player_id")}
    current_ids = {p["id"] for p in players}
    results_by_id = {key: row for key, row in earlier.items() if key in current_ids}
    used_slugs = {p["sorare_slug"] for p in players if p.get("sorare_slug")}

    for player in players:
        if player.get("sorare_slug") and player["id"] not in results_by_id:
            results_by_id[player["id"]] = {
                "player_id": player["id"], "name": player["name"],
                "status": "already_matched", "sorare_slug": player["sorare_slug"]
            }

    unmatched = [p for p in players if not p.get("sorare_slug")]
    pending = [p for p in unmatched if p["id"] not in results_by_id]
    if not pending:
        # After checking everybody once, begin another verification cycle.
        pending = unmatched
    if limit:
        pending = pending[:limit]

    checked = 0
    for player in pending:
        checked += 1
        found = lookup_player(player, key)
        candidate = found["candidate"]
        # A Sorare slug cannot be assigned to two different players.
        if found["status"] == "confirmed" and candidate["slug"] in used_slugs:
            found["status"] = "needs_review"
        item = {
            "player_id": player["id"], "name": player.get("name"),
            "status": found["status"],
            "sorare_slug": candidate.get("slug") if candidate else None,
            "sorare_name": candidate.get("displayName") if candidate else None,
            "sorare_birth_date": (str(candidate.get("birthDate") or "")[:10] or None)
                                 if candidate else None,
            "sorare_club": (candidate.get("activeClub") or {}).get("name") if candidate else None,
        }
        results_by_id[player["id"]] = item
        if item["status"] == "confirmed":
            player["sorare_slug"] = item["sorare_slug"]
            used_slugs.add(item["sorare_slug"])
        print(f"{checked}: {player.get('name')} — {found['status']}")

    results = [results_by_id[p["id"]] for p in players if p["id"] in results_by_id]
    today = date.today().isoformat()
    summary = {
        "generated_at": today,
        "source": "Sorare football GraphQL",
        "scanned": checked,
        "checked_so_far": len(results),
        "remaining": len(players) - len(results),
        "confirmed": sum(r["status"] == "confirmed" for r in results),
        "already_matched": sum(r["status"] == "already_matched" for r in results),
        "needs_review": sum(r["status"] == "needs_review" for r in results),
        "not_found": sum(r["status"] == "not_found" for r in results),
        "matches": results,
    }
    MATCHES_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_report = MATCHES_FILE.with_suffix(".json.tmp")
    temp_report.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp_players = PLAYERS_FILE.with_suffix(".json.tmp")
    temp_players.write_text(json.dumps(original, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp_report.replace(MATCHES_FILE)
    temp_players.replace(PLAYERS_FILE)
    print(f"Sorare: {checked} checked, {summary['confirmed']} confirmed, "
          f"{summary['needs_review']} to review, {summary['not_found']} not found")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Read-only Sorare football player matching")
    parser.add_argument("--limit", type=int, default=0, help="Max players to check; 0 checks all")
    args = parser.parse_args()
    try:
        if args.limit < 0:
            raise ValueError("--limit must be at least 0")
        run(args.limit)
    except (RuntimeError, ValueError, HTTPError) as error:
        print(f"Sorare update cancelled: {error}", file=sys.stderr)
        sys.exit(1)
