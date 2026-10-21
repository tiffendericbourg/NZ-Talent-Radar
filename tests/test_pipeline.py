"""Offline checks: no external API calls required."""
import csv
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from scripts import update_players as importer


def statement(qid, start=None, end=None):
    qualifiers = {}
    for prop, raw in (("P580", start), ("P582", end)):
        if raw:
            qualifiers[prop] = [{"datavalue": {"value": {"time": "+" + raw + "T00:00:00Z", "precision": 11}}}]
    return {"rank": "normal", "mainsnak": {"datavalue": {"value": {"id": qid}}}, "qualifiers": qualifiers}


class ImporterTests(unittest.TestCase):
    def test_discovery_covers_men_women_and_nz_birthplaces(self):
        queries = "\n".join(importer.QUERIES)
        for marker in ("P27", "P1532", "P54", "Q175315", "Q503755", "P17", "P131"):
            self.assertIn(marker, queries)

    def test_club_needs_clear_current_membership(self):
        today = date(2026, 10, 21)
        self.assertEqual(importer.club_from_claims([statement("Q123", "2025-01-01", None)], today), "Q123")
        self.assertIsNone(importer.club_from_claims([statement("Q123", "2022-01-01", "2024-01-01")], today))
        self.assertIsNone(importer.club_from_claims([statement("Q123")], today))
        self.assertIsNone(importer.club_from_claims([
            statement("Q123", "2025-01-01", None), statement("Q456", "2025-09-01", None)
        ], today))
        self.assertEqual(importer.club_from_claims([
            statement("Q175315", "2025-01-01"), statement("Q123", "2025-01-01")
        ], today), "Q123")
        self.assertIsNone(importer.club_from_claims([statement("Q123", "2027-01-01")], today))

    def test_manual_correction_and_no_duplicate_qid(self):
        records = {"wd:Q1": {"id": "wd:Q1", "name": "Wikidata name", "birth_date": "2000-01-01",
                             "sources": ["https://www.wikidata.org/wiki/Q1"], "nationalities": []}}
        importer.overlay_manual(records, [{"wikidata_id": "Q1", "name": "Corrected player",
                                           "position": "Forward", "nationalities": "New Zealand|Italy",
                                           "source_url": "https://example.org/players/1"}], date(2026, 10, 21))
        self.assertEqual(len(records), 1)
        self.assertEqual(records["wd:Q1"]["position"], "Forward")
        self.assertEqual(records["wd:Q1"]["nationalities"], ["New Zealand", "Italy"])
        self.assertEqual(len(records["wd:Q1"]["sources"]), 2)

    def test_failed_download_preserves_published_json(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            output = root / "public/data/players.json"
            output.parent.mkdir(parents=True)
            output.write_text('{"players":[{"id":"manual:keep"}]}', encoding="utf-8")
            manual = root / "manual.csv"
            manual.write_text("manual_id,wikidata_id,name\n", encoding="utf-8")
            before = output.read_bytes()
            with patch.object(importer, "OUTPUT", output), patch.object(importer, "MANUAL", manual), patch.object(
                importer, "request", side_effect=OSError("Offline")
            ):
                with self.assertRaises(OSError):
                    importer.run()
            self.assertEqual(output.read_bytes(), before)

    def test_end_to_end_generation_without_internet(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            output = root / "players.json"
            output.write_text('{"players":[]}', encoding="utf-8")
            manual = root / "manual.csv"
            with manual.open("w", encoding="utf-8", newline="") as file:
                writer = csv.DictWriter(file, fieldnames=["manual_id", "wikidata_id", "name", "position",
                                                           "nationalities", "source_url"])
                writer.writeheader()
                writer.writerow({"wikidata_id": "Q74548", "name": "Chris Wood", "position": "Centre-forward",
                                 "nationalities": "New Zealand"})
                writer.writerow({"manual_id": "scout-1", "name": "Reviewed youth footballer",
                                 "source_url": "https://example.org/youth"})
            player = {
                "labels": {"en": {"value": "Chris Wood"}},
                "claims": {
                    "P27": [statement("Q664")], "P1532": [statement("Q664")],
                    "P19": [statement("QPLACE")], "P21": [statement("Q6581097")],
                    "P413": [statement("QFORWARD")], "P54": [statement("QCLUB", "2025-01-01")],
                    "P569": [{"mainsnak": {"datavalue": {"value": {
                        "time": "+1991-12-07T00:00:00Z", "precision": 11
                    }}}}],
                }
            }
            entities = {
                "Q74548": player,
                "Q664": {"labels": {"en": {"value": "New Zealand"}}},
                "QPLACE": {"labels": {"en": {"value": "Auckland"}},
                           "claims": {"P17": [statement("Q664")]}},
                "QCLUB": {"labels": {"en": {"value": "Example FC"}},
                          "claims": {"P17": [statement("Q30")]}},
                "Q30": {"labels": {"en": {"value": "United States"}}},
                "QFORWARD": {"labels": {"en": {"value": "forward"}}},
                "Q6581097": {"labels": {"en": {"value": "male"}}},
                "Q175315": {"labels": {"en": {"value": "New Zealand men national team"}}},
                "Q503755": {"labels": {"en": {"value": "New Zealand women national team"}}},
            }
            def fake_request(url, params):
                if "sparql" in url:
                    return {"results": {"bindings": [{"person": {
                        "value": "http://www.wikidata.org/entity/Q74548"
                    }}]}}
                return {"entities": {qid: entities[qid] for qid in params["ids"].split("|")}}
            with patch.object(importer, "OUTPUT", output), patch.object(importer, "MANUAL", manual), patch.object(
                importer, "request", side_effect=fake_request
            ), patch.object(importer.time, "sleep"):
                importer.run()
            generated = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(len(generated["players"]), 2)
            wood = next(p for p in generated["players"] if p["id"] == "wd:Q74548")
            self.assertEqual(wood["name"], "Chris Wood")
            self.assertEqual(wood["position"], "Centre-forward")
            self.assertEqual(wood["birth_country"], "New Zealand")
            self.assertEqual(wood["club"], "Example FC")
            self.assertEqual(wood["club_country"], "United States")
            self.assertEqual(wood["country_for_sport"], ["New Zealand"])
            self.assertEqual(wood["eligibility_status"], "nz_nationality")
            self.assertTrue(any(p["id"] == "manual:scout-1" for p in generated["players"]))


if __name__ == "__main__":
    unittest.main()
