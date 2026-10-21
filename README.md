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
- `scripts/update_players.py` discovers players on Wikidata using NZ citizenship, sporting nationality, or a NZ birthplace.
- Public Wikidata entity data supplies available birth dates, positions, team memberships, and source IDs.
- `data/manual_players.csv` holds manual additions and corrections. Filled CSV cells override Wikidata; a matching Wikidata QID preserves stable IDs.
- `public/data/players.json` holds the snapshot consumed by React.
- If Wikidata is unavailable, **the existing snapshot is preserved**. No fake statistics are generated.

There are three research categories: `confirmed_international` (documented NZ senior national side), `nz_nationality` (documented NZ citizenship) and `potential_to_verify` (possible NZ connection). **These are not legal FIFA eligibility determinations.** Missing data remain blank. Club memberships can be incomplete or outdated.

The initial source-linked catalogue contains seven real players, including men and women. Weekly runs should expand this automatically; the initial data are not exhaustive.

## GitHub Pages
In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. Run **Actions → Update data and deploy → Run workflow** or push to `main`. The workflow also runs every Monday at 05:20 UTC, builds the static site, and deploys it with GitHub's official Pages actions.

## Files
- `src/App.jsx` — navigation, dashboard, table filters and player profiles
- `src/styles.css` — responsive dark design
- `scripts/update_players.py` — Wikidata extraction and CSV merge
- `data/manual_players.csv` — reviewed records and corrections
- `public/data/players.json` — site-ready data
- `.github/workflows/update-data.yml` — automation and deployment

Sorare and performance rankings are intentionally postponed. This project is independent of New Zealand Football. Wikidata data are CC0; records link to their source pages.
