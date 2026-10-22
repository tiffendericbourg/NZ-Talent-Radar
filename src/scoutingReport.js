// Transparent scouting notes built from documented Sorare match observations.
// A review priority is not a talent prediction or a selection recommendation.
import { positionGroup, RANKING_WINDOW_DAYS } from './rankingUtils.js'

const finite = value => typeof value === 'number' && Number.isFinite(value)
const ROLES = {
  goalkeeper: [['Saves', 'saves'], ['High claims', 'goodHighClaim'], ['Goals conceded', 'goalsConceded']],
  defender: [['Won tackles', 'wonTackle'], ['Interceptions', 'interceptionWon'], ['Duels won', 'duelWon']],
  midfielder: [['Final-third passes', 'successfulFinalThirdPasses'], ['Duels won', 'duelWon'], ['Interceptions', 'interceptionWon']],
  forward: [['Shots', 'totalScoringAtt'], ['Goals', 'goals'], ['Chances created', 'bigChanceCreated']],
}

export function ageAt(birthDate, date = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '')) return null
  const birth = new Date(birthDate + 'T00:00:00Z')
  if (Number.isNaN(birth.getTime()) || birth > date) return null
  return date.getUTCFullYear() - birth.getUTCFullYear() -
    (date.getUTCMonth() < birth.getUTCMonth() ||
      (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate()) ? 1 : 0)
}

export function matchSample(record, end = new Date(), start = null) {
  const finalTime = end.getTime()
  const firstTime = start ? start.getTime() : finalTime - RANKING_WINDOW_DAYS * 86400000
  const matches = (record?.games || []).filter(game => {
    const date = new Date(game.date).getTime()
    return Number.isFinite(date) && date >= firstTime && date <= finalTime &&
      game.score_status === 'FINAL' && game.low_coverage === false &&
      game.stats?.playedInGame === true && finite(game.stats?.minsPlayed) &&
      game.stats.minsPlayed > 0 && finite(game.score) && game.scoring_version != null
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)))
  if (!matches.length) return { games: [], version: null }
  const version = String(matches[0].scoring_version)
  return { games: matches.filter(game => String(game.scoring_version) === version), version }
}

function metricRows(group, games) {
  return (ROLES[group] || []).map(([label, field]) => {
    const observed = games.filter(game => finite(game.stats?.[field]))
    const minutes = observed.reduce((total, game) => total + game.stats.minsPlayed, 0)
    const total = observed.reduce((sum, game) => sum + game.stats[field], 0)
    return {
      label, field, observed: observed.length, possible: games.length,
      per90: minutes > 0 ? Math.round(total / minutes * 900) / 10 : null,
    }
  })
}

export function scoutingReport(player, performance, cohort, end = new Date(), start = null) {
  const group = positionGroup(player.position)
  const record = performance?.players?.[player.id]
  const { games, version } = matchSample(record, end, start)
  const minutes = games.reduce((sum, game) => sum + game.stats.minsPlayed, 0)
  const average = games.length ?
    Math.round(games.reduce((sum, game) => sum + game.score, 0) / games.length * 10) / 10 : null
  const metrics = metricRows(group, games)
  const coverage = metrics.filter(m => m.possible >= 3 && m.observed === m.possible && m.per90 !== null)
  const evidence = minutes >= 900 && games.length >= 10 ? 'Substantial sample' :
    minutes >= 300 && games.length >= 3 ? 'Preliminary sample' : 'Limited sample'

  // A peer comparison is shown for context, never as a cross-league talent rating.
  const peers = (cohort || []).filter(p => p.gender === player.gender &&
    positionGroup(p.position) === group && group !== null).map(p => {
    const sample = matchSample(performance?.players?.[p.id], end, start)
    if (sample.version !== version || sample.games.length < 3) return null
    const mins = sample.games.reduce((sum, game) => sum + game.stats.minsPlayed, 0)
    if (mins < 180) return null
    return sample.games.reduce((sum, game) => sum + game.score, 0) / sample.games.length
  }).filter(finite).sort((a, b) => a - b)
  const mid = Math.floor(peers.length / 2)
  const peerMedian = peers.length >= 3 ?
    Math.round((peers.length % 2 ? peers[mid] : (peers[mid - 1] + peers[mid]) / 2) * 10) / 10 : null

  const observations = []
  if (games.length) {
    observations.push(games.length + ' completed, scored matches and ' + minutes +
      ' recorded minutes in this comparison window.')
  } else {
    observations.push('No comparable Sorare match scores in this period. There is no performance conclusion.')
  }
  if (coverage.length) {
    const signal = coverage[0]
    observations.push(signal.label + ': ' + signal.per90.toFixed(1) +
      ' per 90 over ' + signal.observed + ' fully documented matches (descriptive, not a strength rating).')
  } else if (games.length) {
    observations.push('Role-specific match statistics are not complete enough for a reliable per-90 observation.')
  }
  if (peerMedian !== null) {
    observations.push('Sorare score: ' + average.toFixed(1) + ' versus NZ peer median ' +
      peerMedian.toFixed(1) + ' (' + peers.length + ' players, same broad role, gender and score version).')
  }
  const nextAction = minutes >= 300 && games.length >= 3 ?
    'Review full-match video and the league context before drawing a sporting conclusion.' :
    'Collect more match minutes, verify the current club and request video before assessing this player.'
  return {
    player, group, games: games.length, minutes, average, version, metrics,
    evidence, peerMedian, peerCount: peers.length, observations, nextAction,
    matchStart: games.at(-1)?.date?.slice(0, 10) || null,
    matchEnd: games[0]?.date?.slice(0, 10) || null,
    retrievedAt: record?.retrieved_at || null,
  }
}

export function u23Research(players, performance, end = new Date(), start = null, asOf = new Date()) {
  const all = (players || []).filter(p => {
    const age = ageAt(p.birth_date, asOf)
    return age !== null && age < 23 && p.eligibility_status !== 'potential_to_verify'
  })
  const abroad = all.filter(p => p.club_country && p.club_country !== 'New Zealand')
  const knownLocal = all.filter(p => p.club_country === 'New Zealand')
  const unknownClub = all.filter(p => !p.club_country)
  const withMatches = all.map(p => scoutingReport(p, performance, players, end, start))
    .filter(r => r.games > 0)
  // Select documented review cases, not the "best" players: minutes first,
  // with some position diversity. Scores are not compared across leagues or roles.
  const ready = withMatches.filter(r => r.games >= 3 && r.minutes >= 180)
    .sort((a, b) => b.minutes - a.minutes || b.games - a.games ||
      a.player.name.localeCompare(b.player.name))
  const selected = []
  const usedRoles = new Set()
  for (const report of ready) {
    if (selected.length === 3) break
    if (report.group && !usedRoles.has(report.group)) {
      selected.push(report)
      usedRoles.add(report.group)
    }
  }
  for (const report of ready) {
    if (selected.length === 3) break
    if (!selected.some(p => p.player.id === report.player.id)) selected.push(report)
  }
  return {
    total: all.length, abroad: abroad.length, knownLocal: knownLocal.length,
    unknownClub: unknownClub.length, withMatches: withMatches.length,
    ready: ready.length, selected,
    pending: withMatches.filter(r => !ready.some(x => x.player.id === r.player.id))
      .sort((a, b) => b.minutes - a.minutes).slice(0, 5),
  }
}
