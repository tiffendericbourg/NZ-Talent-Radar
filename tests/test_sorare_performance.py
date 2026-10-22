"""Offline checks for real-data Sorare performance ingestion."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import update_sorare_performance as perf


def player_result():
    def node(i, date, minutes, score, status="FINAL", low=False, version=7):
        return {
            "__typename": "PlayerGameScore", "id": "score-" + str(i),
            "score": score, "scoreStatus": status, "scoringVersion": version,
            "position": "Forward", "allAroundScore": 4,
            "footballGame": {"id": "match-" + str(i), "date": date,
                             "lowCoverage": low, "competition": {"name": "Test league"}},
            "footballPlayerGameStats": {
                "minsPlayed": minutes, "playedInGame": minutes > 0,
                "goals": 1 if i == 1 else 0, "goalAssist": None,
                "totalPass": 15 if minutes else None,
            },
        }
    return {"__typename": "Player", "slug": "chris-wood",
            "displayName": "Chris Wood", "birthDate": "1991-12-07",
            "allPlayerGameScores": {"nodes": [
                node(1, "2026-10-20T12:00:00Z", 90, 71),
                node(2, "2026-10-12T12:00:00Z", 45, 55),
                node(3, "2026-10-05T12:00:00Z", 0, 0, "DID_NOT_PLAY"),
                node(4, "2026-09-28T12:00:00Z", 70, 80, low=True),
                node(5, "2026-09-18T12:00:00Z", 90, 63, version=6),
            ]}}


class PerformanceTests(unittest.TestCase):
    def setUp(self):
        self.player = {"id": "wd:Q74548", "name": "Chris Wood",
                       "birth_date": "1991-12-07", "sorare_slug": "chris-wood"}

    def test_query_is_sourced_and_contains_defensive_and_gk_stats(self):
        self.assertIn("anyPlayer(slug: $slug)", perf.QUERY)
        self.assertIn("allPlayerGameScores(first: $count)", perf.QUERY)
        self.assertIn("interceptionWon", perf.QUERY)
        self.assertIn("saves", perf.QUERY)

    def test_dnp_low_coverage_and_old_version_not_scored(self):
        result = perf.normalize_player(self.player, player_result(), 15)
        self.assertEqual(len(result["games"]), 5)
        self.assertEqual(result["summary"]["matches_played"], 4)
        self.assertEqual(result["summary"]["minutes"], 295)
        self.assertEqual(result["summary"]["scored_matches"], 2)
        self.assertEqual(result["summary"]["average_score"], 63.0)
        self.assertEqual(result["period_start"], "2026-09-18")
        self.assertEqual(result["period_end"], "2026-10-20")
        self.assertEqual(result["summary"]["totals"]["goals"], 1)
        self.assertIsNone(result["summary"]["totals"]["goalAssist"])

    def test_merges_previous_season_without_replacing_recent_results(self):
        old = perf.normalize_game(player_result()["allPlayerGameScores"]["nodes"][0])
        old["id"], old["game_id"], old["date"] = "old", "match-older", "2025-03-17T12:00:00Z"
        newer = perf.normalize_game(player_result()["allPlayerGameScores"]["nodes"][0])
        merged = perf.merge_games([newer], [old, {**newer, "score": 45}])
        self.assertEqual([g["id"] for g in merged], [newer["id"], "old"])
        self.assertEqual(merged[0]["score"], 71)
        self.assertEqual(perf.played_period(merged), ("2025-03-17", "2026-10-20"))

    def test_birth_date_in_player_fragment_not_sport_agnostic_interface(self):
        before, after = perf.QUERY.split("... on Player {")
        self.assertNotIn("birthDate", before)
        self.assertIn("birthDate", after)

    def test_wrong_identity_fails(self):
        remote = {**player_result(), "birthDate": "1990-01-01"}
        with self.assertRaises(ValueError):
            perf.normalize_player(self.player, remote, 15)

    def test_no_birthdate_fails(self):
        remote = {**player_result(), "birthDate": None}
        with self.assertRaises(ValueError):
            perf.normalize_player(self.player, remote, 15)

    def test_no_games_is_unknown_not_fabricated(self):
        remote = {**player_result(), "allPlayerGameScores": {"nodes": []}}
        result = perf.normalize_player(self.player, remote, 15)
        self.assertEqual(result["summary"]["matches_played"], 0)
        self.assertIsNone(result["summary"]["average_score"])

    def test_transient_errors_do_not_erase_published_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalogue = root / "players.json"
            output = root / "performance.json"
            catalogue.write_text(json.dumps({"players": [self.player]}), encoding="utf-8")
            prior = {"players": {"wd:Q74548": {"games": [{"id": "old"}]}}}
            output.write_text(json.dumps(prior), encoding="utf-8")
            with patch.object(perf, "CATALOGUE", catalogue), patch.object(perf, "OUTPUT", output), \
                 patch.dict("os.environ", {"SORARE_API_KEY": "test-value"}):
                with self.assertRaises(RuntimeError):
                    perf.run(request_func=lambda *args: (_ for _ in ()).throw(RuntimeError("Unavailable")))
            self.assertEqual(json.loads(output.read_text(encoding="utf-8")), prior)

    def test_valid_player_saves_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalogue = root / "players.json"
            output = root / "performance.json"
            catalogue.write_text(json.dumps({"players": [self.player]}), encoding="utf-8")
            with patch.object(perf, "CATALOGUE", catalogue), patch.object(perf, "OUTPUT", output), \
                 patch.object(perf.time, "sleep"), patch.dict("os.environ", {"SORARE_API_KEY": "test-value"}):
                result = perf.run(request_func=lambda *args: player_result())
            self.assertEqual(result["coverage"]["players_updated"], 1)
            self.assertEqual(result["coverage"]["game_scores"], 5)
            self.assertEqual(result["players"][self.player["id"]]["summary"]["average_score"], 63)
            self.assertIn("+00:00", result["players"][self.player["id"]]["retrieved_at"])
            self.assertEqual(result["players"][self.player["id"]]["period_end"], "2026-10-20")
            self.assertIn("+00:00", result["generated_at_utc"])
            self.assertTrue(output.exists())


    def test_compact_query_keeps_only_supported_basic_stats(self):
        self.assertIn("minsPlayed", perf.CORE_QUERY)
        self.assertNotIn("accurateLongBalls", perf.CORE_QUERY)
        self.assertIn("allPlayerGameScores", perf.CORE_QUERY)

    def test_auth_header_supports_optional_user_token(self):
        with patch.dict("os.environ", {
            "SORARE_ACCESS_TOKEN": "example-token", "SORARE_JWT_AUD": "nz-radar",
        }):
            headers = perf.auth_headers("example-key")
        self.assertEqual(headers["APIKEY"], "example-key")
        self.assertEqual(headers["Authorization"], "Bearer example-token")
        self.assertEqual(headers["JWT-AUD"], "nz-radar")

    def test_fallback_handles_rejected_detailed_query(self):
        import io
        class Response:
            def __init__(self, payload):
                self.payload = payload
            def __enter__(self):
                return io.BytesIO(json.dumps(self.payload).encode("utf-8"))
            def __exit__(self, *args):
                return False
        calls = []
        def fake_urlopen(request, timeout):
            body = json.loads(request.data)
            calls.append(body["query"])
            if len(calls) == 1:
                return Response({"errors": [{"message":
                    "Cannot query field 'sampleField' on type 'PlayerGameStats'."}]})
            return Response({"data": {"anyPlayer": player_result()}})
        with patch.object(perf, "urlopen", side_effect=fake_urlopen):
            result = perf.request_player("chris-wood", 15, "example-key")
        self.assertEqual(result["collection_detail"], "core")
        self.assertEqual(len(calls), 2)
        self.assertNotIn("successfulFinalThirdPasses", calls[1])

    def test_empty_success_does_not_overwrite_existing_matches(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            catalogue = root / "players.json"
            output = root / "performance.json"
            catalogue.write_text(json.dumps({"players": [self.player]}), encoding="utf-8")
            previous = {"players": {self.player["id"]: {
                "games": [{"id": "old-score"}],
                "summary": {"matches_played": 1},
                "retrieved_at": "2026-10-01T10:00:00+00:00",
                "period_start": "2026-09-01", "period_end": "2026-09-30"}}}
            output.write_text(json.dumps(previous), encoding="utf-8")
            no_scores = {**player_result(), "allPlayerGameScores": {"nodes": []}}
            with patch.object(perf, "CATALOGUE", catalogue), patch.object(perf, "OUTPUT", output), \
                 patch.object(perf.time, "sleep"), patch.dict("os.environ", {"SORARE_API_KEY": "test"}):
                result = perf.run(request_func=lambda *args: no_scores)
            record = result["players"][self.player["id"]]
            self.assertEqual(record["games"], [{"id": "old-score"}])
            self.assertEqual(record["retrieved_at"], "2026-10-01T10:00:00+00:00")
            self.assertEqual(record["period_end"], "2026-09-30")
            self.assertIn("+00:00", record["last_checked_at"])


if __name__ == "__main__":
    unittest.main()
