# NZ Talent Radar

**Discovering New Zealand football talent worldwide.**

A static, source-linked football player catalogue for New Zealand. Built with React, Vite, Python and GitHub Actions. No backend or paid API.

## Live site
After GitHub Pages is enabled: https://tiffendericbourg.github.io/NZ-Talent-Radar/

## Local development
```bash
npm install
npm run dev
python -m unittest discover -s tests -v
python scripts/update_players.py
```

The Python script needs an internet connection to Wikidata; the website uses only the published JSON file.

## How the data works
- `scripts/update_players.py` uses six targeted Wikidata queries: New Zealand citizenship, sporting nationality, senior national team membership, and birthplaces (country/cities/one administrative level). The same search includes women's and men's footballers.
- Wikidata entity data supplies birth dates, positions, team memberships, country for sport, citizenship, and source IDs. Related locations and club names are loaded separately so we avoid downloading thousands of historical team records.
- A club is shown only when a dated, unambiguous membership is available. Historical or national teams are never treated as clubs when identifiable. Missing values stay empty; the website does not guess.
- `data/manual_players.csv` holds manual additions and corrections. Filled CSV cells override Wikidata; matching Wikidata IDs preserve stable identities. A player without a QID is merged only when full name and exact birth date match one Wikidata player.
- `public/data/players.json` holds the snapshot consumed by React.
- On timeouts or rate limits, requests are retried carefully. If the update fails, **the existing JSON is preserved**; a partial or empty download is never published. No fake statistics are generated.
- The offline tests (`python -m unittest discover -s tests -v`) cover CSV corrections, duplicate detection, conservative club selection, failed requests, and JSON generation.

There are three research categories: `confirmed_international` (documented NZ senior national side), `nz_nationality` (documented NZ citizenship) and `potential_to_verify` (possible NZ connection). **These are not legal FIFA eligibility determinations.** Missing data remain blank. Club memberships can be incomplete or outdated.

The initial source-linked catalogue contains 16 real players (9 men, 7 women), including two players aged under 23 on 21 October 2026. The initial catalogue is a verified seed, **not a completed bulk Wikidata import**. The collection pipeline expands it when an online GitHub Actions run succeeds. Current clubs are deliberately omitted from seed records unless recently checked.

## How to add or correct a player

Open `data/manual_players.csv` and add one row. Use the Wikidata ID (for example, `Q74548`) if known. Otherwise, provide a consistent `manual_id`. Only fill values you have verified and include a public `source_url`. `nationalities` can contain multiple values separated by `|`. Leave unknown fields empty.

Do not mark a person as `confirmed_international` solely on birthplace or citizenship. Current club and international eligibility should be checked against primary football sources when possible. The first Wikidata import has not been independently certified as exhaustive.

## First full collection

Every push to `main` triggers the workflow, which runs the importer using GitHub-hosted network access. In the **Actions → Update data and deploy** run, open the **Report collection results** step or the run summary: it shows total player profiles, players under 23, women, known clubs, overseas clubs and whether any discovery queries failed. New records are committed back to `public/data/players.json`, and the report is updated. If the importer fails, the last snapshot remains available. The source returns only what Wikidata currently documents; it cannot guarantee completeness.

If a push does not start a run, check that GitHub Actions is enabled in repository settings. This is separate from GitHub Pages, which must be enabled for website deployment.

## Sorare player matching (experimental)

The Sorare key must be saved as a GitHub Actions repository secret named `SORARE_API_KEY`. **Never** put it in React, JSON, a CSV file, Git history or an issue.

- `scripts/update_sorare.py` makes **read-only** football GraphQL requests, using the key in the `APIKEY` HTTP header.
- It guesses player slugs from existing names, but only saves `sorare_slug` automatically when **full name and exact date of birth both match** and a known club does not conflict.
- Partial or conflicting matches are written to `public/data/sorare_matches.json` with status `needs_review`. They never alter player records. Unknown players are marked `not_found`, not invented.
- Existing confirmed slugs are preserved, and an API/network error cancels the update before modifying `players.json`.
- The workflow `.github/workflows/update-sorare.yml` can be run via **Actions → Match players on Sorare → Run workflow**, using the `limit` parameter (default 50 players per run; 0 means all). It also checks weekly on Mondays after the Wikidata workflow.
- When enabled, modifying the Sorare script, its tests or workflow on `main` triggers an initial run. In **Actions**, check the "Match player identities" logs and run summary to see if Sorare accepted the key.
- The key provides API rate limits but does not replace account JWT authentication for private API fields. This stage queries only public player information; there is no login, purchase, market or private user data.
- Sorare API schemas change. If the GraphQL query fails, check the current [official Sorare API docs](https://github.com/sorare/api) and update the query rather than trying to force an unverified match.

Run offline tests with `python -m unittest discover -s tests -p 'test_sorare.py' -v`. For local runs, export `SORARE_API_KEY` as an environment variable; don't store it in a tracked file.

The full Sorare match list is not yet verified against the live API. No scores or performance statistics are integrated at this stage.

## GitHub Pages
In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. Run **Actions → Update data and deploy → Run workflow** or push to `main`. The workflow also runs every Monday at 05:20 UTC, builds the static site, and deploys it with GitHub's official Pages actions.

## Files
- `src/App.jsx` — navigation, dashboard, table filters and player profiles
- `src/styles.css` — responsive dark design
- `scripts/update_players.py` — Wikidata extraction and CSV merge
- `data/manual_players.csv` — reviewed records and corrections
- `public/data/players.json` — site-ready data
- `public/data/collection_report.json` — collection coverage and missing-field audit; initial report explicitly says full import is pending
- `scripts/update_sorare.py` — secure Sorare identity matching
- `public/data/sorare_matches.json` — generated confirmed/review/no-result match audit (after successful API run)
- `.github/workflows/update-data.yml` — automation and deployment

Sorare identity matching is in progress; Sorare performance statistics and rankings remain postponed. This project is independent of New Zealand Football. Wikidata data are CC0; records link to their source pages.
