// Human-readable scouting decisions from sourced events and the NZ Impact Index.
import { impactFor, footballGames } from './impactIndex.js'

export function ageAt(birthDate, date = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '')) return null
  const birth = new Date(birthDate + 'T00:00:00Z')
  if (Number.isNaN(birth.getTime()) || birth > date) return null
  return date.getUTCFullYear() - birth.getUTCFullYear() -
    (date.getUTCMonth() < birth.getUTCMonth() ||
      (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate()) ? 1 : 0)
}

export function matchSample(record, end = new Date(), start = null) {
  return { games: footballGames(record, end, start) }
}

export function scoutingReport(player, performance, cohort, end = new Date(), start = null) {
  const model = impactFor(player, cohort, performance, end, start)
  const evidence = model.confidence === 'Stronger sample' ? 'Substantial sample' :
    model.confidence === 'Developing sample' ? 'Preliminary sample' : 'Limited sample'
  const observations = model.matches ?
    [model.matches + ' completed matches and ' + model.minutes +
      ' recorded minutes in this comparison window.'] :
    ['No verified played matches in this period. No performance conclusion is possible.']
  const strongest = model.indicators?.filter(m => m.per90 !== null)
    .sort((a, b) => (b.percentile ?? -1) - (a.percentile ?? -1))[0]
  if (strongest) {
    observations.push(strongest.label + ': ' + strongest.per90.toFixed(1) +
      ' across ' + strongest.observed + ' documented matches.')
  }
  if (model.index !== null && model.index !== undefined) {
    observations.push('NZ Impact Index: ' + model.index + '/100 based on ' +
      model.usableSignals + ' observed role indicators. Relative to ' +
      model.referenceSize + ' players in this NZ cohort; not adjusted for league strength.')
  } else if (model.matches) {
    observations.push('NZ Impact Index unavailable: ' + (model.reason ||
      'not enough matching role data') + '.')
  }
  const nextAction = model.minutes >= 300 && model.matches >= 3 ?
    'Review full-match video, the player’s role and the strength of the league before recommending further observation.' :
    'Confirm current club and collect more documented playing time before issuing a scouting judgement.'
  return {
    ...model, games: model.matches, metrics: model.indicators, evidence,
    observations, nextAction,
    matchStart: model.periodStart, matchEnd: model.periodEnd,
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
