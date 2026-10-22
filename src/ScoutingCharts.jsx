// Lightweight charts for actual match events, availability and sourced shots.
import { minutesByMatch, playerIndicators, shotSeasons,
  sourceCoverage, positionDistribution } from './chartData.js'

const lime = '#b8e891'
const aqua = '#7fbbcc'
const ink = '#89a991'
const clamp = value => Math.max(0, Math.min(100, value))
const fmt = value => Number(value).toFixed(1)
const shortDate = value => value ? String(value).slice(5, 10).replace('-', '/') : '—'

function EmptyChart({ children }) {
  return <div className="chart-empty"><span className="eyebrow">AWAITING SOURCE DATA</span><p>{children}</p></div>
}
function ChartPanel({ title, eyebrow, note, children }) {
  return <article className="viz-panel">
    <div className="viz-header"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div></div>
    {children}{note && <p className="viz-note">{note}</p>}
  </article>
}

export function MinutesChart({ record }) {
  const series = minutesByMatch(record)
  return <ChartPanel title="Minutes played" eyebrow="AVAILABILITY"
    note={series.length ? 'Last ' + series.length + ' finished fixtures with recorded minutes.' :
      'Time on the pitch is shown only when the source provides match minutes.'}>
    {!series.length ? <EmptyChart>No sourced playing-time history available.</EmptyChart> :
      <><div className="viz-summary"><strong>{series.reduce((s, g) => s + g.minutes, 0)}</strong>
        <span>documented minutes in these fixtures</span></div>
        <div className="minutes-chart" role="img" aria-label="Minutes played per match">
          {series.map((g, i) => <div className="minutes-col" key={g.id || i}>
            <span className="minutes-value">{g.minutes}</span>
            <div className="minutes-bar-track"><div className="minutes-bar"
              title={g.date + ': ' + g.minutes + ' min'}
              style={{ height: clamp(g.minutes / 90 * 100) + '%' }}/></div>
            <small>{shortDate(g.date)}</small>
          </div>)}</div></>}
  </ChartPanel>
}

export function PositionIndicators({ player, record }) {
  const metrics = playerIndicators(player, record)
  return <ChartPanel title="Role indicators" eyebrow="RECORDED FOOTBALL ACTIONS / 90"
    note="Events per 90 use only matches where the action and minutes are documented. Partial coverage is stated, not assumed zero.">
    {!metrics.length ? <EmptyChart>Playing role not documented precisely enough for event metrics.</EmptyChart> :
      <div className="role-kpis">{metrics.map(m => <div className="role-kpi" key={m.field}>
        <span>{m.label}</span>
        <strong>{m.per90 === null ? '—' : fmt(m.per90)}<small>{m.per90 === null ? '' : ' /90'}</small></strong>
        <small>{m.observed ? m.observed + ' / ' + m.possible + ' matches covered' : 'Not reported'}</small>
      </div>)}</div>}
  </ChartPanel>
}

export function GoalXgChart({ record }) {
  const data = shotSeasons(record)
  const max = Math.max(1, ...data.flatMap(d => [d.goals, d.xg]))
  return <ChartPanel title="Goals vs expected goals" eyebrow="UNDERSTAT / SEASON"
    note={data.length ? 'Actual shot outcomes versus imported expected goals. No season extrapolation.' :
      'No authorized Understat shot events have been imported yet.'}>
    {!data.length ? <EmptyChart>Expected goals will appear after verified shot imports.</EmptyChart> :
      <><div className="viz-legend"><span><i style={{ background: lime }}/> Goals</span>
        <span><i style={{ background: aqua }}/> xG</span></div>
        <div className="xg-season-chart">{data.map(d => <div className="xg-season" key={d.season}>
          <div className="xg-pair">
            <div title={d.season + ' goals: ' + d.goals} style={{ height: d.goals / max * 100 + '%', background: lime }}/>
            <div title={d.season + ' xG: ' + fmt(d.xg)} style={{ height: d.xg / max * 100 + '%', background: aqua }}/>
          </div><strong>{d.goals} / {fmt(d.xg)}</strong><small>{d.season}</small>
        </div>)}</div></>}
  </ChartPanel>
}

export function CoverageChart({ players, understatLinks, understat, performance }) {
  const series = sourceCoverage(players, understatLinks, understat, performance)
  const total = players.length
  let offset = 0
  return <ChartPanel title="What's actually available?" eyebrow="SOURCE COVERAGE"
    note="Exclusive categories: completed played match events, Understat shots, then verified identity links. An identity is not a performance.">
    <div className="coverage-layout"><svg viewBox="0 0 220 220" className="coverage-donut"
      role="img" aria-label="Player data coverage">
      <circle cx="110" cy="110" r="73" fill="none" stroke="#29412f" strokeWidth="22"/>
      {series.map(d => {
        const portion = total ? d.count / total * 100 : 0
        const current = offset
        offset += portion
        return <circle key={d.label} cx="110" cy="110" r="73" fill="none" stroke={d.color}
          strokeWidth="22" pathLength="100" strokeDasharray={portion + ' ' + (100 - portion)}
          strokeDashoffset={-current} transform="rotate(-90 110 110)">
          <title>{d.label}: {d.count} / {total}</title>
        </circle>
      })}
      <text x="110" y="105" textAnchor="middle" fontSize="35" fontWeight="700" fill="#e2f3df">{total}</text>
      <text x="110" y="129" textAnchor="middle" fontSize="11" fill={ink}>NZ-linked players</text>
    </svg><div className="coverage-legend">{series.map(d => <div key={d.label}>
      <i style={{ background: d.color }}/><span>{d.label}</span><strong>{d.count}</strong>
    </div>)}</div></div>
  </ChartPanel>
}

export function PositionsChart({ players }) {
  const groups = positionDistribution(players)
  const max = Math.max(1, ...groups.map(g => g.count))
  return <ChartPanel title="Players by position" eyebrow="FULL NZ CATALOGUE"
    note="Broad documented roles only; unknown positions remain a separate group.">
    <div className="position-bars">{groups.map(group => <div key={group.label} className="position-bar-line">
      <div><span>{group.label}</span><strong>{group.count}</strong></div>
      <div className="position-bar-track"><div style={{ width: group.count / max * 100 + '%' }}/></div>
    </div>)}</div>
  </ChartPanel>
}
