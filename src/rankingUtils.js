// Shared calculations for the sourced NZ talent ranking.
// All statistics come from individual Sorare match records.
export const RANKING_MIN_MATCHES = 3
export const RANKING_MIN_MINUTES = 180
export const RANKING_WINDOW_DAYS = 365

export const POSITIONS = [
  { value: 'forward', label: 'Forwards' },
  { value: 'midfielder', label: 'Midfielders' },
  { value: 'defender', label: 'Defenders' },
  { value: 'goalkeeper', label: 'Goalkeepers' },
]

export function positionGroup(position) {
  const p = String(position || '').toLowerCase().replace(/[_-]/g, ' ')
  if (/keeper|goalie/.test(p)) return 'goalkeeper'
  if (/defend|back|centre back|center back|fullback/.test(p)) return 'defender'
  if (/midfield|wing half/.test(p)) return 'midfielder'
  if (/forward|striker|winger|attacker|attack/.test(p)) return 'forward'
  return null
}

function ageOn(birth, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return null
  const date = new Date(birth + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime())) return null
  let years = now.getUTCFullYear() - date.getUTCFullYear()
  if (now.getUTCMonth() < date.getUTCMonth() ||
      (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())) years--
  return years
}

export function playerRankingData(player, record, now = new Date()) {
  const result = {
    ...player, group: positionGroup(player.position), age: ageOn(player.birth_date, now),
    eligible: false, average: null, minutes: 0, matches: 0,
    version: null, start: null, end: null, keyMetric: null,
    retrievedAt: record?.retrieved_at || null,
    reason: 'No verified match statistics',
  }
  if (!Array.isArray(record?.games) || record.games.length === 0) return result

  const today = now.getTime()
  const since = today - RANKING_WINDOW_DAYS * 86400000
  const good = record.games.filter(g => {
    const date = new Date(g.date).getTime()
    return Number.isFinite(date) && date >= since && date <= today &&
      g.score_status === 'FINAL' && g.stats?.playedInGame === true &&
      Number(g.stats?.minsPlayed) > 0 &&
      typeof g.score === 'number' && Number.isFinite(g.score) &&
      g.low_coverage === false &&
      g.scoring_version !== null && g.scoring_version !== undefined
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)))

  if (good.length === 0) {
    result.reason = 'No recent, complete Sorare match scores'
    return result
  }
  // Use one Sorare scoring version. Do not mix versions inside a mean.
  const version = String(good[0].scoring_version)
  const matches = good.filter(g => String(g.scoring_version) === version)
  result.matches = matches.length
  result.minutes = matches.reduce((sum, g) => sum + Number(g.stats.minsPlayed), 0)
  result.average = Math.round(matches.reduce((sum, g) => sum + g.score, 0) / matches.length * 10) / 10
  result.version = version
  result.start = matches.at(-1).date.slice(0, 10)
  result.end = matches[0].date.slice(0, 10)

  // Contextual per-90 signal; omit if even one match lacks the source field.
  const fields = result.group === 'goalkeeper' ? ['saves']
    : result.group === 'defender' ? ['interceptionWon', 'wonTackle']
      : result.group === 'midfielder' ? ['successfulFinalThirdPasses']
        : result.group === 'forward' ? ['totalScoringAtt'] : []
  if (fields.length > 0 && matches.every(g => fields.every(f =>
    typeof g.stats[f] === 'number' && Number.isFinite(g.stats[f])))) {
    const total = matches.reduce((sum, g) =>
      sum + fields.reduce((n, field) => n + g.stats[field], 0), 0)
    result.keyMetric = Math.round(total / result.minutes * 900) / 10
  }
  result.eligible = Boolean(result.group) &&
    result.matches >= RANKING_MIN_MATCHES &&
    result.minutes >= RANKING_MIN_MINUTES
  result.reason = result.eligible ? null : 'Small sample: at least 3 matches and 180 minutes required'
  return result
}

export function rankingRows(players, performance, now = new Date()) {
  return players.filter(p => p.sorare_slug || performance?.players?.[p.id])
    .map(p => playerRankingData(p, performance?.players?.[p.id], now))
}
