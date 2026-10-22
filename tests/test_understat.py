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
                {"id": "wd:Q999", "name": "Marko Stamenic", "nationalities": ["New Zealand"], "gender": "Men"},
            ], [path])
            self.assertEqual(len(found), 1)
            self.assertEqual(found[0]["understat_id"], "1234")
            self.assertEqual(found[0]["status"], "needs_review")

    def test_understat_embedded_json_shots(self):
        # Source-page format: shotsData = JSON.parse('escaped json')
        encoded = json.dumps(self.shots).replace('"', r'\x22')
        html = "<script>var shotsData = JSON.parse('" + encoded + "');</script>"
        shots = source.parse_shots(html)
        self.assertEqual(len(shots), 2)
        self.assertEqual(shots[0]["X"], "0.90")

    def test_existing_data_survives_empty_mapping(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            players = root / "players.json"
            players.write_text('{"players":[]}', encoding="utf-8")
            mapping = root / "map.csv"
            mapping.write_text("player_id,understat_id,status,evidence_url\n", encoding="utf-8")
            output = root / "existing.json"
            prior = {"players": {"wd:Q7": {"understat_id": "123", "shots": [{"x": 0.3}]}}}
            output.write_text(json.dumps(prior), encoding="utf-8")
            with patch.object(source, "PLAYERS", players), patch.object(source, "MAPPING", mapping), patch.object(
                source, "OUTPUT", output
            ):
                result = source.run()
            self.assertEqual(result, prior)

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


    def test_understat_id_dict_csv_and_aliases(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "id_dict.csv"
            path.write_text(
                "Understat_ID,FPL_ID,Understat_Name,FPL_Name\n"
                "4456,109,Chris Wood,Chris Wood\n"
                "8888,111,Benjamin Old,Ben Old\n", encoding="utf-8")
            players = [
                {"id": "wd:Q74548", "name": "Chris Wood", "nationalities": ["New Zealand"], "gender": "Men"},
                {"id": "wd:Q106939313", "name": "Ben Old", "nationalities": ["New Zealand"], "gender": "Men"},
                {"id": "wd:Q999", "name": "Not Kiwi", "nationalities": ["England"], "gender": "Men"},
            ]
            found = finder.discover(players, [path], {"wd:Q106939313": ["Benjamin Old"]})
            self.assertEqual(len(found), 2)
            self.assertEqual({p["understat_id"] for p in found}, {"4456", "8888"})
            self.assertEqual(next(p for p in found if p["understat_id"] == "8888")["match_method"], "alias")
            self.assertTrue(all(p["status"] == "needs_review" for p in found))

    def test_excludes_unverified_nz_and_women(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "players.json"
            path.write_text(json.dumps([
                {"id": "1", "player_name": "Potential Player"},
                {"id": "2", "player_name": "NZ Woman"},
                {"id": "3", "player_name": "Chris Wood"},
            ]), encoding="utf-8")
            players = [
                {"id": "wd:1", "name": "Potential Player", "nationalities": ["New Zealand"],
                 "eligibility_status": "potential_to_verify", "gender": "Men"},
                {"id": "wd:2", "name": "NZ Woman", "nationalities": ["New Zealand"], "gender": "Women"},
                {"id": "wd:3", "name": "Chris Wood", "nationalities": ["New Zealand"], "gender": "Men"},
            ]
            found = finder.discover(players, [path])
            self.assertEqual([p["player_id"] for p in found], ["wd:3"])



    def test_rejected_understat_homonym_stays_excluded(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            league_dir = root / "league_exports"
            league_dir.mkdir()
            (league_dir / "serie_a.csv").write_text(
                "id,player_name,team_title\n"
                "11040,Julius Beck,Spezia\n"
                "4456,Chris Wood,Nottingham Forest\n", encoding="utf-8")
            catalogue = root / "players.json"
            catalogue.write_text(json.dumps({"players": [
                {"id": "wd:Q6309673", "name": "Julius Beck",
                 "nationalities": ["New Zealand"], "gender": "Men"},
                {"id": "wd:Q74548", "name": "Chris Wood",
                 "nationalities": ["New Zealand"], "gender": "Men"},
            ]}), encoding="utf-8")
            rejected = root / "rejected.csv"
            rejected.write_text(
                "player_id,understat_id,reason,evidence_url\n"
                "wd:Q6309673,11040,Historical namesake,https://example.org\n",
                encoding="utf-8")
            aliases = root / "aliases.csv"
            aliases.write_text("player_id,alias\n", encoding="utf-8")
            verified = root / "verified.csv"
            verified.write_text("player_id,understat_id,status,evidence_url\n", encoding="utf-8")
            output = root / "candidates.csv"
            with patch.object(finder, "PLAYERS", catalogue), \
                 patch.object(finder, "LEAGUES", league_dir), \
                 patch.object(finder, "ALIASES", aliases), \
                 patch.object(finder, "VERIFIED", verified), \
                 patch.object(finder, "REJECTED", rejected), \
                 patch.object(finder, "CANDIDATES", output):
                finder.run()
            rows = output.read_text(encoding="utf-8")
            self.assertIn("Chris Wood", rows)
            self.assertNotIn("Julius Beck", rows)



if __name__ == "__main__":
    unittest.main()
