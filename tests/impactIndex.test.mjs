import test from 'node:test'
import assert from 'node:assert/strict'
import { footballGames, impactEvidence, impactRows, peerPercentile } from '../src/impactIndex.js'

const today = new Date('2026-10-22T12:00:00Z')
const players = Array.from({ length: 6 }, (_, i) => ({
  id: 'p' + i, name: 'Player ' + i, position: 'forward', gender: 'Men',
}))
const game = (id, stats = {}, extra = {}) => ({
  id, date: '2026-10-10', score_status: 'FINAL', low_coverage: false,
  score: -100, scoring_version: 1, // A deliberately bad fantasy rating; must be ignored.
  stats: { playedInGame: true, minsPlayed: 90,
    totalScoringAtt: 2, goals: 1, bigChanceCreated: 1, ...stats }, ...extra,
})
const performance = () => ({ players: Object.fromEntries(players.map((p, i) => [
  p.id, { games: [0, 1, 2, 3, 4].map(j =>
    game(p.id + j, { totalScoringAtt: 1 + i, goals: i % 3, bigChanceCreated: i / 2 })) },
])) })

test('exclude unfinished, DNP, historic and low-coverage matches without reading fantasy ratings', () => {
  const matches = footballGames({ games: [
    game('valid', {}, { score: null, scoring_version: null }),
    game('pending', {}, { score_status: 'PENDING' }),
    game('dnp', { playedInGame: false }),
    game('low', {}, { low_coverage: true }),
    game('old', {}, { date: '2022-10-10' }),
  ] }, today)
  assert.deepEqual(matches.map(g => g.id), ['valid'])
})

test('no invented zero when core events have low reporting coverage', () => {
  const obs = impactEvidence(players[0], { games: [
    game('1'), game('2', { goals: null }), game('3', { goals: null }),
    game('4', { goals: null }), game('5', { goals: null }),
  ] }, today)
  assert.equal(obs.matches, 5)
  assert.equal(obs.indicators.find(x => x.field === 'goals').per90, null)
  assert.equal(obs.indicators.find(x => x.field === 'totalScoringAtt').per90, 2)
})

test('percentile midpoint handles ties and weak reference pools explicitly', () => {
  assert.equal(peerPercentile(2, [1, 2, 2, 3]), 50)
  assert.equal(peerPercentile(10, []), null)
})

test('NZ Impact index uses action percentiles, never the source fantasy rating', () => {
  const source = performance()
  const first = impactRows(players, source, today)
  assert.equal(first.filter(x => x.index !== null).length, 6)
  assert.equal(first[0].index <= first[5].index, true)
  const original = first.map(x => x.index)
  for (const p of Object.values(source.players)) for (const g of p.games) {
    g.score = 999
    g.scoring_version = 99
  }
  assert.deepEqual(impactRows(players, source, today).map(x => x.index), original)
})

test('no misleading composite if cohort is too small', () => {
  const rows = impactRows(players.slice(0, 4), performance(), today)
  assert.equal(rows.every(x => x.index === null), true)
  assert.match(rows[0].reason, /five peers/)
})

test('do not compare sexes or positions even with identical event fields', () => {
  const more = players.map((p, i) => ({
    ...p, gender: i >= 3 ? 'Women' : 'Men',
  }))
  assert.equal(impactRows(more, performance(), today).every(x => x.index === null), true)
  const different = players.map((p, i) => ({
    ...p, position: i >= 3 ? 'midfielder' : 'forward',
  }))
  assert.equal(impactRows(different, performance(), today).every(x => x.index === null), true)
})

test('insufficient minutes or matches are unranked even if stats are complete', () => {
  const source = performance()
  source.players.p0.games = [game('short', { minsPlayed: 45 })]
  const out = impactRows(players, source, today)
  assert.equal(out[0].index, null)
  assert.equal(out[0].eligible, false)
})
