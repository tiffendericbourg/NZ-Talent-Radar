import test from 'node:test'
import assert from 'node:assert/strict'
import {
  seasonOf, seasonLabel, availableSeasons, seasonSummary,
  selectSorareSeason, selectUnderstatSeason, seasonEndDate,
} from '../src/seasonUtils.js'
import { rankingRows } from '../src/rankingUtils.js'

const game = (id, date, score, version = 7, stats = {}) => ({
  id, date, score, score_status: 'FINAL', scoring_version: version,
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
  assert.equal(seasonLabel('2026'), '2026/27')
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
  assert.deepEqual(availableSeasons(source, null), ['2026', '2025'])
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
  assert.deepEqual(availableSeasons(null, understat), ['2026', '2025'])
})

test('rankings can calculate a historical season rather than only the last year', () => {
  const players = [{ id: 'nz1', name: 'A Forward', position: 'forward', gender: 'Men', sorare_slug: 'nz-a' }]
  const source = { players: { nz1: { games: [
    game('a', '2025-11-01', 65), game('b', '2025-12-01', 70),
    game('c', '2026-01-01', 75),
  ] } } }
  const stats = selectSorareSeason(source, '2025')
  const rows = rankingRows(players, stats, seasonEndDate('2025'))
  assert.equal(rows[0].eligible, true)
  assert.equal(rows[0].average, 70)
  assert.equal(rows[0].matches, 3)
})
