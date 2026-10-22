import test from 'node:test'
import assert from 'node:assert/strict'
import {
  minutesByMatch, playerIndicators, shotSeasons, sourceCoverage, positionDistribution,
} from '../src/chartData.js'
const player = { id:'nz:1', name:'Test striker', sorare_slug:'test', position:'striker', gender:'Men' }
const fixture = (id, minutes, stats = {}, other = {}) => ({
  id, date:'2026-10-11', score_status:'FINAL', low_coverage:false,
  stats:{ playedInGame:minutes > 0, minsPlayed:minutes, totalScoringAtt:4, goals:1, ...stats },
  ...other,
})

test('minutes chart preserves reported zero and rejects pending fixtures', () => {
  const found = minutesByMatch({ games:[
    fixture('1',90),fixture('2',0),fixture('3',65,{}, {score_status:'PENDING'})
  ] })
  assert.deepEqual(found.map(g=>g.minutes),[90,0])
})

test('per-90 actions use only observed matches and never substitute missing with zero', () => {
  const metrics = playerIndicators(player,{ games:[
    fixture('1',90,{ totalScoringAtt:3,goals:1 }),
    fixture('2',90,{ totalScoringAtt:6,goals:null })
  ]})
  assert.equal(metrics[0].per90,4.5)
  assert.equal(metrics[0].observed,2)
  assert.equal(metrics[1].per90,1)
  assert.equal(metrics[1].observed,1)
  assert.equal(metrics[2].per90,null)
})

test('match data coverage is independent from Sorare fantasy rating fields', () => {
  const people = [
    {id:'A',sorare_slug:'a'}, {id:'B',sorare_slug:'b'},
    {id:'C',sorare_slug:null}, {id:'D',sorare_slug:null},
  ]
  const perf = {players:{A:{games:[fixture('1',90,{}, {score:null})]}}}
  const shots = {players:{A:{shots:[{id:'one'}]}, C:{shots:[{id:'two'}]}}}
  const links = {players:{C:{source_url:'https://example.org'}}}
  assert.deepEqual(sourceCoverage(people,links,shots,perf).map(x=>x.count),[1,1,1,1])
})

test('position counts keep an unknown group', () => {
  assert.deepEqual(positionDistribution([
    {position:'goalkeeper'},{position:'left winger'},
    {position:'defender'},{position:null}
  ]).map(x=>x.count),[1,1,0,1,1])
})

test('Understat xG chart uses sourced season summaries only', () => {
  assert.deepEqual(shotSeasons({seasons:{
    2026:{xg:4.2,goals:5},2025:{xg:2.5,goals:2},2024:{xg:null,goals:2}
  }}).map(x=>x.season),['2025','2026'])
  assert.deepEqual(shotSeasons(null),[])
})
