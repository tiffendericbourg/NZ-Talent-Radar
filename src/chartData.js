// Small, source-only helpers for the scouting graphs. No estimated match values.
import { positionGroup, rankingRows } from './rankingUtils.js'

const number = value => typeof value === 'number' && Number.isFinite(value)
const played = game => game && game.score_status === 'FINAL' &&
  game.stats?.playedInGame === true && number(game.stats.minsPlayed) &&
  game.stats.minsPlayed > 0 && game.low_coverage === false

export function scoredGames(record) {
  const games = (record?.games || []).filter(game =>
    played(game) && number(game.score) && game.scoring_version != null &&
    !Number.isNaN(new Date(game.date).getTime()))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  if (!games.length) return []
  // Sorare changed scoring rules over time: a single trend never mixes versions.
  const version = String(games[0].scoring_version)
  return games.filter(g => String(g.scoring_version) === version).slice(0, 15).reverse()
    .map(g => ({
      id: g.id, date: String(g.date).slice(0, 10), score: g.score,
      minutes: g.stats.minsPlayed, version,
    }))
}

export function minutesByMatch(record) {
  return (record?.games || [])
    .filter(g => g && g.score_status === 'FINAL' &&
      g.low_coverage === false && number(g.stats?.minsPlayed) &&
      g.stats.minsPlayed >= 0 && !Number.isNaN(new Date(g.date).getTime()))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 12).reverse()
    .map(g => ({
      id: g.id, date: String(g.date).slice(0, 10),
      minutes: g.stats.minsPlayed, played: g.stats.playedInGame === true,
    }))
}

const DEFAULTS = {
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
  const fields = DEFAULTS[positionGroup(player.position)] || []
  return fields.map(([label, field]) => {
    const observed = games.filter(g => number(g.stats?.[field]))
    const mins = observed.reduce((sum, g) => sum + g.stats.minsPlayed, 0)
    const total = observed.reduce((sum, g) => sum + g.stats[field], 0)
    return {
      label, field, observed: observed.length, possible: games.length,
      per90: mins > 0 ? Math.round(total / mins * 900) / 10 : null,
      total: observed.length ? total : null,
    }
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
    { label: 'Match stats (Sorare)', count: 0, color: '#b8e891' },
    { label: 'Shot events (Understat)', count: 0, color: '#7fbbcc' },
    { label: 'Identity only', count: 0, color: '#688776' },
    { label: 'Without linked source', count: 0, color: '#344e3d' },
  ]
  for (const player of players) {
    const id = player.id
    if (scoredGames(performance?.players?.[id]).length > 0) groups[0].count++
    else if ((understat?.players?.[id]?.shots || []).length > 0) groups[1].count++
    else if (player.sorare_slug || understatLinks?.players?.[id]) groups[2].count++
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
  for (const p of players) {
    const group = positionGroup(p.position)
    groups.find(item => item.key === group).count++
  }
  return groups
}

export function peerComparison(player, record, players, performance, now = new Date()) {
  const current = rankingRows([player], { players: { [player.id]: record } }, now)[0]
  if (!current?.eligible) return null
  const peers = rankingRows(players, performance, now)
    .filter(p => p.eligible && p.gender === player.gender &&
      p.group === current.group && p.version === current.version)
    .sort((a, b) => a.average - b.average)
  if (peers.length < 3) return null
  const mid = Math.floor(peers.length / 2)
  const median = peers.length % 2 ? peers[mid].average :
    (peers[mid - 1].average + peers[mid].average) / 2
  return {
    player: current.average, median: Math.round(median * 10) / 10,
    cohortSize: peers.length, gender: player.gender, position: current.group,
    scoringVersion: current.version,
  }
}

export function scoreDistribution(rows) {
  const bins = [
    { label: '<20', count: 0 }, { label: '20–39', count: 0 },
    { label: '40–59', count: 0 }, { label: '60–79', count: 0 },
    { label: '80+', count: 0 },
  ]
  for (const p of rows) {
    if (!number(p.average)) continue
    const index = p.average < 20 ? 0 : p.average < 40 ? 1 :
      p.average < 60 ? 2 : p.average < 80 ? 3 : 4
    bins[index].count++
  }
  return bins
}
