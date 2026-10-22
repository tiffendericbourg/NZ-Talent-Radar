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
        self.assertEqual(result["summary"]["totals"]["goals"], 1)
        self.assertIsNone(result["summary"]["totals"]["goalAssist"])

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
            self.assertTrue(output.exists())


if __name__ == "__main__":
    unittest.main()
