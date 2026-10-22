"""Collect actual match performances for verified NZ footballers from Sorare.

Read-only GraphQL; API key lives in the SORARE_API_KEY Actions secret.
Missing data stays missing. Failed requests never erase previously saved players.
"""
import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / "public/data/players.json"
OUTPUT = ROOT / "public/data/sorare_performance.json"
API_URL = "https://api.sorare.com/graphql"

# These fields were checked against Sorare's public GraphQL schema (October 2026).
GAME_FIELDS = (
    "minsPlayed", "playedInGame", "gameStarted", "onGameSheet",
    "goals", "goalAssist", "totalScoringAtt", "ontargetScoringAtt",
    "bigChanceCreated", "bigChanceMissed", "penAreaEntries",
    "totalPass", "accuratePass", "successfulFinalThirdPasses",
    "accurateLongBalls", "duelWon", "duelLost", "wonContest",
    "totalTackle", "wonTackle", "interceptionWon", "possWon",
    "possLostCtrl", "effectiveClearance", "errorLeadToShot",
    "errorLeadToGoal", "fouls", "yellowCard", "redCard",
    "saves", "goalsConceded", "goodHighClaim", "accurateKeeperSweeper",
    "penaltiesSaved", "cleanSheet",
)
QUERY = """
query NZPlayerPerformance($slug: String!, $count: Int!) {
  anyPlayer(slug: $slug) {
    __typename
    slug
    displayName
    birthDate
    ... on Player {
      allPlayerGameScores(first: $count) {
        nodes {
          __typename
          id
          score
          scoreStatus
          scoringVersion
          position
          ... on PlayerGameScore {
            allAroundScore
            footballGame {
              id
              date
              lowCoverage
              competition { name }
            }
            footballPlayerGameStats {
              %s
            }
          }
        }
      }
    }
  }
}
""" % "\n              ".join(GAME_FIELDS)

# Compact fallback that avoids optional fields if Sorare modifies its schema.
CORE_FIELDS = ("minsPlayed", "playedInGame", "goals", "goalAssist")
CORE_QUERY = QUERY.replace("\n              ".join(GAME_FIELDS), "\n              ".join(CORE_FIELDS))


def auth_headers(key):
    """The API key controls rate limits; user access tokens authenticate."""
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "NZTalentRadar/1.1 (https://github.com/tiffendericbourg/NZ-Talent-Radar)",
    }
    if key:
        headers["APIKEY"] = key
    token = os.environ.get("SORARE_ACCESS_TOKEN", "").strip()
    if token:
        headers["Authorization"] = "Bearer " + token
        audience = os.environ.get("SORARE_JWT_AUD", "").strip()
        if audience:
            headers["JWT-AUD"] = audience
    return headers


def graphql_errors(payload):
    return "; ".join(str(e.get("message", ""))[:160]
                     for e in payload.get("errors", []) if isinstance(e, dict))


def request_player(slug, count, key):
    """Try detailed stats and fall back to a compact, schema-safe query."""
    headers = auth_headers(key)
    for query_label, query in (("detailed", QUERY), ("core", CORE_QUERY)):
        body = json.dumps({"query": query, "variables": {
            "slug": slug, "count": count}}).encode("utf-8")
        for attempt in range(3):
            try:
                req = Request(API_URL, data=body, headers=headers, method="POST")
                with urlopen(req, timeout=30) as response:
                    payload = json.load(response)
                if payload.get("errors"):
                    reason = graphql_errors(payload)
                    lowered = reason.lower()
                    if any(word in lowered for word in (
                            "unauthorized", "forbidden", "authentication", "not authenticated")):
                        raise RuntimeError(
                            "Sorare authentication required. Provide SORARE_ACCESS_TOKEN "
                            "(and SORARE_JWT_AUD for JWT) in repository secrets")
                    if query_label == "detailed" and any(word in lowered for word in (
                            "cannot query field", "unknown argument", "complexity",
                            "max complexity", "query is too complex")):
                        print("Sorare detailed query rejected; retrying essential match stats")
                        break
                    raise RuntimeError("Sorare " + query_label + " GraphQL error: " + reason)
                player = (payload.get("data") or {}).get("anyPlayer")
                if not isinstance(player, dict):
                    raise RuntimeError("Sorare returned no verified player for slug " + slug)
                if player.get("__typename") != "Player":
                    raise RuntimeError("Sorare slug does not identify a football player")
                scores = player.get("allPlayerGameScores")
                if not isinstance(scores, dict) or not isinstance(scores.get("nodes"), list):
                    raise RuntimeError("Sorare response has no game scores list")
                player["collection_detail"] = query_label
                return player
            except HTTPError as error:
                if error.code in (401, 403):
                    raise RuntimeError(
                        "Sorare HTTP %s: confirm SORARE_ACCESS_TOKEN (JWT) and API key" %
                        error.code) from None
                if error.code in (400, 422):
                    # GraphQL validation errors sometimes arrive as HTTP 422.
                    # Show only the error message, never credentials or headers.
                    raw = error.read(6000).decode("utf-8", errors="replace")
                    try:
                        detail = json.loads(raw)
                        reason = graphql_errors(detail) or str(detail.get("message", ""))[:220]
                    except (ValueError, AttributeError):
                        reason = raw[:220]
                    if query_label == "detailed":
                        print("Sorare detailed HTTP %s (%s); trying minimal stats" %
                              (error.code, reason[:170]))
                        break
                    raise RuntimeError("Sorare core API HTTP %s: %s" %
                                       (error.code, reason[:220])) from None
                if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise RuntimeError("Sorare API HTTP %s" % error.code) from None
                delay = error.headers.get("Retry-After", "")
                time.sleep(min(int(delay), 60) if delay.isdigit() else 3 * (attempt + 1))
            except (URLError, TimeoutError):
                if attempt == 2:
                    raise RuntimeError("Sorare network unavailable after retries") from None
                time.sleep(3 * (attempt + 1))
    raise RuntimeError("Sorare performance queries were rejected")


def normalize_game(node):
    if node.get("__typename") != "PlayerGameScore":
        return None
    game = node.get("footballGame") or {}
    stats = node.get("footballPlayerGameStats") or {}
    if not node.get("id") or not game.get("date") or not game.get("id"):
        return None
    filtered_stats = {
        field: stats.get(field) if isinstance(stats.get(field), (int, bool)) else None
        for field in GAME_FIELDS
    }
    return {
        "id": node["id"],
        "game_id": game["id"],
        "date": game["date"],
        "competition": (game.get("competition") or {}).get("name"),
        "position": node.get("position"),
        "score": node.get("score") if isinstance(node.get("score"), (int, float)) else None,
        "score_status": node.get("scoreStatus"),
        "scoring_version": node.get("scoringVersion"),
        "all_around_score": node.get("allAroundScore"),
        "low_coverage": game.get("lowCoverage"),
        "stats": filtered_stats,
    }


def summarize(games):
    played = [g for g in games if g["stats"].get("playedInGame") is True
              and (g["stats"].get("minsPlayed") or 0) > 0
              and g["score_status"] == "FINAL"]
    reliable = [g for g in played if g.get("low_coverage") is False
                and isinstance(g.get("score"), (int, float))
                and isinstance(g.get("scoring_version"), int)]
    # Prevent comparing different scoring versions inside the same average.
    newest = reliable[0]["scoring_version"] if reliable else None
    comparable = [g for g in reliable if g["scoring_version"] == newest]
    totals = {}
    for field in GAME_FIELDS:
        if field in ("playedInGame", "onGameSheet", "gameStarted"):
            continue
        values = [g["stats"][field] for g in played if g["stats"].get(field) is not None]
        totals[field] = sum(values) if values else None
    minutes = sum(g["stats"]["minsPlayed"] for g in played)
    return {
        "matches_played": len(played),
        "minutes": minutes,
        "scored_matches": len(comparable),
        "scoring_version": newest,
        "average_score": round(sum(g["score"] for g in comparable) / len(comparable), 1)
        if comparable else None,
        "totals": totals,
        "scope": "last retrieved game scores; finalized played matches; totals only where reported",
    }


def merge_games(new_games, old_games):
    """Keep previously verified match history across weekly API snapshots."""
    merged = {game["id"]: game for game in old_games if game.get("id")}
    # Newest API result takes precedence when Sorare corrects a score.
    merged.update({game["id"]: game for game in new_games if game.get("id")})
    return sorted(merged.values(), key=lambda game: game.get("date") or "", reverse=True)


def played_period(games):
    dates = sorted(str(g["date"])[:10] for g in games
                   if g.get("score_status") == "FINAL"
                   and g.get("stats", {}).get("playedInGame") is True
                   and (g.get("stats", {}).get("minsPlayed") or 0) > 0)
    return (dates[0], dates[-1]) if dates else (None, None)


def normalize_player(catalogue_player, api_player, count):
    expected = catalogue_player.get("birth_date")
    actual = str(api_player.get("birthDate") or "")[:10]
    # An established identity is not enough if the live slug changed owners.
    if expected and actual and expected != actual:
        raise ValueError("Sorare birth date does not match verified NZ identity")
    if not actual:
        raise ValueError("Sorare returned no date of birth to verify identity")
    games = []
    seen = set()
    for entry in api_player["allPlayerGameScores"]["nodes"]:
        if not isinstance(entry, dict):
            continue
        game = normalize_game(entry)
        if game and game["id"] not in seen:
            seen.add(game["id"])
            games.append(game)
    games.sort(key=lambda x: x["date"], reverse=True)
    # The stats period covers finalized matches actually played, not DNP entries.
    period_start, period_end = played_period(games)
    return {
        "sorare_slug": catalogue_player["sorare_slug"],
        "name": catalogue_player["name"],
        "source_url": "https://sorare.com/football/players/" + catalogue_player["sorare_slug"],
        "requested_games": count,
        "collection_detail": api_player.get("collection_detail", "detailed"),
        "games": games,
        "period_start": period_start,
        "period_end": period_end,
        "summary": summarize(games),
    }


def run(limit=0, games=50, check=False, request_func=request_player):
    key = os.environ.get("SORARE_API_KEY", "").strip()
    if not key and not os.environ.get("SORARE_ACCESS_TOKEN", "").strip():
        raise RuntimeError("Missing Sorare credentials: SORARE_API_KEY or SORARE_ACCESS_TOKEN")
    players = json.loads(CATALOGUE.read_text(encoding="utf-8"))["players"]
    verified = [p for p in players if p.get("sorare_slug") and p.get("id")]
    if not verified:
        raise RuntimeError("No verified Sorare identities in the current catalogue")
    selected = verified[:limit] if limit > 0 else verified
    previous = {"players": {}}
    if OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
    records = dict(previous.get("players", {}))
    success = 0
    failures = []
    for p in selected[:1] if check else selected:
        try:
            remote = request_func(p["sorare_slug"], 1 if check else games, key)
            result = normalize_player(p, remote, 1 if check else games)
            # Record when this player's data were actually returned by Sorare.
            checked_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            result["retrieved_at"] = checked_at
            result["last_checked_at"] = checked_at
            if check:
                print("Sorare performance query accepted for a verified player")
                return result
            old = records.get(p["id"], {})
            if not result["games"] and old.get("games"):
                old["last_checked_at"] = checked_at
                print("%s: no new scores; preserving previous confirmed matches" % p["name"])
            else:
                if old.get("sorare_slug") == result["sorare_slug"] and old.get("games"):
                    result["games"] = merge_games(result["games"], old["games"])
                    result["summary"] = summarize(result["games"])
                    result["period_start"], result["period_end"] = played_period(result["games"])
                records[p["id"]] = result
            success += 1
            print("%s: %s matches played / %s game scores" %
                  (p["name"], result["summary"]["matches_played"], len(result["games"])))
        except (RuntimeError, ValueError) as exc:
            failures.append({"player_id": p["id"], "reason": str(exc)[:220]})
            print("%s: performance unavailable (%s)" % (p["name"], str(exc)[:130]))
            if check:
                raise
        time.sleep(0.5)
    if success == 0:
        raise RuntimeError("No player performance could be verified; previous snapshot kept. "
                           + (failures[0]["reason"] if failures else "Sorare returned no players"))
    generated_at = datetime.now(timezone.utc)
    output = {
        "generated_at": generated_at.date().isoformat(),
        "generated_at_utc": generated_at.isoformat(timespec="seconds"),
        "source": "Sorare football GraphQL",
        "sample": "Latest %s game scores per request, with previously verified match history retained" % games,
        "players": records,
        "coverage": {
            "confirmed_identities": len(verified),
            "players_requested": len(selected),
            "players_updated": success,
            "players_with_data": sum(bool(r.get("games")) for r in records.values()),
            "game_scores": sum(len(r.get("games") or []) for r in records.values()),
            "failed_players": failures,
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix(".json.tmp")
    temp.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(OUTPUT)
    print("Saved %s players with scores (%s updated)" %
          (output["coverage"]["players_with_data"], success))
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="0 = all confirmed identities")
    parser.add_argument("--games", type=int, default=50, help="Recent match scores per player (max 50); retains earlier imports")
    parser.add_argument("--check", action="store_true", help="Validate one live GraphQL request")
    args = parser.parse_args()
    if args.limit < 0 or not 1 <= args.games <= 50:
        parser.error("limit must be >= 0 and games between 1 and 50")
    run(limit=args.limit, games=args.games, check=args.check)


if __name__ == "__main__":
    main()
