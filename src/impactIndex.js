// NZ Impact Index v1 — football events only, NEVER Sorare fantasy ratings.
// Relative evidence signal within a same-gender / broad-role research cohort.
// NOT a talent forecast, league-adjusted rating or national-team selection score.
import { positionGroup } from './rankingUtils.js'

export const IMPACT_MIN_MATCHES = 3
export const IMPACT_MIN_MINUTES = 180
export const IMPACT_MIN_PEERS = 5
export const IMPACT_WINDOW_DAYS = 365

// Weights are editorial starting hypotheses, not learned coefficients.
// The field mapping is explicit so each published value is auditable.
export const ROLE_SIGNALS = {
  goalkeeper: [
    { field: 'saves', label: 'Saves / 90', weight: 0.40 },
    { field: 'goodHighClaim', label: 'High claims / 90', weight: 0.30 },
    { field: 'accurateKeeperSweeper', label: 'Sweeper actions / 90', weight: 0.30 },
  ],
  defender: [
    { field: 'wonTackle', label: 'Tackles won / 90', weight: 0.40 },
    { field: 'interceptionWon', label: 'Interceptions / 90', weight: 0.35 },
    { field: 'duelWon', label: 'Duels won / 90', weight: 0.25 },
  ],
  midfielder: [
    { field: 'successfulFinalThirdPasses', label: 'Final-third passes / 90', weight: 0.40 },
    { field: 'bigChanceCreated', label: 'Big chances created / 90', weight: 0.35 },
    { field: 'interceptionWon', label: 'Interceptions / 90', weight: 0.25 },
  ],
  forward: [
    { field: 'totalScoringAtt', label: 'Shots / 90', weight: 0.40 },
    { field: 'bigChanceCreated', label: 'Big chances created / 90', weight: 0.30 },
    { field: 'goals', label: 'Goals / 90', weight: 0.30 },
  ],
}
const numeric = n => typeof n === 'number' && Number.isFinite(n)
const round = n => Math.round(n * 10) / 10
const isPlayed = game => game?.score_status === 'FINAL' &&
  game.low_coverage === false && game.stats?.playedInGame === true &&
  numeric(game.stats?.minsPlayed) && game.stats.minsPlayed > 0

export function footballGames(record, end = new Date(), start = null) {
  const last = end.getTime()
  const first = start ? start.getTime() : last - IMPACT_WINDOW_DAYS * 86400000
  return (record?.games || []).filter(g => {
    const when = new Date(g?.date).getTime()
    return isPlayed(g) && Number.isFinite(when) && when <= last && when >= first
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

export function impactEvidence(player, record, end = new Date(), start = null) {
  const group = positionGroup(player.position)
  const games = footballGames(record, end, start)
  const minutes = games.reduce((sum, g) => sum + g.stats.minsPlayed, 0)
  const indicators = (ROLE_SIGNALS[group] || []).map(signal => {
    const observed = games.filter(g => numeric(g.stats[signal.field]))
    const observedMinutes = observed.reduce((sum, g) => sum + g.stats.minsPlayed, 0)
    const events = observed.reduce((sum, g) => sum + g.stats[signal.field], 0)
    // At least 80% of the played sample must report the metric.
    const usable = games.length > 0 && observed.length / games.length >= 0.8 && observedMinutes > 0
    return { ...signal, observed: observed.length, possible: games.length, observedMinutes,
      per90: usable ? round(90 * events / observedMinutes) : null }
  })
  return {
    player, group, matches: games.length, minutes, indicators, games,
    eligible: group !== null && games.length >= IMPACT_MIN_MATCHES &&
      minutes >= IMPACT_MIN_MINUTES,
    confidence: games.length >= 10 && minutes >= 900 ? 'Stronger sample' :
      games.length >= 5 && minutes >= 450 ? 'Developing sample' : 'Small sample',
    periodStart: games.at(-1)?.date?.slice(0, 10) || null,
    periodEnd: games[0]?.date?.slice(0, 10) || null,
    retrievedAt: record?.retrieved_at || null,
  }
}

// Rank-based midpoint percentile (ties receive the same value).
// Low sample sizes remain explicitly blocked by IMPACT_MIN_PEERS.
export function peerPercentile(value, reference) {
  const values = reference.filter(numeric)
  if (!numeric(value) || values.length === 0) return null
  const below = values.filter(v => v < value).length
  const tied = values.filter(v => v === value).length
  return 100 * (below + tied / 2) / values.length
}

export function impactRows(players, performance, end = new Date(), start = null) {
  const observations = (players || []).map(p =>
    impactEvidence(p, performance?.players?.[p.id], end, start))
  const indexable = observations.filter(p => p.eligible)
  return observations.map(row => {
    const peers = indexable.filter(p => p.group === row.group &&
      p.player.gender === row.player.gender)
    const scored = row.indicators.map(metric => {
      const comparable = peers.map(p => p.indicators.find(m => m.field === metric.field)?.per90)
        .filter(numeric)
      const percentile = row.eligible && metric.per90 !== null &&
        comparable.length >= IMPACT_MIN_PEERS ?
        peerPercentile(metric.per90, comparable) : null
      return { ...metric, percentile: percentile === null ? null : round(percentile),
        referenceCount: comparable.length }
    })
    const usable = scored.filter(m => m.percentile !== null)
    const ready = row.eligible && usable.length >= 2
    const weight = usable.reduce((sum, m) => sum + m.weight, 0)
    const index = ready && weight > 0 ?
      Math.round(usable.reduce((sum, m) => sum + m.weight * m.percentile, 0) / weight) : null
    return {
      ...row, indicators: scored, index,
      referenceSize: peers.length,
      usableSignals: usable.length,
      reason: !row.eligible ? 'Need 3 documented matches and 180 minutes' :
        usable.length < 2 ? 'Need two role metrics covered by at least five peers each' : null,
    }
  })
}

// Reports share the same published snapshot and research period across a page.
// Avoid rebuilding the full 1,111-player reference group for every dossier.
const memo = new WeakMap()
export function impactFor(player, players, performance, end = new Date(), start = null) {
  if (!performance || !players) return impactEvidence(player, performance?.players?.[player.id], end, start)
  const period = end.toISOString().slice(0, 10) + ':' + (start?.toISOString().slice(0, 10) || '')
  let entries = memo.get(performance)
  if (!entries || entries.players !== players || entries.period !== period) {
    entries = { players, period, rows: new Map(
      impactRows(players, performance, end, start).map(row => [row.player.id, row])
    ) }
    memo.set(performance, entries)
  }
  return entries.rows.get(player.id) ||
    impactEvidence(player, performance?.players?.[player.id], end, start)
}
