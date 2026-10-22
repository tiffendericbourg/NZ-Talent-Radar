// Keep calendar-year leagues separate from July-June seasons and cup fixtures.
// These are date-based scouting buckets, not claims of an official season ID.
const SPLIT = new Set([
  'championship', 'premiership', 'premier league', 'eredivisie', 'hnl',
  'superliga', 'ligue 2', '2. bundesliga', 'a-league men', 'a-league women',
  'uefa conference league', 'uefa europa league', 'uefa champions league',
  'afc champions league elite', 'play-offs 1/2',
])
const CALENDAR = new Set([
  'mls', 'eliteserien', 'j1 league', 'j2 league', 'k league 1', 'k league 2',
  'allsvenskan', 'veikkausliiga', 'usl championship',
])
const EVENTS = new Set([
  'friendlies', 'fifa world cup', 'fifa club world cup',
  'olympics men', 'olympics women', 'leagues cup',
  'concacaf champions cup', 'conmebol libertadores', 'conmebol sudamericana',
])

export function seasonOf(date) {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(String(date || ''))
  if (!match || +match[2] < 1 || +match[2] > 12) return null
  return String(+match[1] - (+match[2] < 7 ? 1 : 0))
}

export function seasonType(competition, date = '') {
  const name = String(competition || '').trim().toLowerCase()
  if (['j1 league', 'j2 league', 'j3 league'].includes(name) && date) {
    // Japan changed to August–June from 2026/27.
    // The Jan–Jul 2026 transition period isn't an ordinary league season.
    if (date >= '2026-08-01') return 'split'
    if (date >= '2026-01-01') return 'unclassified'
    return 'calendar'
  }
  if (CALENDAR.has(name)) return 'calendar'
  if (SPLIT.has(name)) return 'split'
  if (EVENTS.has(name)) return 'event'
  // Unknown or ambiguous league names must not be silently assigned a season.
  return 'unclassified'
}

export function gameSeasonKey(game) {
  const date = String(game?.date || '')
  const year = /^(\d{4})-(\d{2})-\d{2}/.exec(date)
  if (!year || +year[2] < 1 || +year[2] > 12) return null
  const type = seasonType(game.competition, date)
  const seasonYear = type === 'split' ? seasonOf(date) : year[1]
  return type + ':' + seasonYear
}

export function parseSeason(selection) {
  if (selection === 'all') return { type: 'all', year: null }
  const text = String(selection)
  const match = /^(split|calendar|event|unclassified):(\d{4})$/.exec(text)
  if (match) return { type: match[1], year: +match[2] }
  if (/^\d{4}$/.test(text)) return { type: 'split', year: +text } // legacy
  return { type: 'invalid', year: null }
}

export function seasonLabel(selection) {
  const { type, year } = parseSeason(selection)
  if (year === null) return 'Unknown'
  if (type === 'calendar') return year + ' · calendar leagues'
  if (type === 'event') return year + ' · cups & friendlies'
  if (type === 'unclassified') return year + ' · season to verify'
  return year + '/' + String(year + 1).slice(-2) + ' · July–June'
}

export function availableSeasons(performance, understat) {
  const seasons = new Set()
  for (const record of Object.values(performance?.players || {})) {
    for (const game of record.games || []) {
      const key = gameSeasonKey(game)
      if (key) seasons.add(key)
    }
  }
  for (const record of Object.values(understat?.players || {})) {
    for (const year of Object.keys(record.seasons || {})) {
      if (/^\d{4}$/.test(year)) seasons.add('split:' + year)
    }
    for (const shot of record.shots || []) {
      const year = String(shot.season || '')
      if (/^\d{4}$/.test(year)) seasons.add('split:' + year)
    }
  }
  const order = { split: 0, calendar: 1, event: 2, unclassified: 3 }
  return [...seasons].sort((a, b) => {
    const left = parseSeason(a), right = parseSeason(b)
    return right.year - left.year || order[left.type] - order[right.type]
  })
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
    scored_matches: sameVersion.length, scoring_version: version,
    average_score: sameVersion.length ?
      Math.round(sameVersion.reduce((sum, g) => sum + g.score, 0) / sameVersion.length * 10) / 10 : null,
    totals,
  }
}

export function selectSorareSeason(performance, selection) {
  if (!performance || selection === 'all') return performance
  const { type, year } = parseSeason(selection)
  if (year === null) return { ...performance, players: {} }
  const key = type + ':' + year
  const players = {}
  for (const [id, record] of Object.entries(performance.players || {})) {
    const games = (record.games || []).filter(g => gameSeasonKey(g) === key)
    if (!games.length) continue
    const dates = games.filter(g => g.score_status === 'FINAL' && g.stats?.playedInGame === true)
      .map(g => String(g.date).slice(0, 10)).sort()
    players[id] = { ...record, games, summary: seasonSummary(games),
      period_start: dates[0] || null, period_end: dates.at(-1) || null }
  }
  return { ...performance, players }
}

export function selectUnderstatSeason(understat, selection) {
  if (!understat || selection === 'all') return understat
  const { type, year } = parseSeason(selection)
  // Understat's season IDs refer to July–June league seasons only.
  if (type !== 'split' || year === null) return { ...understat, players: {} }
  const players = {}
  for (const [id, record] of Object.entries(understat.players || {})) {
    const shots = (record.shots || []).filter(shot => String(shot.season) === String(year))
    if (!shots.length) continue
    const xg = shots.reduce((sum, shot) => sum + shot.xg, 0)
    const goals = shots.filter(shot => shot.result === 'Goal').length
    const dates = shots.map(shot => shot.date).filter(Boolean).sort()
    players[id] = { ...record, shots, seasons: { [year]: record.seasons?.[year] || {
      shots: shots.length, goals, xg: Math.round(xg * 100) / 100,
    } }, stats: {
      shots: shots.length, goals, xg: Math.round(xg * 100) / 100,
      conversion_pct: Math.round(goals / shots.length * 1000) / 10,
      xg_per_shot: Math.round(xg / shots.length * 1000) / 1000,
    }, period_start: dates[0]?.slice(0, 10) || null, period_end: dates.at(-1)?.slice(0, 10) || null }
  }
  return { ...understat, players }
}

export function seasonStartDate(selection) {
  const { type, year } = parseSeason(selection)
  if (year === null) return null
  return type === 'split' ? new Date(Date.UTC(year, 6, 1)) : new Date(Date.UTC(year, 0, 1))
}

export function seasonEndDate(selection) {
  const { type, year } = parseSeason(selection)
  if (year === null) return new Date()
  return type === 'split' ? new Date(Date.UTC(year + 1, 5, 30, 23, 59, 59)) :
    new Date(Date.UTC(year, 11, 31, 23, 59, 59))
}
