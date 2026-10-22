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
- It searches Sorare by player name (not by guessed slugs), but only saves `sorare_slug` automatically when **full name and exact date of birth both match** and a known club does not conflict.
- Exact-name matches with incomplete dates or conflicting clubs are written to `public/data/sorare_matches.json` with status `needs_review`. They never alter player records. Unrelated fuzzy search results and unknown players are marked `not_found`, not invented.
- Existing confirmed slugs are preserved, and an API/network error cancels the update before modifying `players.json`.
- The workflow `.github/workflows/update-sorare.yml` can be run via **Actions → Match players on Sorare → Run workflow**, using the `limit` parameter (default 10 previously unchecked players for manual runs, 200 for scheduled runs; 0 means all). It remembers previous lookup results and continues with the next group each week. Once every unmatched player has been tried, it starts a fresh checking cycle. It runs on Mondays after the Wikidata workflow.
- When enabled, modifying the Sorare script, its tests or workflow on `main` triggers an initial run. In **Actions**, check the "Check API key and Sorare GraphQL query" and "Match player identities" logs and run summary to see if Sorare accepted the key.
- The key provides API rate limits but does not replace account JWT authentication for private API fields. This stage queries only public player information; there is no login, purchase, market or private user data.
- Sorare API schemas change. If the GraphQL query fails, check the current [official Sorare API docs](https://github.com/sorare/api) and update the query rather than trying to force an unverified match.

Run offline tests with `python -m unittest discover -s tests -p 'test_sorare.py' -v`. For local runs, export `SORARE_API_KEY` as an environment variable; don't store it in a tracked file.

A first live Sorare API pass has succeeded. The remaining database is scanned in incremental batches; some footballers have no Sorare listing. No scores or performance statistics are integrated at this stage.

## Sorare manual identity audit — 21 October 2026

The original 11 uncertain matches were reviewed manually (**7 confirmed**, **4 unrelated homonyms rejected**). Additional official Sorare histories and targeted name variations were then checked on 22 October 2026. The published catalogue now has **48 confirmed Sorare identities**, **4 rejected homonyms**, and **0 unresolved manual reviews** among **1111** NZ-linked players. Other `not_found` statuses are search outcomes, not proof that the person is absent from Sorare.

Decisions and evidence are maintained in `data/sorare/identity_reviews.csv`, which is reapplied by `scripts/update_sorare.py` on each run. Rejected candidates do not become profile links. Historic Wikidata clubs are not treated as identity contradictions when the name, birth date and career match.

Approved: Bill Tuiloma, Elijah Just, Joe Bell, Luke Brooke-Smith, Matthew Garbett, Michael Boxall, Tyler Boyd. Rejected: Ethan Galbraith (Northern Irish homonym), George Campbell (US defender), Julius Beck (Danish namesake), Oliver Whyte (Scottish Olly Whyte).

**Source discrepancy corrected:** Luke Brooke-Smith's birth date is **2008-06-06**, documented by Friends of Football NZ and Sorare, rather than Wikidata's 2008-06-08. The correction is also recorded in `data/manual_players.csv` so the next Wikidata refresh does not reintroduce it. Sorare names, slugs, the reasons for approval/rejection and supporting links are preserved in the published match report.

## Expanded Sorare discovery

The script now performs an incremental **second pass** over people previously missed: first-name variants (Ben/Benjamin, Alex/Alexander, Kosta/Konstantinos), simplified first/last names, and exact date-of-birth checks. Recent footballers with club or national-team records are prioritised. It automatically links only **one unique compatible name + matching full DOB**; unclear candidates stay unlinked for human review.

A successful first-pass search does not mean complete coverage: players can appear on Sorare under different display names or middle-name slugs. Use `data/sorare/identity_reviews.csv` for carefully checked external profiles, so manual research is preserved across automatic updates. This file currently contains 49 decisions (including the initial four homonym rejections). `public/data/sorare_matches.json` reports `lookup_version` and `second_pass_remaining` to track the additional scan.

## Sorare roster cross-check — 22 October 2026

The second discovery method cross-checks Sorare's **New Zealand national-team roster** and its **Auckland City / Wellington Phoenix / Cavalry FC** player lists with the NZ Talent Radar database. This reveals player slugs with middle names that text search can miss, without relying on an unverified guess.

As of this audit: **1111 NZ-linked player records, 62 verified Sorare identities, 4 rejected homonyms, 0 manual identity reviews outstanding**. Source-backed additions include Jake Gleeson, Nikko Boxall, Jay Herdman, Matthew Foord, Jeremy Foo, Fergus Gillion, Dylan Manickum, Angus Kilkolly, Tommy Smith, Tim Payne, Max Crocombe, Lukas Kelly-Heald, Isaac Hughes and Matthew Sheridan.

Two useful data quality findings:
- **Max Crocombe** (Wikidata Q6794678) was already in the catalogue. Sorare calls him **Maxime Crocombe**; we linked his existing identity rather than creating a duplicate.
- **Isaac Hughes** (Wikidata Q125791559) had a one-day birth-date discrepancy. Independently sourced football records identify **25 March 2004** rather than **24 March 2004**; the correction is stored in `data/manual_players.csv`.

Decisions are retained in `data/sorare/identity_reviews.csv` and written into both player and audit JSON. Profiles without adequate identity evidence remain unlinked. This manual source work is separate from the automated second-pass workflow; its next run and tests must still be checked in Actions.

## Spatial scouting and Understat

The **Statistics** page and player profile **Performance** cards are now wired to static JSON:
- Overall database coverage, Sorare identity matches, age groups and club-country distribution use the existing sourced player catalogue.
- Verified Understat identities are shown as **profile links** even before any shot export exists. Once verified shots are imported, cards show **shots, goals, total xG, xG/shot, shot conversion**, plus an attacking-direction **X/Y shot map** and season breakdown.
- `public/data/understat_shots.json` starts empty on purpose; zero imported shots means **no source yet**, not that players have taken zero shots. The website renders “Not available” for missing performance stats.

### Understat extraction

Understat is a third-party data source, not a guaranteed open bulk API. It mainly tracks selected men's leagues. Do not assume it covers all NZ footballers, especially women, youth, or players in leagues outside its coverage. Understat coordinate pairs `X` and `Y` are normalized from 0 to 1; `xG` is per-shot expected goals. No spatial coordinates are invented.

1. Obtain appropriately licensed/authorized Understat player or league JSON exports and save them **locally** under `data/understat/exports/<understat_id>.json` or `data/understat/league_exports/<league>.json` (ignored by Git).
2. Run `python scripts/discover_understat.py` to find **possible** NZ player links from local league JSON or Understat/FPL `id_dict.csv` exports. Curated name variants in `data/understat/aliases.csv` help discovery; `data/understat/rejected_players.csv` prevents known homonyms from resurfacing. The output `data/understat/candidates.csv` is always `needs_review`, never auto-confirmed.
3. Manually verify the name, historic club and player identity. Record reviewed IDs and an independent HTTPS evidence link in `data/understat/verified_players.csv` (`player_id,understat_id,status,evidence_url`). The `data/understat/research_targets.csv` file records the first four resolved research targets and their seasons.
4. Run `python scripts/link_understat.py` to publish the identity-only mapping to `public/data/understat_links.json`. This file powers verified Understat profile links in the player directory and profiles, **even if no shot data are available**.
5. Run `python scripts/update_understat.py` after obtaining authorized player JSON exports. It publishes validated events to `public/data/understat_shots.json`, separately from the identity links. Run offline tests with `python -m unittest discover -s tests -p 'test_*understat.py' -v`.

Six NZ catalogue players have sourced Understat identity links: **Chris Wood → 4456**, **Winston Reid → 529**, **Liberato Cacace → 10385**, **Sarpreet Singh → 7777**, **Bill Tuiloma → 3807** (listed as *Bill Poni Tuiloma*), and **Ben Old → 12809**. Each link is backed by a historical club/season match and an evidence URL in `verified_players.csv`. For example, [Ben Old's Saint-Étienne season](https://github.com/Beautiful-Game-Oracle/The-Beautiful-Game-Oracle/blob/9dc2c5dc6844977a0e9b113f97bfbccd479b681e/understat_data/Players_Cleaned/player_seasons/Ben_Old_12809.csv) and [Cacace's Empoli seasons](https://github.com/Beautiful-Game-Oracle/The-Beautiful-Game-Oracle/blob/9dc2c5dc6844977a0e9b113f97bfbccd479b681e/understat_data/Players_Cleaned/player_seasons/Liberato_Cacace_10385.csv) confirm their player IDs. These are verified *identities*, not imported shot events. Two Understat homonyms are explicitly rejected: **Julius Beck → 11040** (modern Spezia player vs historical NZ international) and **Tommy Smith → 6029** (Huddersfield defender vs the NZ international). An exact name match is not sufficient evidence. The manual research pass checked Understat league exports across the five major leagues from 2014/15 through 2025/26 where available; incomplete seasons or absent players are not interpreted as proof of no Understat profile.

A manual GitHub Actions workflow **Build Understat shot maps** is ready. Remote page fetching is **disabled by default**. Its optional `--fetch` code checks `robots.txt`, pauses between requests, stops if policy can't be determined, and must be used only when collection/republication is authorized. It does not work around blocking or website restrictions. **No Understat shots have been collected or published yet.** Raw exports are never committed automatically.

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
- `src/Stats.jsx` — sourced coverage cards, player metrics and spatial X/Y visualization
- `scripts/discover_understat.py`, `scripts/link_understat.py` and `scripts/update_understat.py` — Understat candidate discovery, verified links and shot importer
- `data/understat/verified_players.csv` — manually verified Understat mapping
- `data/understat/rejected_players.csv` — reviewed false matches excluded from candidate discovery
- `public/data/understat_links.json` — verified Understat profile identities (independent of shot coverage)
- `public/data/understat_shots.json` — validated shot locations and per-season totals (empty until sourced)
- `public/data/sorare_matches.json` — generated confirmed/review/no-result match audit (after successful API run)
- `.github/workflows/update-data.yml` — automation and deployment

Sorare identity matching is in progress; Sorare performance statistics and rankings remain postponed. This project is independent of New Zealand Football. Wikidata data are CC0; records link to their source pages.


## Dates and traceability of statistics

Every future performance import records **when the statistics were found** separately from **when the matches took place**. The site displays these dates in each player's performance section and shows the most recent collection dates on the Statistics dashboard.

- **Sorare:** `retrieved_at` is the UTC timestamp of a successful API response for that player; `last_checked_at` is the latest successful check (including when no new matches were returned). `period_start` and `period_end` cover finalized, actually played matches used in the performance summary. The individual game date remains in `games[].date`. If a check returns no games, existing scores and their original `retrieved_at` are preserved.
- **Understat:** `imported_at` is the UTC time at which a valid shot export was processed. `source_mode` distinguishes `local_export` from `direct_fetch`. `source_fetched_at` is set **only** for a direct fetch; the original download date of a local export is **unknown**, not assumed to be its import date. `period_start` and `period_end` come from the actual dated shot events; individual shots retain `shots[].date`.
- Both output JSONs include `generated_at_utc` (file generation timestamp), separate from per-player timestamps. Older records without collection metadata display **Date not recorded** instead of a guessed date. A verified player identity alone is not a statistic.

**As of 22 October 2026:** six Understat player identities are verified, but zero shot events have been imported. The Sorare performance JSON is not yet published. No historical performance retrieval dates are backfilled or invented.

## Match-by-match Sorare performances

The dedicated `scripts/update_sorare_performance.py` importer fetches the latest **real football game scores** for players with a verified `sorare_slug`. It uses the same `SORARE_API_KEY` repository secret as the identity matcher. It does not guess stats or publish credentials.

- **Actions → Update Sorare performances → Run workflow** updates the confirmed player set (default: all, 15 recent scores per player). The workflow also runs every Monday and on importer/workflow code changes.
- `python scripts/update_sorare_performance.py --check` validates one API request without publishing data; `python scripts/update_sorare_performance.py --limit 5 --games 15` collects a small batch. Set the API key in the environment for local runs.
- `public/data/sorare_performance.json` is created only after successful API responses; it contains dates, competition, minutes, Sorare scores, score versions, raw match stats and summary fields. Older valid records are preserved when an individual player lookup fails.
- The profile page shows the figures only when the file contains sourced records; missing data are never displayed as zeros. DNP, pending and low-coverage games are excluded from averages, as are scores from different scoring versions.
- Run offline checks: `python -m unittest discover -s tests -p 'test_sorare_performance.py' -v`.
- Review the workflow summary for the **actual number of players and scores fetched**; an identity match alone does not imply match data are available. If the GraphQL schema or access rules change, collection fails safely rather than publishing guessed numbers.

### If the Sorare performance workflow fails

1. Open **Actions → Update Sorare performances**, choose the most recent run, and inspect **Validate Sorare performance API**. The collector now reports a short, actionable reason for schema rejection, missing credentials, 401/403 or network errors.
2. Verify the GitHub secret `SORARE_API_KEY` is available (Settings → Secrets and variables → Actions). Do not paste keys into issues, source files, or the website.
3. Sorare's documentation distinguishes an API key (rate limits) from **user authentication**. If the run says authentication is required, provide an authorized user access token in the `SORARE_ACCESS_TOKEN` Actions secret. When using a Sorare JWT, set the corresponding audience in `SORARE_JWT_AUD`; OAuth access tokens do not need a JWT audience header. JWT tokens can expire; never commit them.
4. The importer automatically retries a smaller, schema-verified set of match statistics if the detailed query is rejected. It only writes data after a successful response and preserves existing game histories on failures.
5. The summary reports the actual number of players and game scores collected. The JSON file **does not exist** until at least one successful live collection; the UI correctly shows unavailable instead of invented figures.

Documentation: https://github.com/sorare/api
