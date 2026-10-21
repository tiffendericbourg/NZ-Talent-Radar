"""Understat tests: local fixtures only, no site requests or invented published data."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import update_understat as source
from scripts import discover_understat as finder


class UnderstatTests(unittest.TestCase):
    def setUp(self):
        self.shots = [
            {"id": "101", "player_id": "42", "X": "0.90", "Y": "0.45", "xG": "0.31",
             "result": "Goal", "date": "2026-01-02", "situation": "OpenPlay"},
            {"id": "102", "player_id": "42", "X": "0.8", "Y": "0.55", "xG": "0.13",
             "result": "SavedShot", "date": "2026-01-03", "situation": "Penalty"},
        ]

    def test_parses_json_and_spatial_coordinates(self):
        source_shots = source.parse_shots(json.dumps({"shots": self.shots}))
        clean = source.normalize_shots(source_shots, "42")
        self.assertEqual(len(clean), 2)
        self.assertEqual(clean[0]["x"], 0.90)
        self.assertEqual(clean[0]["y"], 0.45)
        self.assertEqual(clean[0]["xg"], 0.31)
        self.assertEqual(source.summarize(clean)["goals"], 1)
        self.assertEqual(source.summarize(clean)["shots"], 2)
        self.assertEqual(source.summarize(clean)["xg"], 0.44)
        self.assertEqual(source.summarize(clean)["conversion_pct"], 50.0)

    def test_season_summary(self):
        shots = [dict(x, season="2025") for x in source.normalize_shots(self.shots, "42")]
        by_season = source.summarize_seasons(shots)
        self.assertEqual(by_season["2025"]["shots"], 2)
        self.assertEqual(by_season["2025"]["xg"], 0.44)

    def test_candidate_matching_needs_manual_review(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "EPL_2025.json"
            path.write_text(json.dumps({"players": [
                {"id": "1234", "player_name": "Marko Stamenić"},
                {"id": "999", "player_name": "Completely different name"}
            ]}), encoding="utf-8")
            found = finder.discover([
                {"id": "wd:Q999", "name": "Marko Stamenic"},
            ], [path])
            self.assertEqual(len(found), 1)
            self.assertEqual(found[0]["understat_id"], "1234")
            self.assertEqual(found[0]["status"], "needs_review")

    def test_drops_invalid_or_other_players(self):
        corrupt = self.shots + [
            {"id": "3", "player_id": "999", "X": "0.9", "Y": "0.3", "xG": "0.5"},
            {"id": "4", "player_id": "42", "X": "1.7", "Y": "0.3", "xG": "0.5"},
            {"id": "5", "player_id": "42", "X": "0.8", "Y": "0.3", "xG": "not-a-number"},
        ]
        self.assertEqual(len(source.normalize_shots(corrupt, "42")), 2)

    def test_no_shots_means_unknown_ratios(self):
        self.assertEqual(source.summarize([])["shots"], 0)
        self.assertIsNone(source.summarize([])["xg_per_shot"])

    def test_rejects_unrecognized_page(self):
        with self.assertRaises(ValueError):
            source.parse_shots("<html>No shot data</html>")

    def test_robot_policy_fails_closed(self):
        with patch.object(source, "urlopen", side_effect=OSError("Offline")):
            self.assertFalse(source.permitted_to_fetch("https://understat.com/player/42"))
        self.assertFalse(source.permitted_to_fetch("http://understat.com/player/42"))
        self.assertFalse(source.permitted_to_fetch("https://example.org/player/42"))

    def test_imports_only_confirmed_id_and_real_local_events(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            players = root / "players.json"
            players.write_text(json.dumps({"players": [{"id": "wd:Q74548", "name": "Chris Wood"}]}),
                               encoding="utf-8")
            csv = root / "ids.csv"
            csv.write_text("player_id,understat_id,status,evidence_url\n"
                           "wd:Q74548,42,confirmed,https://understat.com/player/42\n", encoding="utf-8")
            exports = root / "exports"
            exports.mkdir()
            (exports / "42.json").write_text(json.dumps({"shots": self.shots}), encoding="utf-8")
            output = root / "shot_data.json"
            with patch.object(source, "PLAYERS", players), patch.object(source, "MAPPING", csv), patch.object(
                source, "EXPORTS", exports
            ), patch.object(source, "OUTPUT", output):
                result = source.run()
            self.assertEqual(result["coverage"]["shots"], 2)
            self.assertEqual(result["players"]["wd:Q74548"]["stats"]["goals"], 1)
            self.assertEqual(len(result["players"]["wd:Q74548"]["shots"]), 2)

    def test_does_not_invent_missing_player(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            players = root / "players.json"
            players.write_text('{"players":[]}', encoding="utf-8")
            csv = root / "ids.csv"
            csv.write_text("player_id,understat_id,status,evidence_url\n"
                           "manual:unknown,42,confirmed,https://understat.com/player/42\n",
                           encoding="utf-8")
            output = root / "shot_data.json"
            with patch.object(source, "PLAYERS", players), patch.object(source, "MAPPING", csv), patch.object(
                source, "OUTPUT", output
            ):
                with self.assertRaises(ValueError):
                    source.run()
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
