import test from 'node:test'
import assert from 'node:assert/strict'
import {
  scoredGames, minutesByMatch, playerIndicators, shotSeasons,
  sourceCoverage, positionDistribution, peerComparison, scoreDistribution,
} from '../src/chartData.js'

const player = { id: 'nz:one', name: 'A Forward', sorare_slug: 'a-forward',
  position: 'forward', gender: 'Men' }

function match(id, score, minutes, overrides = {}) {
  return {
    id, date: '2026-10-' + String(10 + Number(id)).padStart(2, '0'),
    score, score_status: 'FINAL', scoring_version: 7, low_coverage: false,
    stats: { playedInGame: true, minsPlayed: minutes, totalScoringAtt: 4, goals: 1 },
    ...overrides,
  }
}

test('form chart series uses only played, complete, same-version scores', () => {
  const games = [
    match('1', 50, 90), match('2', 65, 80),
    match('3', 90, 90, { scoring_version: 6, date: '2026-09-21' }),
    match('4', 25, 60, { low_coverage: true }),
    match('5', 0, 0, { stats: { playedInGame: false, minsPlayed: 0 } }),
    match('6', 95, 90, { score_status: 'PENDING' }),
  ]
  const scores = scoredGames({ games })
  assert.deepEqual(scores.map(g => g.score), [50, 65])
  assert.equal(scores[0].version, '7')
  assert.deepEqual(scoredGames(null), [])
})

test('minutes chart only shows actual recorded minutes including reported zero', () => {
  const records = minutesByMatch({ games: [
    match('1', 50, 90),
    match('2', 0, 0, { stats: { playedInGame: false, minsPlayed: 0 } }),
    match('3', 70, 45, { score_status: 'PENDING' }),
  ] })
  assert.deepEqual(records.map(g => g.minutes), [90, 0])
  assert.deepEqual(minutesByMatch(undefined), [])
})

test('per-90 indicators use only matches reporting the field and corresponding minutes', () => {
  const rows = playerIndicators(player, { games: [
    match('1', 60, 90, { stats: {
      playedInGame: true, minsPlayed: 90, totalScoringAtt: 3, goals: 1,
    } }),
    match('2', 65, 90, { stats: {
      playedInGame: true, minsPlayed: 90, totalScoringAtt: 6, goals: null,
    } }),
  ]})
  assert.equal(rows[0].per90, 4.5)
  assert.equal(rows[0].observed, 2)
  assert.equal(rows[1].per90, 1)
  assert.equal(rows[1].observed, 1)
  assert.equal(rows[1].possible, 2)
  assert.equal(rows[2].per90, null)
  assert.equal(rows[2].total, null)
})

test('source coverage avoids double-counting a player with two data sources', () => {
  const players = [
    { id:'A', sorare_slug:'a' }, { id:'B', sorare_slug:'b' },
    { id:'C', sorare_slug:null }, { id:'D', sorare_slug:null },
  ]
  const stats = { players: { A: { games: [{ id:'g1' }] } } }
  const shots = { players: { A: { shots: [{ id:'s1' }] }, C: { shots: [{ id:'s2' }] } } }
  const links = { players: { C: { source_url:'https://example.org' } } }
  assert.deepEqual(sourceCoverage(players, links, shots, stats).map(g => g.count), [1,1,1,1])
})

test('position chart maintains a separate unknown category', () => {
  assert.deepEqual(positionDistribution([
    { position: 'Goalkeeper' }, { position: 'left winger' },
    { position: 'defender' }, { position: null },
  ]).map(g => g.count), [1,1,0,1,1])
})

test('Understat season chart includes only documented goals and xG', () => {
  assert.deepEqual(shotSeasons({ seasons: {
    2026: { xg: 4.2, goals: 5 },
    2025: { xg: 2.5, goals: 2 },
    2024: { xg: null, goals: 2 },
  }}).map(g => g.season), ['2025','2026'])
  assert.deepEqual(shotSeasons(null), [])
})

test('peer comparison only uses 3 eligible same-gender and same-position players', () => {
  const now = new Date('2026-10-22T00:00:00Z')
  const players = [player,
    { id:'nz:two', name:'B Forward', sorare_slug:'b', position:'striker', gender:'Men' },
    { id:'nz:three', name:'C Forward', sorare_slug:'c', position:'winger', gender:'Men' },
    { id:'nz:four', name:'D Midfielder', sorare_slug:'d', position:'midfielder', gender:'Men' },
  ]
  const withScores = score => ({ games: [
    match('1', score, 90), match('2', score, 90), match('3', score, 90),
  ] })
  const perf = { players: {
    'nz:one': withScores(60), 'nz:two': withScores(70),
    'nz:three': withScores(80), 'nz:four': withScores(100),
  } }
  assert.deepEqual(peerComparison(player, perf.players[player.id], players, perf, now), {
    player: 60, median: 70, cohortSize: 3, gender: 'Men',
    position: 'forward', scoringVersion: '7',
  })
  assert.equal(peerComparison(player, perf.players[player.id], players.slice(0,2), perf, now), null)
})

test('score chart buckets eligible averages, not player counts without data', () => {
  assert.deepEqual(scoreDistribution([
    { average: -2 }, { average: 28 }, { average: 48 },
    { average: 75 }, { average: 91 }, { average: null },
  ]).map(x => x.count), [1,1,1,1,1])
})
