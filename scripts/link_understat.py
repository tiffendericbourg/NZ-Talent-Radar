"""Publish reviewed NZ Talent Radar <-> Understat identities.

No network calls: IDs are approved in data/understat/verified_players.csv.
A confirmed ID is NOT proof that shot data have been imported.
"""
import csv
import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
PLAYERS = ROOT / "public/data/players.json"
MAPPING = ROOT / "data/understat/verified_players.csv"
OUTPUT = ROOT / "public/data/understat_links.json"


def is_verified_nz(player):
    if player.get("eligibility_status") == "potential_to_verify":
        return False
    nationalities = player.get("nationalities") or []
    sports = player.get("country_for_sport") or []
    return (
        "New Zealand" in nationalities
        or "New Zealand" in sports
        or (player.get("eligibility_status") == "confirmed_international"
            and "New Zealand" in (player.get("national_team") or ""))
    )


def make_links(catalogue, rows, today=None):
    today = today or date.today()
    known = {player["id"]: player for player in catalogue["players"]}
    links = {}
    used_understat_ids = set()
    for row in rows:
        if (row.get("status") or "").strip().lower() != "confirmed":
            continue
        player_id = (row.get("player_id") or "").strip()
        understat_id = (row.get("understat_id") or "").strip()
        evidence_url = (row.get("evidence_url") or "").strip()
        player = known.get(player_id)
        if not player or not is_verified_nz(player) or player.get("gender") == "Women":
            raise ValueError(f"Understat identity is not a verified NZ men's player: {player_id}")
        if not understat_id.isdecimal() or int(understat_id) < 1:
            raise ValueError(f"Invalid Understat ID for {player_id}: {understat_id}")
        parsed = urlparse(evidence_url)
        if parsed.scheme != "https" or not parsed.hostname:
            raise ValueError(f"Missing HTTPS identity evidence for {player_id}")
        if player_id in links or understat_id in used_understat_ids:
            raise ValueError(f"Duplicate Understat identity: {player_id} / {understat_id}")
        used_understat_ids.add(understat_id)
        links[player_id] = {
            "player_name": player["name"],
            "understat_id": understat_id,
            "source_url": f"https://understat.com/player/{understat_id}",
            "evidence_url": evidence_url,
            "status": "confirmed",
        }
    return {
        "generated_at": today.isoformat(),
        "source": "Manually reviewed Understat IDs",
        "note": "An identity link does not imply imported matches or shot coordinates.",
        "confirmed": len(links),
        "players": dict(sorted(links.items())),
    }


def run():
    catalogue = json.loads(PLAYERS.read_text(encoding="utf-8"))
    with MAPPING.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    output = make_links(catalogue, rows)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"Understat: {output['confirmed']} verified NZ identities, shot data handled separately")
    return output


if __name__ == "__main__":
    run()
