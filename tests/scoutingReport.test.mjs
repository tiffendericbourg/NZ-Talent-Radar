import test from 'node:test'
import assert from 'node:assert/strict'
import { ageAt, matchSample, scoutingReport, u23Research } from '../src/scoutingReport.js'

const now = new Date('2026-10-22T12:00:00Z')
const player = {
  id: 'p1', name: 'NZ test midfielder', birth_date: '2005-10-23', gender: 'Women',
  position: 'midfielder', club: 'Test club', club_country: 'England',
  eligibility_status: 'nz_nationality',
}
const game = (id, stats = {}, extra = {}) => ({
  id, date: '2026-10-10', score_status: 'FINAL', low_coverage: false,
  stats: { playedInGame: true, minsPlayed: 90, successfulFinalThirdPasses: 8,
    interceptionWon: 2, bigChanceCreated: 1, ...stats },
  ...extra,
})
const record = matches => ({ games: Array.from({ length: matches }, (_, i) =>
  game('g' + i, {}, { date: '2026-10-' + String(10 + i).padStart(2, '0') })),
  retrieved_at: '2026-10-22T08:00:00Z' })

test('age is calculated on the requested day', () => {
  assert.equal(ageAt('2005-10-23', now), 20)
  assert.equal(ageAt('2003-10-22', now), 23)
  assert.equal(ageAt(null, now), null)
})

test('match sample is based on real played games, not Sorare fantasy rating', () => {
  const sample = matchSample({ games: [
    game('a', {}, { score: null }), game('b', {}, { score_status: 'PENDING' }),
    game('c', { playedInGame: false }), game('d', {}, { low_coverage: true }),
  ] }, now)
  assert.deepEqual(sample.games.map(g => g.id), ['a'])
})

test('missing source generates no fictitious NZ index', () => {
  const report = scoutingReport(player, { players: {} }, [player], now)
  assert.equal(report.index, null)
  assert.equal(report.minutes, 0)
  assert.equal(report.metrics[0].per90, null)
  assert.equal(report.evidence, 'Limited sample')
  assert.match(report.nextAction, /Confirm current club/)
})

test('partial action coverage is not turned into a football index', () => {
  const data = { players: { p1: { games: [
    game('1'), game('2', { successfulFinalThirdPasses: null }),
    game('3', { successfulFinalThirdPasses: null }), game('4'), game('5'),
  ] } } }
  const report = scoutingReport(player, data, [player], now)
  const metric = report.metrics.find(m => m.field === 'successfulFinalThirdPasses')
  assert.equal(metric.observed, 3)
  assert.equal(metric.per90, null)
  assert.equal(report.index, null)
})

test('U23 research filters eligibility and keeps unfilled slots honest', () => {
  const p2 = { ...player, id: 'p2', name: 'Club unknown', club_country: null }
  const p3 = { ...player, id: 'p3', name: 'NZ link not reviewed', eligibility_status: 'potential_to_verify' }
  const p4 = { ...player, id: 'p4', name: 'Domestic', club_country: 'New Zealand' }
  const perf = { players: { p1: record(5), p2: record(1) } }
  const out = u23Research([player, p2, p3, p4], perf, now, null, now)
  assert.equal(out.total, 3)
  assert.equal(out.abroad, 1)
  assert.equal(out.unknownClub, 1)
  assert.equal(out.withMatches, 2)
  assert.equal(out.selected.length, 1)
  assert.equal(out.pending[0].player.id, 'p2')
})

test('the selected season window excludes historical matches', () => {
  const sample = matchSample({ games: [
    game('old', {}, { date: '2025-09-15' }),
    game('new', {}, { date: '2026-08-15' }),
  ] }, new Date('2027-06-30T23:59:59Z'), new Date('2026-07-01T00:00:00Z'))
  assert.deepEqual(sample.games.map(g => g.id), ['new'])
})
