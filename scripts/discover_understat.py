"""Discover possible NZ player IDs in permitted Understat league exports.

This only produces candidates. Understat league data has no verified birth date,
so NEVER auto-confirm an ID from the name alone.
"""
import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYERS = ROOT / "public/data/players.json"
LEAGUES = ROOT / "data/understat/league_exports"
CANDIDATES = ROOT / "data/understat/candidates.csv"


def key(name):
    name = unicodedata.normalize("NFKD", str(name or ""))
    return re.sub(r"[^a-z0-9]+", "", "".join(
        x for x in name if not unicodedata.combining(x)).casefold())


def discover(players, league_files):
    indexed = {}
    for person in players:
        if person.get("name"):
            indexed.setdefault(key(person["name"]), []).append(person)
    results = {}
    for path in sorted(league_files):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        rows = data.get("players", []) if isinstance(data, dict) else data
        if not isinstance(rows, list):
            continue
        for item in rows:
            if not isinstance(item, dict):
                continue
            remote = str(item.get("player_name") or item.get("player") or "").strip()
            identifier = str(item.get("id") or item.get("player_id") or "")
            if not remote or not identifier.isdigit():
                continue
            for person in indexed.get(key(remote), []):
                pair = (person["id"], identifier)
                results[pair] = {
                    "player_id": person["id"], "player_name": person["name"],
                    "understat_id": identifier, "understat_name": remote,
                    "source_file": Path(path).name,
                    "status": "needs_review",
                }
    return sorted(results.values(), key=lambda p: (p["player_name"], p["understat_id"]))


def run():
    players = json.loads(PLAYERS.read_text(encoding="utf-8"))["players"]
    found = discover(players, LEAGUES.glob("*.json") if LEAGUES.exists() else [])
    CANDIDATES.parent.mkdir(parents=True, exist_ok=True)
    with CANDIDATES.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "player_id", "player_name", "understat_id", "understat_name",
            "source_file", "status"])
        writer.writeheader()
        writer.writerows(found)
    print(f"Understat: {len(found)} name candidates requiring identity verification")


if __name__ == "__main__":
    run()
