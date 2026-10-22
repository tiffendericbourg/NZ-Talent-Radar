"""Identity-only Understat linking tests; no network needed."""
import unittest
from datetime import date

from scripts.link_understat import make_links


class UnderstatLinkTests(unittest.TestCase):
    def setUp(self):
        self.catalogue = {"players": [
            {"id": "wd:Q74548", "name": "Chris Wood", "gender": "Men",
             "nationalities": ["New Zealand"], "eligibility_status": "confirmed_international"},
            {"id": "wd:Q150289", "name": "Winston Reid", "gender": "Men",
             "nationalities": ["New Zealand"], "eligibility_status": "confirmed_international"},
            {"id": "wd:Q999", "name": "Unverified", "gender": "Men",
             "nationalities": [], "eligibility_status": "potential_to_verify"},
            {"id": "wd:Q888", "name": "NZ woman", "gender": "Women",
             "nationalities": ["New Zealand"], "eligibility_status": "confirmed_international"},
        ]}
        self.row = {
            "player_id": "wd:Q74548", "understat_id": "4456", "status": "confirmed",
            "evidence_url": "https://github.com/vaastav/Fantasy-Premier-League",
        }

    def test_publishes_identity_without_inventing_shots(self):
        result = make_links(self.catalogue, [self.row], date(2026, 10, 22))
        self.assertEqual(result["confirmed"], 1)
        self.assertEqual(result["players"]["wd:Q74548"]["understat_id"], "4456")
        self.assertEqual(result["players"]["wd:Q74548"]["source_url"], "https://understat.com/player/4456")
        self.assertNotIn("shots", result["players"]["wd:Q74548"])

    def test_ignores_unreviewed_candidates(self):
        row = dict(self.row, status="needs_review")
        self.assertEqual(make_links(self.catalogue, [row])["confirmed"], 0)

    def test_rejects_duplicate_understat_id(self):
        other = dict(self.row, player_id="wd:Q150289")
        with self.assertRaises(ValueError):
            make_links(self.catalogue, [self.row, other])

    def test_rejects_duplicate_catalogue_id(self):
        with self.assertRaises(ValueError):
            make_links(self.catalogue, [self.row, self.row])

    def test_rejects_unknown_or_unverified_player(self):
        for player_id in ("wd:Q999", "wd:Q888", "wd:missing"):
            with self.subTest(player_id=player_id), self.assertRaises(ValueError):
                make_links(self.catalogue, [dict(self.row, player_id=player_id)])

    def test_rejects_missing_evidence_and_bad_id(self):
        for changes in ({"evidence_url": ""}, {"evidence_url": "http://example.org"},
                        {"understat_id": "abc"}, {"understat_id": "0"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                make_links(self.catalogue, [dict(self.row, **changes)])


if __name__ == "__main__":
    unittest.main()
