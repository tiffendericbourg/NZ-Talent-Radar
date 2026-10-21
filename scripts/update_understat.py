"""Import verified New Zealand players' Understat shots, including X/Y.

The normal mode reads permitted local player JSON exports. Fetching Understat
pages is optional, requires explicit --fetch and a robots.txt check, and has
a slow request interval. Do not use the fetch option without permission.
"""
import argparse
import codecs
import csv
import json
import re
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parents[1]
PLAYERS = ROOT / "public/data/players.json"
MAPPING = ROOT / "data/understat/verified_players.csv"
EXPORTS = ROOT / "data/understat/exports"
OUTPUT = ROOT / "public/data/understat_shots.json"
AGENT = "NZTalentRadar/1.0 (research; https://github.com/tiffendericbourg/NZ-Talent-Radar)"


def as_float(value):
    try:
        number = float(value)
        return number if number == number and abs(number) != float("inf") else None
    except (TypeError, ValueError):
        return None


def parse_shots(text):
    """Accept a JSON player export or a normal Understat player HTML page."""
    try:
        data = json.loads(text)
    except ValueError:
        # Understat embeds escaped JSON in a shotsData variable.
        match = re.search(r"shotsData\s*=\s*JSON\.parse\(\s*'((?:\\.|[^'])*)'\s*\)", text)
        if not match:
            raise ValueError("No shotsData payload in the supplied file")
        data = json.loads(codecs.decode(match.group(1), "unicode_escape"))
    if isinstance(data, dict):
        data = data.get("shots")
    if not isinstance(data, list):
        raise ValueError("Understat shots must be a list")
    return data


def normalize_shots(raw, understat_id):
    """Keep shot identity, location and context; ignore invalid coordinates."""
    shots = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        if str(item.get("player_id", understat_id)) != str(understat_id):
            continue
        x, y, xg = as_float(item.get("X")), as_float(item.get("Y")), as_float(item.get("xG"))
        shot_id = str(item.get("id") or "")
        if not shot_id or None in (x, y, xg) or not (0 <= x <= 1 and 0 <= y <= 1 and 0 <= xg <= 1):
            continue
        shots[shot_id] = {
            "id": shot_id,
            "x": round(x, 5), "y": round(y, 5), "xg": round(xg, 5),
            "result": item.get("result") or None,
            "minute": item.get("minute") or None,
            "date": item.get("date") or None,
            "season": item.get("season") or None,
            "situation": item.get("situation") or None,
            "shot_type": item.get("shotType") or None,
            "match_id": str(item["match_id"]) if item.get("match_id") is not None else None,
            "home_away": item.get("h_a") or None,
        }
    return sorted(shots.values(), key=lambda x: (x["date"] or "", x["id"]))


def summarize(shots):
    """Stats use all valid sourced shot events, not estimates."""
    goals = sum(shot["result"] == "Goal" for shot in shots)
    xg_total = round(sum(shot["xg"] for shot in shots), 2)
    count = len(shots)
    return {
        "shots": count,
        "goals": goals,
        "xg": xg_total,
        "xg_per_shot": round(xg_total / count, 3) if count else None,
        "conversion_pct": round(goals / count * 100, 1) if count else None,
        "penalties": sum(shot["situation"] == "Penalty" for shot in shots),
    }


def summarize_seasons(shots):
    """Season-level goals and xG from the same shot events."""
    by_season = {}
    for shot in shots:
        year = str(shot.get("season") or "").strip()
        if not year.isdigit():
            continue
        by_season.setdefault(year, []).append(shot)
    return {year: summarize(entries) for year, entries in sorted(by_season.items())}


def permitted_to_fetch(url):
    """Fail closed when Understat's robots policy cannot be checked."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "understat.com" or not parsed.path.startswith("/player/"):
        return False
    try:
        robots_url = "https://understat.com/robots.txt"
        with urlopen(Request(robots_url, headers={"User-Agent": AGENT}), timeout=15) as response:
            if response.status != 200:
                return False
            robots = response.read(500_000).decode("utf-8", errors="replace")
        parser = RobotFileParser()
        parser.parse(robots.splitlines())
        return parser.can_fetch(AGENT, url)
    except Exception:
        return False


def run(fetch=False, max_players=5):
    known = {p["id"]: p for p in json.loads(PLAYERS.read_text(encoding="utf-8"))["players"]}
    mapping = list(csv.DictReader(MAPPING.open(newline="", encoding="utf-8-sig")))
    if not mapping:
        print("No verified Understat IDs yet; nothing to import")
    result = {}
    seen_understat = set()
    fetched = 0
    for row in mapping:
        player_id = row.get("player_id", "").strip()
        understat_id = row.get("understat_id", "").strip()
        if row.get("status", "").strip().lower() != "confirmed":
            continue
        if player_id not in known or not understat_id.isdigit():
            raise ValueError(f"Unverified or unknown player mapping: {player_id}")
        if understat_id in seen_understat:
            raise ValueError("One Understat ID was mapped to more than one player")
        seen_understat.add(understat_id)
        url = f"https://understat.com/player/{understat_id}"
        path = EXPORTS / (understat_id + ".json")
        if path.exists():
            text = path.read_text(encoding="utf-8")
        elif fetch and fetched < max_players:
            if not permitted_to_fetch(url):
                raise RuntimeError("Understat crawling not permitted or robots.txt unavailable")
            with urlopen(Request(url, headers={"User-Agent": AGENT}), timeout=30) as response:
                text = response.read(5_000_000).decode("utf-8")
            fetched += 1
            time.sleep(3)
        else:
            continue
        raw = parse_shots(text)
        shots = normalize_shots(raw, understat_id)
        result[player_id] = {
            "understat_id": understat_id, "source_url": url,
            "sample": "All imported shot events; coverage varies by league and season",
            "stats": summarize(shots),
            "seasons": summarize_seasons(shots),
            "shots": shots,
        }
        print(f"{known[player_id]['name']}: {len(shots)} valid shot events")

    output = {
        "generated_at": date.today().isoformat(),
        "source": "Understat",
        "coordinate_system": "normalized 0–1; attacking toward x=1",
        "players": result,
        "coverage": {
            "verified_players": len(seen_understat),
            "players_with_exports": len(result),
            "shots": sum(len(p["shots"]) for p in result.values()),
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(OUTPUT)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import verified Understat shot X/Y data")
    parser.add_argument("--fetch", action="store_true", help="Opt-in fetch; requires permission and robots approval")
    parser.add_argument("--max-players", type=int, default=5)
    options = parser.parse_args()
    try:
        run(fetch=options.fetch, max_players=max(0, options.max_players))
    except (ValueError, RuntimeError, OSError) as error:
        print(f"Understat update cancelled: {error}", file=sys.stderr)
        sys.exit(1)
