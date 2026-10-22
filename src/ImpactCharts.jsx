// Clean football-event charts for the NZ Impact Index.
import { impactFor, footballGames, ROLE_SIGNALS } from './impactIndex.js'
import { seasonEndDate, seasonStartDate } from './seasonUtils.js'
import { positionGroup } from './rankingUtils.js'

export function ActivityChart({ player, record, season = 'all' }) {
  const group = positionGroup(player.position)
  const signal = ROLE_SIGNALS[group]?.[0]
  const rows = signal ? footballGames(record, seasonEndDate(season), seasonStartDate(season)).slice(0, 12).reverse()
    .filter(g => typeof g.stats?.[signal.field] === 'number' &&
      Number.isFinite(g.stats[signal.field]))
    .map(g => ({ id: g.id, date: String(g.date).slice(5, 10), value: g.stats[signal.field] })) : []
  const max = Math.max(1, ...rows.map(r => r.value))
  return <article className="viz-panel">
    <div className="viz-header"><div><span className="eyebrow">DOCUMENTED MATCH EVENTS</span>
      <h3>{signal ? signal.label.replace('/ 90', ' per match') : 'Role activity'}</h3></div></div>
    {rows.length ? <div className="minutes-chart" role="img"
      aria-label={'Events by match: ' + signal.label}>
      {rows.map((r, i) => <div className="minutes-col" key={r.id || i}>
        <span className="minutes-value">{r.value}</span>
        <div className="minutes-bar-track"><div className="minutes-bar"
          title={r.date + ' · ' + r.value + ' events'}
          style={{ height: r.value / max * 100 + '%' }}/></div>
        <small>{r.date}</small>
      </div>)}
    </div> : <div className="chart-empty"><p>No role-specific match events available in the selected period.</p></div>}
    <p className="viz-note">Recorded football actions only. Values are not fantasy scores, and the competition's tactical context matters.</p>
  </article>
}

export function ImpactContextChart({ player, players, performance, season = 'all' }) {
  const report = impactFor(player, players, performance, seasonEndDate(season), seasonStartDate(season))
  const observed = report.indicators?.filter(i => i.per90 !== null) || []
  return <article className="viz-panel">
    <div className="viz-header"><div><span className="eyebrow">NZ ROLE REFERENCE</span>
      <h3>Impact components</h3></div></div>
    {report.index !== null && report.index !== undefined ? <>
      <div className="viz-summary"><strong>{report.index}</strong>
        <span>NZ Impact / 100 · {report.confidence.toLowerCase()} · {report.referenceSize} potential peers</span></div>
      <div className="peer-bars">{report.indicators.filter(m => m.percentile !== null).map(m =>
        <div className="peer-row" key={m.field}>
          <div><span>{m.label} · {m.per90} events/90</span><strong>{Math.round(m.percentile)}/100</strong></div>
          <div className="peer-track"><div style={{ width: m.percentile + '%' }}/></div>
          <p>{m.referenceCount} peers reporting this action · weight {Math.round(m.weight * 100)}%</p>
        </div>)}</div>
    </> : <div className="chart-empty"><p>NZ Impact is not available for this player yet: {report.reason || 'insufficient football-event coverage'}.</p>
      {observed.length > 0 && <p>{observed.length} observed role indicators, but not enough reference evidence for a composite index.</p>}
    </div>}
    <p className="viz-note">Relative to New Zealand players of the same gender and broad role. No league-level adjustment. This index is not a national-team selection score.</p>
  </article>
}
