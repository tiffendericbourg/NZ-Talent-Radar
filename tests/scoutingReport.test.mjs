import test from 'node:test'
import assert from 'node:assert/strict'
import { ageAt, matchSample, scoutingReport, u23Research } from '../src/scoutingReport.js'

const now = new Date('2026-10-22T12:00:00Z')
const player = {
  id: 'p1', name: 'NZ test midfielder', birth_date: '2005-10-23', gender: 'Women',
  position: 'midfielder', club: 'Test club', club_country: 'England',
  eligibility_status: 'nz_nationality',
}
const other = (id, name, position = 'midfielder', score = 60) => ({
  player: { ...player, id, name, position }, score,
})
const match = (id, score = 60, overrides = {}) => ({
  id, date: '2026-10-10', score, score_status: 'FINAL', low_coverage: false,
  scoring_version: 7, stats: {
    playedInGame: true, minsPlayed: 90, successfulFinalThirdPasses: 8,
    interceptionWon: 2, duelWon: 3,
  }, ...overrides,
})
const records = (fixtures, version = 7) => ({
  games: fixtures.map((score, i) => match(String(i), score, {
    date: '2026-10-' + String(10 + i).padStart(2, '0'),
    scoring_version: version,
  })),
  retrieved_at: '2026-10-22T08:00:00Z',
})

test('age is computed on the requested date, never from stale imported age', () => {
  assert.equal(ageAt('2005-10-23', now), 20)
  assert.equal(ageAt('2003-10-22', now), 23)
  assert.equal(ageAt(null, now), null)
})

test('a match sample rejects DNP, low coverage, other versions and historic fixtures', () => {
  const found = matchSample({ games: [
    match('a', 65), match('b', 75, { scoring_version: 6 }),
    match('c', 90, { low_coverage: true }),
    match('d', 90, { stats: { minsPlayed: 0, playedInGame: false } }),
    match('e', 91, { date: '2024-01-01' }),
  ] }, now)
  assert.equal(found.version, '7')
  assert.deepEqual(found.games.map(g => g.id), ['a'])
})

test('no source means no fabricated scoring, strength or peer median', () => {
  const report = scoutingReport(player, { players: {} }, [player], now)
  assert.equal(report.average, null)
  assert.equal(report.minutes, 0)
  assert.equal(report.metrics[0].per90, null)
  assert.equal(report.peerMedian, null)
  assert.equal(report.evidence, 'Limited sample')
  assert.match(report.nextAction, /Collect more/)
})

test('reported metrics use only games where the field is actually present', () => {
  const report = scoutingReport(player, { players: { p1: { games: [
    match('a', 70),
    match('b', 60, { stats: { minsPlayed: 90, playedInGame: true, successfulFinalThirdPasses: null } }),
    match('c', 70),
  ] } } }, [player], now)
  const metric = report.metrics.find(m => m.field === 'successfulFinalThirdPasses')
  assert.equal(metric.observed, 2)
  assert.equal(metric.possible, 3)
  assert.equal(metric.per90, 8)
  assert.equal(report.observations.some(x => x.includes('fully documented matches')), false)
})

test('peer median is available only with enough comparable players', () => {
  const p2 = other('p2', 'Two', 'midfielder', 60).player
  const p3 = other('p3', 'Three', 'midfielder', 50).player
  const wrong = { ...player, id: 'p4', name: 'Other role', position: 'defender' }
  const performance = { players: {
    p1: records([70, 70, 70, 70]),
    p2: records([60, 60, 60, 60]),
    p3: records([50, 50, 50, 50]),
    p4: records([100, 100, 100, 100]),
  } }
  const report = scoutingReport(player, performance, [player, p2, p3, wrong], now)
  assert.equal(report.peerMedian, 60)
  assert.equal(report.peerCount, 3)
  assert.equal(report.evidence, 'Preliminary sample')
  assert.equal(report.minutes, 360)
})

test('U23 study cannot fabricate three overseas profiles or cross-league rankings', () => {
  const p2 = { ...player, id: 'p2', name: 'Club unknown', club_country: null }
  const p3 = { ...player, id: 'p3', name: 'Unverified NZ link', eligibility_status: 'potential_to_verify' }
  const p4 = { ...player, id: 'p4', name: 'Domestic', club_country: 'New Zealand' }
  const performance = { players: {
    p1: records([60, 60, 60, 60]),
    p2: records([65]),
  } }
  const study = u23Research([player, p2, p3, p4], performance, now, null, now)
  assert.equal(study.total, 3)
  assert.equal(study.abroad, 1)
  assert.equal(study.unknownClub, 1)
  assert.equal(study.withMatches, 2)
  assert.equal(study.selected.length, 1)
  assert.equal(study.selected[0].player.id, 'p1')
  assert.equal(study.pending[0].player.id, 'p2')
})

test('explicit season bounds exclude previous years', () => {
  const sample = matchSample({ games: [
    match('old', 80, { date: '2025-09-15' }),
    match('new', 70, { date: '2026-08-15' }),
  ] }, new Date('2027-06-30T23:59:59Z'), new Date('2026-07-01T00:00:00Z'))
  assert.deepEqual(sample.games.map(g => g.id), ['new'])
})
