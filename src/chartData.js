// Actual football events only: no fantasy scores are used in charts.
import { positionGroup } from './rankingUtils.js'

const number = value => typeof value === 'number' && Number.isFinite(value)
const played = g => g?.score_status === 'FINAL' && g.low_coverage === false &&
  g.stats?.playedInGame === true && number(g.stats?.minsPlayed) && g.stats.minsPlayed > 0

export function minutesByMatch(record) {
  return (record?.games || []).filter(g => g?.score_status === 'FINAL' &&
    g.low_coverage === false && number(g.stats?.minsPlayed) &&
    g.stats.minsPlayed >= 0 && !Number.isNaN(new Date(g.date).getTime()))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 12).reverse()
    .map(g => ({ id: g.id, date: String(g.date).slice(0, 10),
      minutes: g.stats.minsPlayed, played: g.stats.playedInGame === true }))
}

const ROLES = {
  goalkeeper: [
    ['Saves', 'saves'], ['Goals conceded', 'goalsConceded'],
    ['High claims', 'goodHighClaim'], ['Sweeper actions', 'accurateKeeperSweeper'],
  ],
  defender: [
    ['Interceptions', 'interceptionWon'], ['Won tackles', 'wonTackle'],
    ['Clearances', 'effectiveClearance'], ['Duels won', 'duelWon'],
  ],
  midfielder: [
    ['Final-third passes', 'successfulFinalThirdPasses'],
    ['Interceptions', 'interceptionWon'], ['Chances created', 'bigChanceCreated'],
    ['Duels won', 'duelWon'],
  ],
  forward: [
    ['Shots', 'totalScoringAtt'], ['Goals', 'goals'],
    ['Assists', 'goalAssist'], ['Chances created', 'bigChanceCreated'],
  ],
}

export function playerIndicators(player, record) {
  const games = (record?.games || []).filter(played)
  return (ROLES[positionGroup(player.position)] || []).map(([label, field]) => {
    const observed = games.filter(g => number(g.stats?.[field]))
    const minutes = observed.reduce((sum, g) => sum + g.stats.minsPlayed, 0)
    const total = observed.reduce((sum, g) => sum + g.stats[field], 0)
    return { label, field, observed: observed.length, possible: games.length,
      per90: minutes ? Math.round(90 * total / minutes * 10) / 10 : null,
      total: observed.length ? total : null }
  })
}

export function shotSeasons(record) {
  return Object.entries(record?.seasons || {})
    .filter(([, stats]) => number(stats?.xg) && number(stats?.goals))
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .slice(-8).map(([season, stats]) => ({
      season, xg: stats.xg, goals: stats.goals, shots: stats.shots ?? null,
    }))
}

export function sourceCoverage(players, understatLinks, understat, performance) {
  const groups = [
    { label: 'Played matches (Sorare events)', count: 0, color: '#b8e891' },
    { label: 'Shot events (Understat)', count: 0, color: '#7fbbcc' },
    { label: 'Identity only', count: 0, color: '#688776' },
    { label: 'Without linked source', count: 0, color: '#344e3d' },
  ]
  for (const player of players) {
    if ((performance?.players?.[player.id]?.games || []).some(played)) groups[0].count++
    else if ((understat?.players?.[player.id]?.shots || []).length) groups[1].count++
    else if (player.sorare_slug || understatLinks?.players?.[player.id]) groups[2].count++
    else groups[3].count++
  }
  return groups
}

export function positionDistribution(players) {
  const groups = [
    { label: 'Goalkeepers', key: 'goalkeeper', count: 0 },
    { label: 'Defenders', key: 'defender', count: 0 },
    { label: 'Midfielders', key: 'midfielder', count: 0 },
    { label: 'Forwards', key: 'forward', count: 0 },
    { label: 'Unknown', key: null, count: 0 },
  ]
  for (const player of players) {
    const group = positionGroup(player.position)
    groups.find(item => item.key === group).count++
  }
  return groups
}
