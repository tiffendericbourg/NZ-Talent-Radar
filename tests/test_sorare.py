"""Tests for Sorare matching without a real API key or network requests."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import update_sorare as sorare


class SorareTests(unittest.TestCase):
    def setUp(self):
        self.wood = {"id": "wd:Q74548", "name": "Chris Wood",
                     "birth_date": "1991-12-07", "club": None, "sorare_slug": None}

    def test_slug_and_accents(self):
        self.assertEqual(sorare.slugify("Marko Stamenić"), "marko-stamenic")
        self.assertEqual(sorare.clean_name("Indiah-Paige Riley"),
                         sorare.clean_name("indiah paige riley"))

    def test_confirm_exact_name_and_birthday(self):
        candidate = {"slug": "chris-wood", "displayName": "Chris Wood",
                     "birthDate": "1991-12-07", "activeClub": {"name": "Forest"}}
        self.assertEqual(sorare.match_identity(self.wood, candidate), "confirmed")
        self.assertEqual(sorare.match_identity(self.wood, {**candidate, "birthDate": "1992-12-07"}),
                         "needs_review")
        self.assertEqual(sorare.match_identity(self.wood, {**candidate, "birthDate": None}),
                         "needs_review")
        self.assertEqual(sorare.match_identity(self.wood, {**candidate, "displayName": "Another Wood"}),
                         "needs_review")

    def test_club_conflict_requires_review(self):
        player = {**self.wood, "club": "Club A"}
        candidate = {"slug": "chris-wood", "displayName": "Chris Wood",
                     "birthDate": "1991-12-07", "activeClub": {"name": "Club B"}}
        self.assertEqual(sorare.match_identity(player, candidate), "needs_review")

    def test_lookup_not_found(self):
        with patch.object(sorare.time, "sleep"):
            result = sorare.lookup_player(self.wood, "not-a-real-key",
                                          request_func=lambda query, vars, key: None)
        self.assertEqual(result["status"], "not_found")

    def test_lookup_confirmed(self):
        def request(query, vars, key):
            self.assertEqual(key, "not-a-real-key")
            self.assertIn("football", query)
            return {"slug": "chris-wood", "displayName": "Chris Wood",
                    "birthDate": "1991-12-07"}
        with patch.object(sorare.time, "sleep"):
            result = sorare.lookup_player(self.wood, "not-a-real-key", request_func=request)
        self.assertEqual(result["status"], "confirmed")

    def test_missing_secret_keeps_existing_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            p = root / "players.json"
            p.write_text(json.dumps({"players": [self.wood]}), encoding="utf-8")
            report = root / "matches.json"
            with patch.object(sorare, "PLAYERS_FILE", p), patch.object(
                sorare, "MATCHES_FILE", report
            ), patch.dict(sorare.os.environ, {"SORARE_API_KEY": ""}):
                with self.assertRaises(RuntimeError):
                    sorare.run()
            self.assertEqual(json.loads(p.read_text())["players"][0]["sorare_slug"], None)
            self.assertFalse(report.exists())

    def test_end_to_end_does_not_overwrite_unverified(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            p = root / "players.json"
            p.write_text(json.dumps({"players": [self.wood, {
                "id": "wd:other", "name": "Another Player", "birth_date": "2000-01-01",
                "club": None, "sorare_slug": None
            }]}), encoding="utf-8")
            report = root / "matches.json"

            def find(player, api_key):
                if player["id"] == "wd:Q74548":
                    return {"status": "confirmed", "candidate": {
                        "slug": "chris-wood", "displayName": "Chris Wood",
                        "birthDate": "1991-12-07", "activeClub": {"name": "Forest"}
                    }}
                return {"status": "needs_review", "candidate": {
                    "slug": "another-player", "displayName": "Another Player",
                    "birthDate": "2001-01-01"
                }}

            with patch.object(sorare, "PLAYERS_FILE", p), patch.object(
                sorare, "MATCHES_FILE", report
            ), patch.object(sorare, "lookup_player", side_effect=find), patch.dict(
                sorare.os.environ, {"SORARE_API_KEY": "not-a-real-key"}
            ):
                sorare.run()
            players = json.loads(p.read_text())["players"]
            self.assertEqual(players[0]["sorare_slug"], "chris-wood")
            self.assertIsNone(players[1]["sorare_slug"])
            public_report = json.loads(report.read_text())
            self.assertEqual(public_report["confirmed"], 1)
            self.assertEqual(public_report["needs_review"], 1)
            self.assertNotIn("not-a-real-key", report.read_text())


if __name__ == "__main__":
    unittest.main()
