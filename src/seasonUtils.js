// One season selection for Sorare match dates and Understat season identifiers.
// Sorare seasons are grouped July to June. Understat supplies its own season year.
export function seasonOf(date) {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(String(date || ''))
  if (!match || +match[2] < 1 || +match[2] > 12) return null
  return String(+match[1] - (+match[2] < 7 ? 1 : 0))
}

export function seasonLabel(value) {
  const year = Number(value)
  return Number.isInteger(year) ? year + '/' + String(year + 1).slice(-2) : 'Unknown'
}

export function availableSeasons(performance, understat) {
  const seasons = new Set()
  for (const record of Object.values(performance?.players || {})) {
    for (const game of record.games || []) {
      const year = seasonOf(game.date)
      if (year) seasons.add(year)
    }
  }
  for (const record of Object.values(understat?.players || {})) {
    for (const year of Object.keys(record.seasons || {})) {
      if (/^\d{4}$/.test(year)) seasons.add(year)
    }
    for (const shot of record.shots || []) {
      const year = String(shot.season || '')
      if (/^\d{4}$/.test(year)) seasons.add(year)
    }
  }
  return [...seasons].sort((a, b) => Number(b) - Number(a))
}

function scoredGame(game) {
  return game.score_status === 'FINAL' && game.low_coverage === false &&
    game.stats?.playedInGame === true && Number(game.stats?.minsPlayed) > 0 &&
    Number.isFinite(game.score) && game.scoring_version != null
}

export function seasonSummary(games) {
  const played = games.filter(g => g.score_status === 'FINAL' &&
    g.stats?.playedInGame === true && Number(g.stats?.minsPlayed) > 0)
  const comparable = games.filter(scoredGame).sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const version = comparable[0]?.scoring_version ?? null
  const sameVersion = comparable.filter(g => String(g.scoring_version) === String(version))
  const fields = new Set(played.flatMap(g => Object.keys(g.stats || {})))
  const totals = {}
  for (const field of fields) {
    if (['playedInGame', 'onGameSheet', 'gameStarted', 'minsPlayed'].includes(field)) continue
    const values = played.map(g => g.stats[field]).filter(Number.isFinite)
    totals[field] = values.length ? values.reduce((a, b) => a + b, 0) : null
  }
  return {
    matches_played: played.length,
    minutes: played.reduce((sum, g) => sum + Number(g.stats.minsPlayed), 0),
    scored_matches: sameVersion.length,
    scoring_version: version,
    average_score: sameVersion.length ?
      Math.round(sameVersion.reduce((sum, g) => sum + g.score, 0) / sameVersion.length * 10) / 10 : null,
    totals,
  }
}

export function selectSorareSeason(performance, season) {
  if (!performance || season === 'all') return performance
  const players = {}
  for (const [id, record] of Object.entries(performance.players || {})) {
    const games = (record.games || []).filter(g => seasonOf(g.date) === season)
    if (!games.length) continue
    const dates = games.filter(g => g.score_status === 'FINAL' && g.stats?.playedInGame === true)
      .map(g => String(g.date).slice(0, 10)).sort()
    players[id] = {
      ...record, games, summary: seasonSummary(games),
      period_start: dates[0] || null, period_end: dates.at(-1) || null,
    }
  }
  return { ...performance, players }
}

export function selectUnderstatSeason(understat, season) {
  if (!understat || season === 'all') return understat
  const players = {}
  for (const [id, record] of Object.entries(understat.players || {})) {
    const shots = (record.shots || []).filter(shot => String(shot.season) === season)
    if (!shots.length) continue
    const xg = shots.reduce((sum, shot) => sum + shot.xg, 0)
    const goals = shots.filter(shot => shot.result === 'Goal').length
    const dates = shots.map(shot => shot.date).filter(Boolean).sort()
    players[id] = { ...record, shots, seasons: { [season]: record.seasons?.[season] || {
      shots: shots.length, goals, xg: Math.round(xg * 100) / 100,
    } }, stats: {
      shots: shots.length, goals, xg: Math.round(xg * 100) / 100,
      conversion_pct: Math.round(goals / shots.length * 1000) / 10,
      xg_per_shot: Math.round(xg / shots.length * 1000) / 1000,
    }, period_start: dates[0]?.slice(0, 10) || null, period_end: dates.at(-1)?.slice(0, 10) || null }
  }
  return { ...understat, players }
}

export function seasonEndDate(season) {
  return season === 'all' ? new Date() : new Date(Date.UTC(Number(season) + 1, 5, 30, 23, 59, 59))
}
