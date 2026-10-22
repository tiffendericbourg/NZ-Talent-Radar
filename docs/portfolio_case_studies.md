# Three scouting questions — NZ Talent Radar

**Portfolio notes · 22 October 2026**

I built NZ Talent Radar because following New Zealand footballers across leagues and countries is harder than it sounds. A player list is easy to make. A list you can trust — and actually use to decide which match to review — takes more work.

My goal is a simple analyst workflow: **find → verify → compare → explain → decide what to check next.**

## Study 01 — Which NZ U23 players deserve a video review?

**Question.** Which young players have enough documented playing time to justify a closer look?

**Method.** Start with recorded NZ links and ages calculated at the date of analysis. Keep possible eligibility separate from confirmed NZ nationality or senior representation. Count completed played matches and recorded minutes in one period, then check actual football-event coverage. Fantasy match scores are excluded. A player enters the review queue at **3 scored matches and 180 minutes**, with position variety used to create up to three examples.

**Finding.** The starting catalogue holds 1,111 NZ-linked profiles. On 22 October 2026, *only two U23 records in the full catalogue had a known overseas club country*: Milly Clegg and Stipe Ukich. That is a limitation of our documented club fields, not proof that only two young New Zealanders play abroad. The case-study page recalculates the match-evidence shortlist from the current JSON; it **does not invent a third overseas player**.

**What I would tell the staff.** These are *video-review leads*, not national-team recommendations. Before drawing conclusions, check the player's current team, full-match footage, tactical responsibilities and level of opposition.

**What I would improve next.** Independently verify clubs in youth and women's competitions; obtain additional authorized match data for leagues Sorare doesn't cover.

## Study 02 — How do two players in the same position compare?

**Question.** What do the recorded match events reveal beyond an average fantasy score?

**Method.** Filter by gender, broad playing role and match dates. Require at least 3 completed played matches and 180 minutes. Show match minutes, score averages, and position-specific events per 90 side by side. A role metric is drawn only if it is present in **every included game for both players**.

**Interpretation.** More tackles or clearances may reflect a different team style rather than a better defender. The NZ Impact Index compares role-specific action percentiles inside a documented NZ cohort, but it does not remove differences in league strength or tactics. The report therefore pairs the index with observed statistics and a video-review action.

**What I would improve next.** Split broad roles into centre-backs, full-backs, defensive midfielders, creators, wingers and strikers; add context such as team possession, opposition strength and video observations.

## Study 03 — Where are the blind spots?

**Question.** Who is underrepresented when most of the catalogue doesn't have comparable match data?

**Method.** Measure the entire Wikidata/manual catalogue, *not only the people who pass the performance filter*. Report sourced match coverage separately for women, men and U23s, then surface profiles whose data should be checked next.

**Finding.** The October collection reported 1,111 profiles but only 217 with a club and 62 verified Sorare identities. Understat had six reviewed identity links and **zero imported shot events**. Those numbers describe evidence coverage, not player ability. Current numbers update with the source files.

**What I would tell the staff.** A model that ranks only the easy-to-measure players will overlook many players in smaller leagues, youth competitions and parts of women's football. Investigate the missingness before interpreting any leaderboard.

## What the application demonstrates

- **Python** — data collection, manual corrections, reproducible JSON snapshots and guarded source matching.
- **Data quality** — identity audits, rejected homonyms, missingness and retrieval-date tracking.
- **Analytics** — match-level filters, per-90 calculations, original NZ Impact Index, role reference distributions and transparent thresholds.
- **React / JavaScript** — accessible charts, interactive analysis and player-specific evidence cards.
- **Communication** — every report includes a plain-language observation, uncertainty and a recommended next step.

### What this does not prove yet

Sorare fantasy ratings are excluded from the site. The NZ Impact Index is a position-specific, weighted percentile of recorded match actions; its small reference cohorts can mix leagues of different standards. The published Understat shot dataset is still empty. There is no validated absolute talent score, medical assessment, legal FIFA eligibility decision or model of future potential. The site is not affiliated with New Zealand Football.

I deliberately leave these limitations visible rather than publish impressive-looking numbers that cannot be defended.

### Reproduce

Install the Node dependencies, then run the scripts **npm test** and **npm run build**.

Open **U23 study** on the site and switch between the three research questions. Choose a season using the site-wide selector. Player notes are generated from published JSON snapshots; empty or incomplete data produce a warning rather than made-up graphs.

Relevant implementation: src/impactIndex.js, src/scoutingReport.js, src/ScoutingWorkspace.jsx, src/ImpactCharts.jsx, and tests/impactIndex.test.mjs. See docs/nz_impact_index.md for the formula.
