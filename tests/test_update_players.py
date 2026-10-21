import unittest
from datetime import date
from scripts.update_players import age_on, overlay_manual, club_from_claims

class UpdateTests(unittest.TestCase):
    def test_age(self):
        self.assertEqual(age_on("2000-12-31", date(2026,10,21)), 25)
        self.assertIsNone(age_on(None, date(2026,10,21)))
    def test_ambiguous_club(self):
        self.assertIsNone(club_from_claims([{"mainsnak":{"datavalue":{"value":{"id":"Q1"}}},"qualifiers":{"P580":[{}]}},{"mainsnak":{"datavalue":{"value":{"id":"Q2"}}},"qualifiers":{"P580":[{}]}}]))
    def test_manual_override(self):
        entries={"wd:Q1":{"id":"wd:Q1","name":"Original","sources":[],"birth_date":None}}
        overlay_manual(entries,[{"wikidata_id":"Q1","name":"Override"}],date(2026,10,21))
        self.assertEqual(entries["wd:Q1"]["name"],"Override")
if __name__ == "__main__": unittest.main()
