import { seasonEndDate, seasonLabel } from './seasonUtils.js'
import {
  scoredGames, minutesByMatch, playerIndicators, shotSeasons,
  sourceCoverage, positionDistribution, peerComparison, scoreDistribution,
} from './chartData.js'

const lime = '#b8e891'
const aqua = '#7fbbcc'
const ink = '#89a991'
const clamp = value => Math.max(0, Math.min(100, value))
const number = value => typeof value === 'number' && Number.isFinite(value)
const fmt = value => Number(value).toFixed(1)
const shortDate = value => value ? String(value).slice(5, 10).replace('-', '/') : '—'

function EmptyChart({ children }) {
  return <div className="chart-empty">
    <span className="eyebrow">AWAITING SOURCE DATA</span>
    <p>{children}</p>
  </div>
}

function ChartPanel({ title, eyebrow, note, children, className = '' }) {
  return <article className={'viz-panel ' + className}>
    <div className="viz-header"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div></div>
    {children}
    {note && <p className="viz-note">{note}</p>}
  </article>
}

export function FormChart({ record }) {
  const series = scoredGames(record)
  const x = i => 42 + (series.length === 1 ? 235 : i / (series.length - 1) * 470)
  const y = score => 26 + (100 - clamp(score)) * 1.85
  const average = series.length ?
    series.reduce((sum, game) => sum + game.score, 0) / series.length : null
  const points = series.map((g, i) => x(i) + ',' + y(g.score)).join(' ')
  return <ChartPanel title="Sorare form" eyebrow="MATCH-BY-MATCH" note={series.length
    ? 'Comparable scores only · scoring version ' + series[0].version +
      ' · ' + series[0].date + ' → ' + series.at(-1).date
    : 'Scores from finalized played games only; low-coverage and mixed scoring versions excluded.'}>
    {!series.length ? <EmptyChart>No verified match scores collected for this player yet.</EmptyChart>
      : <><div className="viz-summary"><strong>{fmt(average)}</strong><span>average Sorare score across {series.length} matches</span></div>
        <svg className="viz-svg" viewBox="0 0 560 252" role="img"
          aria-label={'Sorare score trend in chronological order over ' + series.length + ' matches'}>
          {[0, 50, 100].map(t => <g key={t}>
            <line x1="42" x2="512" y1={y(t)} y2={y(t)} stroke="#3d5944" strokeDasharray="3 5"/>
            <text x="31" y={y(t) + 4} textAnchor="end" fill={ink} fontSize="11">{t}</text>
          </g>)}
          {series.length > 1 && <polyline fill="none" stroke={lime} strokeWidth="3"
            strokeLinejoin="round" strokeLinecap="round" points={points}/>}
          {series.map((g, i) => <circle key={g.id || i} cx={x(i)} cy={y(g.score)} r="5"
            fill={lime} stroke="#132219" strokeWidth="2">
            <title>{g.date} · Sorare {g.score} · {g.minutes} minutes</title>
          </circle>)}
          <text x="42" y="240" fontSize="11" fill={ink}>{shortDate(series[0].date)}</text>
          <text x="512" y="240" fontSize="11" fill={ink} textAnchor="end">{shortDate(series.at(-1).date)}</text>
        </svg>
      </>}
  </ChartPanel>
}

export function MinutesChart({ record }) {
  const series = minutesByMatch(record)
  return <ChartPanel title="Minutes played" eyebrow="AVAILABILITY"
    note={series.length
      ? 'Last ' + series.length + ' finished fixtures with recorded minutes · zero means 0 minutes reported.'
      : 'Time on the pitch is shown only when Sorare provides match minutes.'}>
    {!series.length ? <EmptyChart>No sourced playing-time history available.</EmptyChart>
      : <><div className="viz-summary"><strong>{series.reduce((sum, g) => sum + g.minutes, 0)}</strong><span>recorded minutes in this chart</span></div>
        <div className="minutes-chart" role="img" aria-label="Minutes played per match, chronological order">
          {series.map(g => <div className="minutes-col" key={g.id}>
            <span className="minutes-value">{g.minutes}</span>
            <div className="minutes-bar-track">
              <div className="minutes-bar" style={{ height: clamp(g.minutes / 90 * 100) + '%' }}
                title={g.date + ': ' + g.minutes + ' min'} />
            </div>
            <small>{shortDate(g.date)}</small>
          </div>)}
        </div>
      </>}
  </ChartPanel>
}

export function PositionIndicators({ player, record }) {
  const metrics = playerIndicators(player, record)
  return <ChartPanel title="Role indicators" eyebrow="STATISTICS / PER 90"
    note="Per-90 values use only games where both the statistic and minutes are reported. Partial coverage is shown; no missing values are converted to zero.">
    {!metrics.length ? <EmptyChart>Player position is not precise enough for role-specific indicators.</EmptyChart>
      : <div className="role-kpis">
        {metrics.map(m => <div className="role-kpi" key={m.field}>
          <span>{m.label}</span>
          <strong>{m.per90 === null ? '—' : fmt(m.per90)}<small>{m.per90 === null ? '' : ' /90'}</small></strong>
          <small>{m.observed ? m.observed + ' of ' + m.possible + ' matches documented' : 'Not reported by Sorare'}</small>
        </div>)}
      </div>}
  </ChartPanel>
}

export function GoalXgChart({ record }) {
  const data = shotSeasons(record)
  const max = Math.max(1, ...data.flatMap(d => [d.goals, d.xg]))
  return <ChartPanel title="Goals vs expected goals" eyebrow="UNDERSTAT / SEASON-BY-SEASON"
    note={data.length ? 'Goals are actual shot outcomes; xG is the expected total from imported Understat shots. Seasons are not extrapolated.' :
      'No Understat shot export has been imported for this player.'}>
    {!data.length ? <EmptyChart>Expected goals charts will appear once verified shot events are imported.</EmptyChart> :
      <><div className="viz-legend"><span><i style={{ background: lime }}/> Goals</span><span><i style={{ background: aqua }}/> xG</span></div>
        <div className="xg-season-chart">
          {data.map(d => <div className="xg-season" key={d.season}>
            <div className="xg-pair">
              <div title={d.season + ' goals: ' + d.goals} style={{ height: (d.goals / max * 100) + '%', background: lime }} />
              <div title={d.season + ' xG: ' + fmt(d.xg)} style={{ height: (d.xg / max * 100) + '%', background: aqua }} />
            </div>
            <strong>{d.goals} / {fmt(d.xg)}</strong>
            <small>{d.season}</small>
          </div>)}
        </div>
      </>}
  </ChartPanel>
}

export function CoverageChart({ players, understatLinks, understat, performance }) {
  const series = sourceCoverage(players, understatLinks, understat, performance)
  const total = players.length
  let offset = 0
  return <ChartPanel title="What's actually available?" eyebrow="DATA COVERAGE"
    note="Mutually exclusive categories: match stats take precedence over Understat shot events, followed by verified identities. Source links are not performances.">
    <div className="coverage-layout">
      <svg viewBox="0 0 220 220" className="coverage-donut" role="img" aria-label="Share of player profiles by availability of real match data">
        <circle cx="110" cy="110" r="73" fill="none" stroke="#29412f" strokeWidth="22"/>
        {series.map(d => {
          const portion = total ? d.count / total * 100 : 0
          const dash = portion + ' ' + (100 - portion)
          const current = offset
          offset += portion
          return <circle key={d.label} cx="110" cy="110" r="73" fill="none"
            stroke={d.color} strokeWidth="22" pathLength="100" strokeDasharray={dash}
            strokeDashoffset={-current} transform="rotate(-90 110 110)" >
            <title>{d.label}: {d.count} of {total}</title>
          </circle>
        })}
        <text x="110" y="105" textAnchor="middle" fontSize="35" fontWeight="700" fill="#e2f3df">{total}</text>
        <text x="110" y="129" textAnchor="middle" fontSize="11" fill={ink}>linked players</text>
      </svg>
      <div className="coverage-legend">
        {series.map(d => <div key={d.label}><i style={{ background: d.color }}/><span>{d.label}</span><strong>{d.count}</strong></div>)}
      </div>
    </div>
  </ChartPanel>
}

export function PositionsChart({ players }) {
  const groups = positionDistribution(players)
  const max = Math.max(1, ...groups.map(g => g.count))
  return <ChartPanel title="Squad by position" eyebrow="PLAYER DIRECTORY"
    note="Based on documented broad positions in the linked NZ player catalogue. Unknown roles remain separate.">
    <div className="position-bars">
      {groups.map(group => <div key={group.label} className="position-bar-line">
        <div><span>{group.label}</span><strong>{group.count}</strong></div>
        <div className="position-bar-track"><div style={{ width: group.count / max * 100 + '%' }}/></div>
      </div>)}
    </div>
  </ChartPanel>
}

export function PeerChart({ player, record, players, performance, season = 'all' }) {
  const peer = peerComparison(player, record, players, performance, seasonEndDate(season))
  return <ChartPanel title="Among NZ peers" eyebrow="COMPARABLE PERFORMANCE"
    note={peer ? 'Same gender · same broad position · scoring version ' + peer.scoringVersion +
      ' · at least 3 games and 180 minutes ' + (season === 'all' ? 'within the last 365 days' : 'in ' + seasonLabel(season)) + '. League strength is not adjusted.' :
      'Peer comparison needs at least three qualified players in the same gender, role and scoring version.'}>
    {!peer ? <EmptyChart>Not enough comparable verified Sorare scores for a fair comparison.</EmptyChart>
      : <div className="peer-bars">
        {[
          { label: player.name, value: peer.player, color: lime },
          { label: 'NZ cohort median', value: peer.median, color: aqua },
        ].map(row => <div key={row.label} className="peer-row">
          <div><span>{row.label}</span><strong>{fmt(row.value)}</strong></div>
          <div className="peer-track"><div style={{ background: row.color, width: clamp(row.value) + '%' }}/></div>
        </div>)}
        <p>{peer.cohortSize} comparable players · Sorare score scale / 100</p>
      </div>}
  </ChartPanel>
}

export function DistributionChart({ rows }) {
  const bins = scoreDistribution(rows)
  const max = Math.max(1, ...bins.map(b => b.count))
  return <ChartPanel title="Score distribution" eyebrow="RANKED PLAYER COHORT"
    note="Number of eligible players in each Sorare average-score range. Not a percentile and not a national-team selection prediction.">
    {!rows.length ? <EmptyChart>No performance distribution until enough match data is collected.</EmptyChart>
      : <div className="score-histogram">
        {bins.map(bin => <div key={bin.label} className="score-bin">
          <strong>{bin.count}</strong>
          <div className="score-bin-track"><div style={{ height: bin.count / max * 100 + '%' }}/></div>
          <span>{bin.label}</span>
        </div>)}
      </div>}
  </ChartPanel>
}
