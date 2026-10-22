import test from 'node:test'
import assert from 'node:assert/strict'
import { positionGroup, POSITIONS } from '../src/rankingUtils.js'
import { ROLE_SIGNALS } from '../src/impactIndex.js'

test('classify the broad football roles consistently', () => {
  assert.equal(positionGroup('Goalkeeper'), 'goalkeeper')
  assert.equal(positionGroup('centre-back'), 'defender')
  assert.equal(positionGroup('attacking midfielder'), 'midfielder')
  assert.equal(positionGroup('left winger'), 'forward')
  assert.equal(positionGroup(null), null)
})

test('every ranked role has three explicit event signals and normalized weights', () => {
  for (const position of POSITIONS) {
    const signals = ROLE_SIGNALS[position.value]
    assert.equal(signals.length, 3)
    assert.equal(Math.round(signals.reduce((sum, x) => sum + x.weight, 0) * 100), 100)
    assert.equal(signals.every(s => Boolean(s.field) && s.label.includes('/ 90')), true)
  }
})
