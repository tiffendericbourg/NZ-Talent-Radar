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
        # The repository's real audited decisions must not affect tiny test fixtures.
        self.real_load_reviews = sorare.load_reviews
        self.reviews_patcher = patch.object(sorare, "load_reviews", return_value={})
        self.reviews_patcher.start()
        self.addCleanup(self.reviews_patcher.stop)

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

    def test_stale_club_does_not_override_exact_name_and_birth(self):
        player = {**self.wood, "club": "Club A"}
        candidate = {"slug": "chris-wood", "displayName": "Chris Wood",
                     "birthDate": "1991-12-07", "activeClub": {"name": "Club B"}}
        self.assertEqual(sorare.match_identity(player, candidate), "confirmed")

    def test_lookup_not_found(self):
        with patch.object(sorare.time, "sleep"):
            result = sorare.lookup_player(self.wood, "not-a-real-key",
                                          request_func=lambda query, vars, key: None)
        self.assertEqual(result["status"], "not_found")

    def test_lookup_confirmed(self):
        def request(query, vars, key):
            self.assertEqual(key, "not-a-real-key")
            self.assertIn("searchPlayers", query)
            self.assertEqual(vars["name"], "Chris Wood")
            return [{"slug": "chris-wood", "displayName": "Chris Wood",
                     "birthDate": "1991-12-07"}]
        with patch.object(sorare.time, "sleep"):
            result = sorare.lookup_player(self.wood, "not-a-real-key", request_func=request)
        self.assertEqual(result["status"], "confirmed")

    def test_graphql_search_parses_sorare_hits(self):
        """The schema uses searchPlayers, not football.player."""
        class FakeResponse:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
        payload = {"data": {"searchPlayers": {
            "hits": [{"player": {"slug": "chris-wood", "displayName": "Chris Wood",
                                 "birthDate": "1991-12-07",
                                 "activeClub": {"name": "Nottingham Forest"}}}]
        }}}
        with patch.object(sorare, "urlopen", return_value=FakeResponse()) as opener, patch.object(
            sorare.json, "load", return_value=payload
        ):
            candidates = sorare.graphql_request(sorare.PLAYER_QUERY, {"name": "Chris Wood"}, "fake-only")
            self.assertEqual(len(candidates), 1)
            self.assertEqual(candidates[0]["slug"], "chris-wood")
            request = opener.call_args.args[0]
            self.assertEqual(request.get_header("Apikey"), "fake-only")
            request_body = json.loads(request.data)
            self.assertIn("searchPlayers", request_body["query"])
            self.assertNotIn("football {", request_body["query"])

    def test_multiple_matching_identities_need_review(self):
        twins = [{"slug": "player-a", "displayName": "Chris Wood",
                  "birthDate": "1991-12-07"},
                 {"slug": "player-b", "displayName": "Chris Wood",
                  "birthDate": "1991-12-07"}]
        outcome = sorare.lookup_player(self.wood, "fake", request_func=lambda *args: twins)
        self.assertEqual(outcome["status"], "needs_review")

    def test_search_error_does_not_expose_api_key(self):
        payload = {"errors": [{"message": "Cannot query field 'player' on type FootballRoot."}]}
        class FakeResponse:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
        with patch.object(sorare, "urlopen", return_value=FakeResponse()), patch.object(
            sorare.json, "load", return_value=payload
        ):
            with self.assertRaisesRegex(RuntimeError, "schema mismatch") as exc:
                sorare.graphql_request(sorare.PLAYER_QUERY, {"name": "Chris Wood"}, "fake-only")
            self.assertNotIn("fake-only", str(exc.exception))

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


    def test_incremental_second_run_checks_next_player(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "players.json"
            report = Path(folder) / "matches.json"
            p.write_text(json.dumps({"players": [
                {**self.wood}, {"id": "wd:Q2", "name": "Player Two",
                                 "birth_date": "2001-01-01", "sorare_slug": None},
            ]}), encoding="utf-8")

            def not_found(player, key):
                return {"status": "not_found", "candidate": None}

            with patch.object(sorare, "PLAYERS_FILE", p), patch.object(
                sorare, "MATCHES_FILE", report
            ), patch.object(sorare, "lookup_player", side_effect=not_found) as lookup, patch.dict(
                sorare.os.environ, {"SORARE_API_KEY": "test-only"}
            ):
                sorare.run(limit=1)
                self.assertEqual(lookup.call_count, 1)
                sorare.run(limit=1)
                self.assertEqual(lookup.call_count, 2)

            output = json.loads(report.read_text(encoding="utf-8"))
            self.assertEqual(output["checked_so_far"], 2)
            self.assertEqual(output["remaining"], 0)
            self.assertEqual(output["not_found"], 2)


    def test_fuzzy_search_does_not_create_false_review(self):
        """A random Sorare hit must not be recommended for another NZ player."""
        results = [{"slug": "aaron-anselmino", "displayName": "Aarón Anselmino",
                    "birthDate": "2005-04-29", "sport": "FOOTBALL"}]
        player = {**self.wood, "name": "Aaran Lines"}
        outcome = sorare.lookup_player(player, "test", request_func=lambda *args: results)
        self.assertEqual(outcome, {"status": "not_found", "candidate": None})

    def test_exact_name_with_wrong_birth_is_review_only(self):
        results = [{"slug": "chris-wood", "displayName": "Chris Wood",
                    "birthDate": "2000-12-07", "sport": "FOOTBALL"}]
        outcome = sorare.lookup_player(self.wood, "test", request_func=lambda *args: results)
        self.assertEqual(outcome["status"], "needs_review")

    def test_existing_false_fuzzy_hits_are_cleaned(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "players.json"
            report = Path(folder) / "matches.json"
            player = {**self.wood, "name": "Aaran Lines"}
            p.write_text(json.dumps({"players": [player]}), encoding="utf-8")
            report.write_text(json.dumps({"matches": [{
                "player_id": player["id"], "name": "Aaran Lines",
                "status": "needs_review", "sorare_slug": "aaron-anselmino",
                "sorare_name": "Aarón Anselmino",
                "sorare_birth_date": "2005-04-29", "sorare_club": "Chelsea"
            }]}), encoding="utf-8")
            with patch.object(sorare, "PLAYERS_FILE", p), patch.object(
                sorare, "MATCHES_FILE", report
            ), patch.dict(sorare.os.environ, {"SORARE_API_KEY": "fake-test"}), patch.object(
                sorare, "lookup_player", return_value={"status": "not_found", "candidate": None}
            ):
                sorare.run(limit=1)
            result = json.loads(report.read_text(encoding="utf-8"))
            self.assertEqual(result["not_found"], 1)
            self.assertEqual(result["matches"][0]["sorare_slug"], None)


    def test_partial_batch_is_saved_on_later_request_error(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            player_file = root / "players.json"
            report = root / "matches.json"
            player_file.write_text(json.dumps({"players": [
                {**self.wood},
                {"id": "wd:other", "name": "Second Player",
                 "birth_date": "2000-01-01", "sorare_slug": None}
            ]}), encoding="utf-8")
            def find(player, api_key):
                if player["id"] == "wd:other":
                    raise RuntimeError("Sorare HTTP 429")
                return {"status": "confirmed", "candidate": {
                    "slug": "chris-wood", "displayName": "Chris Wood",
                    "birthDate": "1991-12-07", "activeClub": None
                }}
            with patch.object(sorare, "PLAYERS_FILE", player_file), patch.object(
                sorare, "MATCHES_FILE", report
            ), patch.object(sorare, "lookup_player", side_effect=find), patch.object(
                sorare.time, "sleep"
            ), patch.dict(sorare.os.environ, {"SORARE_API_KEY": "fake-test"}):
                sorare.run(limit=0)
            result = json.loads(report.read_text())
            self.assertEqual(result["confirmed"], 1)
            self.assertTrue(result["batch_interrupted"])
            self.assertEqual(result["remaining"], 1)
            self.assertEqual(json.loads(player_file.read_text())["players"][0]["sorare_slug"], "chris-wood")


    def test_audited_confirmed_and_rejected_decisions(self):
        players = [
            {"id": "wd:Q1", "name": "Matching player", "sorare_slug": None},
            {"id": "wd:Q2", "name": "Wrong homonym", "sorare_slug": None},
        ]
        stored = {
            "wd:Q1": {"player_id": "wd:Q1", "status": "needs_review",
                      "sorare_slug": "matching-player"},
            "wd:Q2": {"player_id": "wd:Q2", "status": "needs_review",
                      "sorare_slug": "wrong-homonym"},
        }
        decisions = {
            "wd:Q1": {"sorare_slug": "matching-player", "status": "confirmed",
                      "review_reason": "Verified full name and birth date",
                      "review_source": "https://example.org/matching"},
            "wd:Q2": {"sorare_slug": "wrong-homonym", "status": "rejected",
                      "review_reason": "Different birth date and country",
                      "review_source": "https://example.org/rejected"},
        }
        sorare.apply_reviews(players, stored, decisions, "2026-10-21")
        self.assertEqual(players[0]["sorare_slug"], "matching-player")
        self.assertIsNone(players[1]["sorare_slug"])
        self.assertEqual(stored["wd:Q1"]["status"], "confirmed")
        self.assertEqual(stored["wd:Q2"]["status"], "rejected")
        self.assertIsNone(stored["wd:Q2"]["sorare_slug"])
        self.assertEqual(stored["wd:Q2"]["rejected_candidate_slug"], "wrong-homonym")

    def test_review_csv_loader_rejects_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "identity_reviews.csv"
            path.write_text(
                "player_id,sorare_slug,decision,reason,evidence_url\n"
                "wd:Q1,p-1,confirmed,same person,https://example.org/1\n"
                "wd:Q1,p-2,rejected,different person,https://example.org/2\n",
                encoding="utf-8"
            )
            with patch.object(sorare, "REVIEWS_FILE", path):
                with self.assertRaises(ValueError):
                    self.real_load_reviews()



if __name__ == "__main__":
    unittest.main()
