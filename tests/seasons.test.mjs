import test from 'node:test'
import assert from 'node:assert/strict'
import {
  seasonOf, seasonType, gameSeasonKey, seasonLabel, availableSeasons, seasonSummary,
  selectSorareSeason, selectUnderstatSeason, seasonStartDate, seasonEndDate,
} from '../src/seasonUtils.js'
import { rankingRows } from '../src/rankingUtils.js'

const game = (id, date, score, version = 7, stats = {}) => ({
  id, date, score, competition: 'Premier League', score_status: 'FINAL', scoring_version: version,
  low_coverage: false, stats: {
    playedInGame: true, minsPlayed: 90, goals: 1, goalAssist: null,
    totalScoringAtt: 3, ...stats,
  },
})

test('Sorare seasons follow July-June match dates, not import time', () => {
  assert.equal(seasonOf('2026-07-01T15:00:00Z'), '2026')
  assert.equal(seasonOf('2026-06-30'), '2025')
  assert.equal(seasonOf('2025-12-10'), '2025')
  assert.equal(seasonOf('invalid'), null)
  assert.equal(seasonLabel('2026'), '2026/27 · July–June')
})

test('season filters apply to games and per-season averages', () => {
  const source = { players: {
    nz1: { games: [
      game('a', '2026-10-01', 70),
      game('b', '2026-09-01', 50),
      game('c', '2026-05-01', 80, 6),
      game('d', '2025-09-01', 90, 6, { goals: null }),
    ] },
  } }
  assert.deepEqual(availableSeasons(source, null), ['split:2026', 'split:2025'])
  const selected = selectSorareSeason(source, '2026')
  assert.deepEqual(selected.players.nz1.games.map(g => g.id), ['a', 'b'])
  assert.equal(selected.players.nz1.summary.average_score, 60)
  assert.equal(selected.players.nz1.summary.matches_played, 2)
  assert.equal(selected.players.nz1.summary.totals.goals, 2)
  assert.deepEqual(source.players.nz1.games.map(g => g.id), ['a', 'b', 'c', 'd'])
  const older = selectSorareSeason(source, '2025')
  assert.equal(older.players.nz1.summary.average_score, 85)
})

test('missing Sorare statistics are not transformed into zeros', () => {
  const missing = seasonSummary([game('a', '2026-10-01', null, 7, { goals: null, goalAssist: null })])
  assert.equal(missing.average_score, null)
  assert.equal(missing.totals.goals, null)
  assert.equal(missing.totals.goalAssist, null)
})

test('Understat filtered shots drive xG, not lifetime career totals', () => {
  const understat = { players: { nz1: { seasons: { 2025: { xg: 1.9, goals: 2 }, 2026: { xg: 1, goals: 1 } },
    shots: [
      { id: 's1', season: '2026', date: '2026-08-01', xg: 0.6, result: 'Goal' },
      { id: 's2', season: '2026', date: '2026-09-01', xg: 0.4, result: 'MissedShots' },
      { id: 's3', season: '2025', date: '2025-10-01', xg: 0.3, result: 'Goal' },
    ] } } }
  const current = selectUnderstatSeason(understat, '2026')
  assert.equal(current.players.nz1.stats.shots, 2)
  assert.equal(current.players.nz1.stats.xg, 1)
  assert.equal(current.players.nz1.stats.goals, 1)
  assert.equal(current.players.nz1.period_start, '2026-08-01')
  assert.equal(current.players.nz1.shots.length, 2)
  assert.deepEqual(availableSeasons(null, understat), ['split:2026', 'split:2025'])
})

test('rankings can calculate a historical season rather than only the last year', () => {
  const players = [{ id: 'nz1', name: 'A Forward', position: 'forward', gender: 'Men', sorare_slug: 'nz-a' }]
  const source = { players: { nz1: { games: [
    game('a', '2025-11-01', 65), game('b', '2025-12-01', 70),
    game('c', '2026-01-01', 75),
  ] } } }
  const stats = selectSorareSeason(source, '2025')
  const rows = rankingRows(players, stats, seasonEndDate('2025'), seasonStartDate('2025'))
  assert.equal(rows[0].eligible, true)
  assert.equal(rows[0].average, 70)
  assert.equal(rows[0].matches, 3)
})

test('calendar leagues and tournaments do not leak into July-June rankings', () => {
  assert.equal(seasonType('MLS'), 'calendar')
  assert.equal(seasonType('Eliteserien'), 'calendar')
  assert.equal(seasonType('FIFA World Cup'), 'event')
  assert.equal(seasonType('Primera División'), 'unclassified')
  const games = [
    { ...game('eng', '2026-04-01', 77), competition: 'Premier League' },
    { ...game('mls', '2026-04-01', 45), competition: 'MLS' },
    { ...game('friendly', '2026-04-01', 92), competition: 'Friendlies' },
    { ...game('norway', '2026-11-01', 80), competition: 'Eliteserien' },
    { ...game('unknown', '2026-11-01', 65), competition: 'Primera División' },
  ]
  assert.deepEqual(games.map(gameSeasonKey), [
    'split:2025', 'calendar:2026', 'event:2026',
    'calendar:2026', 'unclassified:2026',
  ])
  const source = { players: { nz1: { games } } }
  assert.deepEqual(availableSeasons(source, null),
    ['calendar:2026', 'event:2026', 'unclassified:2026', 'split:2025'])
  assert.deepEqual(selectSorareSeason(source, 'calendar:2026').players.nz1.games.map(x => x.id),
    ['mls', 'norway'])
  assert.deepEqual(selectSorareSeason(source, 'event:2026').players.nz1.games.map(x => x.id),
    ['friendly'])
  assert.deepEqual(selectSorareSeason(source, 'split:2025').players.nz1.games.map(x => x.id),
    ['eng'])
  assert.equal(seasonEndDate('calendar:2026').toISOString(), '2026-12-31T23:59:59.000Z')
  assert.equal(seasonStartDate('split:2025').toISOString(), '2025-07-01T00:00:00.000Z')
})

test('calendar filters do not attach Understat July-June shots to a different season type', () => {
  const raw = { players: { p: { shots: [
    { id: 'g', season: '2026', date: '2026-09-20', result: 'Goal', xg: 0.3 },
  ] } } }
  assert.deepEqual(selectUnderstatSeason(raw, 'calendar:2026').players, {})
  assert.equal(selectUnderstatSeason(raw, 'split:2026').players.p.stats.goals, 1)
})

test('historical rankings use the entire July-June period even on leap years', () => {
  const players = [{ id: 'p', name: 'Player', sorare_slug: 'player', position: 'forward', gender: 'Men' }]
  const matches = [
    game('a', '2023-07-01', 45), game('b', '2024-01-03', 50),
    game('c', '2024-06-30', 55),
  ]
  const perf = selectSorareSeason({ players: { p: { games: matches } } }, 'split:2023')
  const [row] = rankingRows(players, perf, seasonEndDate('split:2023'), seasonStartDate('split:2023'))
  assert.equal(row.matches, 3)
  assert.equal(row.average, 50)
})

test('J.League switch in 2026 respects the confirmed August-June season', () => {
  assert.equal(gameSeasonKey({ competition: 'J1 League', date: '2025-11-14' }), 'calendar:2025')
  assert.equal(gameSeasonKey({ competition: 'J1 League', date: '2026-04-16' }), 'unclassified:2026')
  assert.equal(gameSeasonKey({ competition: 'J1 League', date: '2026-08-07' }), 'split:2026')
  assert.equal(gameSeasonKey({ competition: 'J1 League', date: '2027-04-07' }), 'split:2026')
  assert.equal(gameSeasonKey({ competition: 'MLS', date: '2027-04-07' }), 'calendar:2027')
})

test('the season menu ignores DNP-only periods', () => {
  const fixture = game('played', '2026-10-02', 50)
  const bench = { ...game('bench', '2024-08-20', null), stats: {
    minsPlayed: 0, playedInGame: false,
  } }
  const result = availableSeasons({ players: { p: { games: [fixture, bench] } } }, null)
  assert.deepEqual(result, ['split:2026'])
})
