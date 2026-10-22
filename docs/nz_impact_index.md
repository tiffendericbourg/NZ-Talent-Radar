# NZ Impact Index — methodology v1

**Created 22 October 2026 · Independent NZ Talent Radar indicator**

## What the number means

The NZ Impact Index (0–100) is a **relative comparison of recorded football actions** among NZ-linked players sharing a broad role and gender. It answers: *“How active is this footballer, on three relevant events, compared with the NZ players we have comparable data for?”*

It does **not** measure absolute ability, future potential, match importance or selection suitability. It is deliberately not the Sorare fantasy score. Sorare is a source of individual match events, minutes and dates, **not** the author of our index.

## Events by role

| Group | Events and weights |
| --- | --- |
| Goalkeeper | Saves 40%, high claims 30%, sweeper actions 30% |
| Defender | Tackles won 40%, interceptions 35%, duels won 25% |
| Midfielder | Successful final-third passes 40%, big chances created 35%, interceptions 25% |
| Forward | Shots 40%, big chances created 30%, goals 30% |

The weights are editorial working hypotheses. They have **not** been trained or validated against professional scout judgements. A higher number of saves, tackles or shots can reflect team tactics or a weaker team, not greater quality.

## Exact steps

1. Limit the match sample to the chosen date range. Keep *completed, played, non-low-coverage* fixtures with **recorded positive minutes**. Never use a fantasy score or a scoring version as a prerequisite.
2. For each role event, sum its observed values and the playing minutes **only for fixtures that report that action**. Compute actions/90 = 90 × events / observed minutes.
3. A metric is available only if at least 80% of played matches report the action. Missing values are unknown, not zero.
4. Form a reference group from NZ-linked players with the **same gender and broad position** who have at least 3 completed matches and 180 documented minutes in the selected period.
5. Compute each event's reference percentile only if at least **five** players in the role group have valid observed rates. Percentile = 100 × (strictly lower reference values + 0.5 × tied values) / reference group size. This midpoint-tie rule avoids giving a rare tied value an artificially extreme rank.
6. A player's NZ Impact Index is the weighted average of **at least two** available event percentiles, with valid weights rescaled to sum to 100%. Round to a whole number. **Otherwise show no score.**

### Confidence labels

- **Stronger sample:** 10+ completed played matches and 900+ minutes.
- **Developing sample:** 5+ games and 450+ minutes.
- **Small sample:** fewer documented games/minutes, potentially above the minimal indexing threshold.

The confidence label is **not a multiplier** and cannot raise an underperforming index; it tells a football staff how cautiously to interpret it.

## Practical interpretation

An index of 76/100 means that the player's weighted *recorded-event percentiles* average 76 in the current NZ reference population for their role and gender. It does **not** mean 76% of elite quality, a probability of being picked, or a cross-league grade.

Percentiles recalculate as the cohort grows. Comparisons should therefore be made within the same date window and dataset snapshot. We do not currently adjust for league strength, team possession, opponent difficulty, set-piece responsibilities or specialist subpositions. The number should never substitute for video review.

## Reproduce and review

- Source: src/impactIndex.js
- Rendering: src/Rankings.jsx, src/ScoutingWorkspace.jsx, src/ImpactCharts.jsx
- Offline checks: tests/impactIndex.test.mjs
- Execute: npm test

The source Sorare game dataset is retained for reproducibility, but its fantasy rating is **not consumed** by the index, ranking or scouting visualizations. Understat shot events only contribute when independently sourced, validated and imported; an Understat identity alone is not a performance.

### Next iteration

Calibrate weights and benchmarks with verified professional league peers by specialist role; add possession-adjusted defensive rates and opponent standard, then validate reports against independent match video observations. Until those checks are possible, v1 remains an *exploratory football activity index*.
