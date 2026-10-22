import test from 'node:test'
import assert from 'node:assert/strict'
import { positionGroup, playerRankingData, rankingRows } from '../src/rankingUtils.js'

const now = new Date('2026-10-22T12:00:00Z')
const nzPlayer = {
  id: 'wd:Q1', name: 'Sample NZ Forward', position: 'forward',
  gender: 'Men', birth_date: '2004-01-01', sorare_slug: 'sample-forward',
}
const makeGame = (id, date, score, minutes, overrides = {}) => ({
  id: String(id), date, score, score_status: 'FINAL', low_coverage: false,
  scoring_version: 7,
  stats: { minsPlayed: minutes, playedInGame: true, totalScoringAtt: 3 },
  ...overrides,
})

test('recognises football positions consistently', () => {
  assert.equal(positionGroup('goalkeeper'), 'goalkeeper')
  assert.equal(positionGroup('centre-back'), 'defender')
  assert.equal(positionGroup('attacking midfielder'), 'midfielder')
  assert.equal(positionGroup('striker'), 'forward')
  assert.equal(positionGroup(''), null)
})

test('does not invent a ranking for an identity match with no match scores', () => {
  const p = playerRankingData(nzPlayer, undefined, now)
  assert.equal(p.eligible, false)
  assert.equal(p.average, null)
  assert.equal(p.matches, 0)
})

test('ranks only sourced, completed, covered, recent matches on one scoring version', () => {
  const record = { games: [
    makeGame('1', '2026-10-20T10:00:00Z', 75, 90),
    makeGame('2', '2026-10-15T10:00:00Z', 65, 70),
    makeGame('3', '2026-10-10T10:00:00Z', 55, 40),
    makeGame('4', '2026-10-04T10:00:00Z', 95, 90, { scoring_version: 6 }),
    makeGame('5', '2026-09-25T10:00:00Z', 95, 90, { low_coverage: true }),
    makeGame('6', '2026-09-20T10:00:00Z', 100, 90, { score_status: 'PENDING' }),
    makeGame('7', '2024-01-10T10:00:00Z', 95, 90),
  ] }
  const p = playerRankingData(nzPlayer, record, now)
  assert.equal(p.eligible, true)
  assert.equal(p.average, 65)
  assert.equal(p.minutes, 200)
  assert.equal(p.matches, 3)
  assert.equal(p.version, '7')
  assert.equal(p.keyMetric, 4.1)
  assert.equal(p.start, '2026-10-10')
  assert.equal(p.end, '2026-10-20')
  assert.equal(p.age, 22)
})

test('requires a minimum number of comparable matches and minutes', () => {
  const p = playerRankingData(nzPlayer, { games: [
    makeGame('1', '2026-10-20', 99, 20),
    makeGame('2', '2026-10-18', 95, 20),
    makeGame('3', '2026-10-16', 90, 20),
  ] }, now)
  assert.equal(p.eligible, false)
  assert.equal(p.matches, 3)
  assert.equal(p.minutes, 60)
})

test('omits the position metric when even one match is missing the statistic', () => {
  const p = playerRankingData(nzPlayer, { games: [
    makeGame('1', '2026-10-20', 75, 90),
    makeGame('2', '2026-10-18', 75, 90, {
      stats: { minsPlayed: 90, playedInGame: true, totalScoringAtt: null },
    }),
    makeGame('3', '2026-10-16', 75, 90),
  ] }, now)
  assert.equal(p.eligible, true)
  assert.equal(p.keyMetric, null)
})

test('excludes players not connected to Sorare and never assigns scores from Understat identity', () => {
  const entries = rankingRows([
    nzPlayer, { id: 'wd:Q2', name: 'Unlinked', position: 'defender' },
  ], { players: {} }, now)
  assert.equal(entries.length, 1)
})
