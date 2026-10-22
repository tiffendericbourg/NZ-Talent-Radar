import { useMemo, useState } from 'react'
import { scoutingReport, u23Research, ageAt } from './scoutingReport.js'
import { positionGroup } from './rankingUtils.js'
import { seasonEndDate, seasonStartDate, seasonLabel } from './seasonUtils.js'

const fmt = n => typeof n === 'number' ? n.toLocaleString('en-NZ') : '—'
const dateText = date => date ? String(date).slice(0, 10) : 'Not recorded'

function EvidenceTag({ level }) {
  return <span className={'evidence-tag ' + (level === 'Substantial sample' ? 'strong' : level === 'Preliminary sample' ? 'partial' : '')}>
    {level}
  </span>
}

function Summary({ report, onOpen, compact = false }) {
  return <article className="research-case">
    <div className="research-case-heading">
      <span className="eyebrow">{report.group || 'ROLE TO VERIFY'} / {report.player.gender || 'GROUP UNKNOWN'}</span>
      <EvidenceTag level={report.evidence}/>
    </div>
    <h3>{report.player.name}</h3>
    <p className="research-club">
      {report.player.club || 'Club to verify'}
      {report.player.club_country ? ' · ' + report.player.club_country : ' · club country unknown'}
    </p>
    <div className="research-numbers">
      <div><strong>{fmt(report.minutes)}</strong><small>minutes</small></div>
      <div><strong>{report.games}</strong><small>scored games</small></div>
      <div><strong>{report.average == null ? '—' : report.average.toFixed(1)}</strong><small>Sorare avg.</small></div>
    </div>
    <p className="research-observation">{report.observations[0]}</p>
    {!compact && <p className="research-next">{report.nextAction}</p>}
    <button className="research-link" type="button" onClick={() => onOpen(report.player)}>
      Open sourced player report ↗
    </button>
  </article>
}

export function ScoutingReport({ player, players, performance, season }) {
  const report = useMemo(() => scoutingReport(player, performance, players,
    seasonEndDate(season), seasonStartDate(season)), [player, players, performance, season])
  return <section className="research-report">
    <div className="research-title-line">
      <div><span className="eyebrow">05 / SCOUTING NOTE</span><h2>What the evidence says<span className="green">.</span></h2>
        <p>Descriptive observations to support a video review, not an automated selection verdict.</p></div>
      <EvidenceTag level={report.evidence}/>
    </div>
    <div className="research-facts">
      <div><small>DOCUMENTED MINUTES</small><strong>{fmt(report.minutes)}</strong></div>
      <div><small>COMPARABLE MATCHES</small><strong>{fmt(report.games)}</strong></div>
      <div><small>SORARE SCORE AVG.</small><strong>{report.average == null ? '—' : report.average.toFixed(1)}</strong></div>
      <div><small>PEER MEDIAN</small><strong>{report.peerMedian == null ? '—' : report.peerMedian.toFixed(1)}</strong></div>
    </div>
    <div className="research-insight-layout">
      <article className="research-insights">
        <span className="eyebrow">ANALYST OBSERVATIONS</span>
        {report.observations.map(line => <p key={line}>{line}</p>)}
        <div className="research-action"><strong>Recommended next step</strong><p>{report.nextAction}</p></div>
      </article>
      <article className="research-role">
        <span className="eyebrow">ROLE METRICS / PER 90</span>
        <h3>{report.group ? report.group.charAt(0).toUpperCase() + report.group.slice(1) : 'Role not documented'}</h3>
        {report.metrics.length ? report.metrics.map(metric => <div className="research-metric" key={metric.field}>
          <span>{metric.label}<small>{metric.observed} / {metric.possible} scored games covered</small></span>
          <strong>{metric.per90 == null ? '—' : metric.per90.toFixed(1)}</strong>
        </div>) : <p>Role-specific comparisons unavailable until the position is verified.</p>}
        <p className="research-disclaimer">Per-90 values use only matches reporting each statistic. No missing statistic is treated as zero.</p>
      </article>
    </div>
    <p className="research-source-line">
      MATCH WINDOW {dateText(report.matchStart)} → {dateText(report.matchEnd)}
      {' · '}SORARE SCORING VERSION {report.version || 'not available'}
      {' · '}RETRIEVED {dateText(report.retrievedAt)}
      {' · '}{report.peerMedian == null ? 'No usable peer median' : report.peerCount + ' NZ role peers'}
    </p>
    <p className="research-disclaimer">
      Comparison groups share gender, broad position and Sorare scoring version but are not adjusted for league strength, team role or opposition. Sorare ratings are fantasy scoring outputs, not independent talent measurements.
      {player.sorare_slug && <> <a href={'https://sorare.com/football/players/' + encodeURIComponent(player.sorare_slug)} target="_blank" rel="noreferrer">Sorare source ↗</a></>}
    </p>
  </section>
}

export function U23CaseStudy({ cataloguePlayers, performance, season, onOpen }) {
  const [gender, setGender] = useState('all')
  const players = useMemo(() => gender === 'all' ? cataloguePlayers :
    cataloguePlayers.filter(p => p.gender === gender), [cataloguePlayers, gender])
  const result = useMemo(() => u23Research(players, performance,
    seasonEndDate(season), seasonStartDate(season)), [players, performance, season])
  const knownAbroad = players.filter(p => ageAt(p.birth_date) !== null &&
    ageAt(p.birth_date) < 23 && p.eligibility_status !== 'potential_to_verify' &&
    p.club_country && p.club_country !== 'New Zealand')
  return <section className="research-page">
    <div className="directory-heading"><span className="eyebrow">CASE STUDY 01 / TALENT MONITORING</span>
      <h1>Who deserves a second look<span className="green">?</span></h1>
      <p>NZ players under 23, monitored worldwide. This is an evidence audit to identify useful video-review cases — not a list of the three most talented players.</p>
    </div>
    <div className="research-intro">
      <div><strong>The question</strong><p>Which young players have enough documented football to justify a closer performance review?</p></div>
      <div><strong>The approach</strong><p>Verify NZ links, separate known overseas clubs from unknown locations, check scored playing minutes, then prepare scouting notes.</p></div>
      <div><strong>The limitation</strong><p>Sorare coverage differs by competition. League strength and tactical roles have not been normalized.</p></div>
    </div>
    <div className="research-toolbar">
      <label>Research cohort <select value={gender} onChange={event => setGender(event.target.value)}>
        <option value="all">Women + men</option><option value="Women">Women</option><option value="Men">Men</option>
      </select></label>
      <span>{season === 'all' ? 'Last 365 days' : seasonLabel(season)} · U23 as of today</span>
    </div>
    <div className="research-facts">
      <div><small>NZ U23 PROFILES</small><strong>{fmt(result.total)}</strong></div>
      <div><small>DOCUMENTED ABROAD</small><strong>{fmt(result.abroad)}</strong></div>
      <div><small>CLUB COUNTRY UNKNOWN</small><strong>{fmt(result.unknownClub)}</strong></div>
      <div><small>WITH SCORED MATCHES</small><strong>{fmt(result.withMatches)}</strong></div>
    </div>
    <div className="research-section-head">
      <div><span className="eyebrow">01 / VIDEO REVIEW QUEUE</span><h2>Three cases, when the data supports them.</h2>
        <p>{result.ready} U23 players currently meet the preliminary threshold (3 scored matches and 180 minutes). Ordered by documented minutes, with broad-position variety — never by a cross-league Sorare score.</p></div>
    </div>
    {result.selected.length ? <div className="research-cases">{result.selected.map(report =>
      <Summary key={report.player.id} report={report} onOpen={onOpen}/>)}</div>
      : <div className="research-empty"><h3>No U23 cases meet the evidence threshold yet.</h3>
        <p>The analysis will become populated as real scored match records are collected. Missing data must not be interpreted as poor performance.</p></div>}
    {result.selected.length < 3 && <p className="research-caution">Only {result.selected.length} of 3 case slots can currently be filled from sourced, sufficiently documented matches. The remaining slots are deliberately left empty.</p>}
    <div className="research-section-head">
      <div><span className="eyebrow">02 / OVERSEAS VERIFICATION</span><h2>Where are the young players?</h2>
        <p>Club countries below come from the catalogue. A missing or outdated club is not evidence that a player is based in New Zealand.</p></div>
    </div>
    {knownAbroad.length ? <div className="research-overseas">{knownAbroad.map(p =>
      <div key={p.id}><strong>{p.name}</strong><span>{p.club || 'Club not documented'} · {p.club_country}</span><small>{p.gender} · {p.position || 'Position unknown'} · {ageAt(p.birth_date)} years</small></div>)}</div> :
      <p className="research-empty">No verified overseas club locations for this cohort.</p>}
    {result.pending.length > 0 && <><div className="research-section-head"><div>
      <span className="eyebrow">03 / DATA TO COLLECT</span><h2>Not enough match evidence yet</h2></div></div>
      <div className="research-pending">{result.pending.map(r => <div key={r.player.id}>
        <strong>{r.player.name}</strong><span>{r.games} scored matches · {r.minutes} minutes</span>
        <small>Verify playing time, position and match coverage before interpretation.</small>
      </div>)}</div></>}
    <p className="research-disclaimer">Research criteria: documented NZ nationality or senior team link, age under 23, verified Sorare match score and minutes, consistent score version. Names are not selected based on an unvalidated talent score. Competition quality, video, medical data and international eligibility require separate checks.</p>
  </section>
}

export function MethodologyPage({ cataloguePlayers, performance, onCaseStudy }) {
  const linked = cataloguePlayers.filter(p => Boolean(p.sorare_slug)).length
  const scored = Object.values(performance?.players || {}).filter(p =>
    (p.games || []).some(g => g.score_status === 'FINAL' &&
      g.stats?.playedInGame === true && Number(g.stats?.minsPlayed) > 0 &&
      typeof g.score === 'number' && g.low_coverage === false)).length
  return <section className="research-page methodology-page">
    <div className="directory-heading"><span className="eyebrow">ABOUT / THE ANALYST'S APPROACH</span>
      <h1>Better questions.<br/><em>Better scouting.</em></h1>
      <p>NZ Talent Radar is an independent football data portfolio exploring how publicly documented information can support the identification and monitoring of New Zealand players worldwide.</p>
    </div>
    <div className="research-intro">
      <div><strong>01 / Find</strong><p>Build the NZ-linked player universe, including women's and men's football, while flagging uncertain eligibility.</p></div>
      <div><strong>02 / Validate</strong><p>Cross-check player identities, dates of birth and clubs. Keep rejected matches and missing values visible to the pipeline.</p></div>
      <div><strong>03 / Explain</strong><p>Turn match-level evidence into repeatable, role-specific scouting notes and clear next actions.</p></div>
    </div>
    <div className="research-section-head"><div><span className="eyebrow">LIVE COVERAGE</span><h2>Where the evidence starts</h2></div></div>
    <div className="research-facts">
      <div><small>CATALOGUE PROFILES</small><strong>{fmt(cataloguePlayers.length)}</strong></div>
      <div><small>SORARE IDENTITIES</small><strong>{fmt(linked)}</strong></div>
      <div><small>PLAYERS WITH SCORES</small><strong>{fmt(scored)}</strong></div>
      <div><small>UNDERSTAT XY EVENTS</small><strong>Not yet imported</strong></div>
    </div>
    <div className="methodology-columns">
      <article><span className="eyebrow">DATA ENGINEERING</span><h3>Reproducible before impressive</h3>
        <p>Python imports discover possible players and connect sources. Reviewed CSV corrections and identity decisions survive automated updates. React reads published JSON snapshots; API secrets remain in GitHub Actions.</p>
        <p>Source dates, match dates, season grouping and sampling rules are documented separately. No synthetic performances, shots or percentiles are published.</p>
      </article>
      <article><span className="eyebrow">FOOTBALL ANALYSIS</span><h3>Context before ranking</h3>
        <p>Performance observations are grouped by gender, broad playing role and Sorare scoring version. Per-90 values use the minutes of observed matches only. A small sample leads to a data-collection action rather than a verdict.</p>
        <p>Comparisons do not yet correct for opposition, league standard or tactical duties. These missing controls are visible in every report.</p>
      </article>
      <article><span className="eyebrow">WHAT COMES NEXT</span><h3>Video, benchmarking, validation</h3>
        <p>Produce reviewed player dossiers, verify current clubs, expand reliable women's and youth coverage, then benchmark specialist roles against appropriate leagues — not only against other NZ players.</p>
        <p>Where licensed shot events exist, add Understat xG and locations. A sourced X/Y shot map is not an all-purpose positioning map.</p>
      </article>
    </div>
    <div className="methodology-conclusion"><div>
      <span className="eyebrow">THE OBJECTIVE</span><h2>A useful conversation with a football staff.</h2>
      <p>The aim is not to replace scouting judgement. It is to make evidence easy to inspect and help decide which match or player should be reviewed next.</p>
    </div><button className="cta" type="button" onClick={onCaseStudy}>See the U23 case study ↗</button></div>
    <p className="research-disclaimer">Independent portfolio · no affiliation with New Zealand Football. Source catalogue: Wikidata and reviewed football sources. Match data: Sorare. Understat identity records are not shot data. <a href="https://github.com/tiffendericbourg/NZ-Talent-Radar" target="_blank" rel="noreferrer">Read the code and methodology on GitHub ↗</a></p>
  </section>
}


const GROUP_OPTIONS = [
  ['goalkeeper', 'Goalkeepers'], ['defender', 'Defenders'],
  ['midfielder', 'Midfielders'], ['forward', 'Forwards'],
]

export function RoleComparisonStudy({ cataloguePlayers, performance, season, onOpen }) {
  const [gender, setGender] = useState('Men')
  const [group, setGroup] = useState('midfielder')
  const [leftId, setLeftId] = useState('')
  const [rightId, setRightId] = useState('')
  const reports = useMemo(() => cataloguePlayers
    .filter(p => p.gender === gender && positionGroup(p.position) === group)
    .map(p => scoutingReport(p, performance, cataloguePlayers,
      seasonEndDate(season), seasonStartDate(season)))
    .filter(r => r.games >= 3 && r.minutes >= 180)
    .sort((a, b) => b.minutes - a.minutes || a.player.name.localeCompare(b.player.name)),
  [cataloguePlayers, performance, season, gender, group])
  // Do not compare players whose Sorare scores use different scoring versions.
  const versions = [...new Set(reports.map(r => r.version))]
    .map(v => ({ version: v, count: reports.filter(r => r.version === v).length }))
    .sort((a, b) => b.count - a.count)
  const [selectedVersion, setSelectedVersion] = useState(null)
  const version = versions.some(v => v.version === selectedVersion) ?
    selectedVersion : versions[0]?.version || null
  const compatible = reports.filter(r => r.version === version)
  const left = compatible.find(r => r.player.id === leftId) || compatible[0]
  const right = compatible.find(r => r.player.id === rightId && r.player.id !== left?.player.id) ||
    compatible.find(r => r.player.id !== left?.player.id)
  const fields = (left?.metrics || []).map(m => m.field)
  const sameField = (report, field) => report?.metrics.find(m => m.field === field)
  const valid = (m, report) => m?.per90 != null && m.observed === report.games
  const maxFor = field => Math.max(1, ...[left, right].map(r => {
    const metric = sameField(r, field)
    return r && valid(metric, r) ? metric.per90 : 0
  }))
  return <section className="research-page">
    <div className="directory-heading"><span className="eyebrow">CASE STUDY 02 / COMPARABLE ROLES</span>
      <h1>What changes by position<span className="green">?</span></h1>
      <p>Two players, the same documented broad role, gender and scoring version. Look past the headline fantasy rating: compare role-specific events per 90 and their coverage before deciding what to watch on video.</p></div>
    <div className="research-toolbar comparison-controls">
      <label>Competition group<select value={gender} onChange={event => { setGender(event.target.value); setLeftId(''); setRightId(''); setSelectedVersion(null) }}>
        <option value="Men">Men</option><option value="Women">Women</option></select></label>
      <label>Position<select value={group} onChange={event => { setGroup(event.target.value); setLeftId(''); setRightId(''); setSelectedVersion(null) }}>
        {GROUP_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {versions.length > 1 && <label>Score version<select value={version || ''} onChange={event => { setSelectedVersion(event.target.value); setLeftId(''); setRightId('') }}>
        {versions.map(v => <option key={v.version} value={v.version}>{v.version} · {v.count} players</option>)}</select></label>}
      <span>{compatible.length} comparable profiles · {season === 'all' ? 'past 365 days' : seasonLabel(season)}</span>
    </div>
    {compatible.length < 2 ? <div className="research-empty">
      <h3>A two-player comparison is not available for this cohort.</h3>
      <p>At least two documented players need 3 scored, completed, non-low-coverage matches and 180 minutes in the same Sorare scoring version. Try a different position or period.</p>
    </div> : <>
      <div className="comparison-players">
        <label>Player A<select value={left.player.id} onChange={event => setLeftId(event.target.value)}>
          {compatible.filter(r => r.player.id !== right?.player.id).map(r =>
            <option key={r.player.id} value={r.player.id}>{r.player.name}</option>)}
        </select></label>
        <label>Player B<select value={right.player.id} onChange={event => setRightId(event.target.value)}>
          {compatible.filter(r => r.player.id !== left?.player.id).map(r =>
            <option key={r.player.id} value={r.player.id}>{r.player.name}</option>)}
        </select></label>
      </div>
      <div className="comparison-cards">
        {[left, right].map(r => <article key={r.player.id} className="research-case">
          <span className="eyebrow">{r.player.club_country || 'CLUB COUNTRY UNKNOWN'}</span>
          <h3>{r.player.name}</h3><p>{r.player.club || 'Club not confirmed'}</p>
          <div className="research-numbers">
            <div><strong>{fmt(r.minutes)}</strong><small>minutes</small></div>
            <div><strong>{r.games}</strong><small>matches</small></div>
            <div><strong>{r.average?.toFixed(1)}</strong><small>Sorare</small></div>
          </div>
          <p className="research-observation">{r.nextAction}</p>
          <button type="button" className="research-link" onClick={() => onOpen(r.player)}>Read player report ↗</button>
        </article>)}
      </div>
      <div className="comparison-metrics">
        <div className="comparison-metrics-head"><h2>Role-specific events / 90</h2><span>Only fully covered metrics are plotted</span></div>
        {fields.map(field => {
          const a = sameField(left, field), b = sameField(right, field)
          const comparable = valid(a, left) && valid(b, right)
          const upper = maxFor(field)
          return <div className="comparison-metric-row" key={field}>
            <strong>{a?.label || field}</strong>
            <div className="comparison-bar">
              <span>Player A {comparable ? a.per90.toFixed(1) : 'Not comparable'}</span>
              <div className="comparison-track">{comparable && <i style={{ width: 100 * a.per90 / upper + '%' }}/>}</div>
            </div>
            <div className="comparison-bar">
              <span>Player B {comparable ? b.per90.toFixed(1) : 'Not comparable'}</span>
              <div className="comparison-track alt">{comparable && <i style={{ width: 100 * b.per90 / upper + '%' }}/>}</div>
            </div>
          </div>
        })}</div>
      <p className="research-caution">These differences describe recorded match events, not talent. A higher count can reflect team style or match context. Do not infer who is better without video, opposition and competition-strength adjustments.</p>
    </>}
    <p className="research-disclaimer">Scoring periods and versions are shared, but leagues and tactical jobs are not necessarily equivalent. No cross-league performance score or percentile is computed here. Missing stats remain unavailable, not zero.</p>
  </section>
}

export function CoverageStudy({ cataloguePlayers, performance, season }) {
  const sources = performance?.players || {}
  const played = p => (sources[p.id]?.games || []).some(g => g.score_status === 'FINAL' &&
    g.low_coverage === false && g.stats?.playedInGame === true &&
    Number(g.stats?.minsPlayed) > 0 && typeof g.score === 'number')
  const women = cataloguePlayers.filter(p => p.gender === 'Women')
  const men = cataloguePlayers.filter(p => p.gender === 'Men')
  const youth = cataloguePlayers.filter(p => {
    const years = ageAt(p.birth_date)
    return years !== null && years < 23 && p.eligibility_status !== 'potential_to_verify'
  })
  const withClub = cataloguePlayers.filter(p => p.club_country).length
  const withScores = cataloguePlayers.filter(played)
  const researchLeads = youth.filter(p => !played(p))
    .sort((a, b) => Number(Boolean(b.club_country)) - Number(Boolean(a.club_country)) ||
      a.name.localeCompare(b.name))
  const shortlist = [
    ...researchLeads.filter(p => p.gender === 'Women').slice(0, 3),
    ...researchLeads.filter(p => p.gender === 'Men').slice(0, 3),
  ]
  return <section className="research-page">
    <div className="directory-heading"><span className="eyebrow">CASE STUDY 03 / DATA QUALITY</span>
      <h1>Who is missing from the data<span className="green">?</span></h1>
      <p>A scouting tool is only as credible as its blind spots. This audit distinguishes the size of the NZ-linked catalogue from the much smaller group with usable source statistics.</p></div>
    <div className="research-facts">
      <div><small>NZ-LINKED PLAYERS</small><strong>{fmt(cataloguePlayers.length)}</strong></div>
      <div><small>WITH CLUB COUNTRY</small><strong>{fmt(withClub)}</strong></div>
      <div><small>WITH SOURCED SCORES</small><strong>{fmt(withScores.length)}</strong></div>
      <div><small>U23 WITHOUT SCORES</small><strong>{fmt(researchLeads.length)}</strong></div>
    </div>
    <div className="research-section-head"><div><span className="eyebrow">COVERAGE BY GROUP</span>
      <h2>Not equally visible.</h2><p>The bars compare documentation rates only. They must not be treated as performance indicators.</p></div></div>
    <div className="coverage-audit">
      {[['Women', women], ['Men', men], ['U23 with NZ links', youth]].map(([label, group]) => {
        const scored = group.filter(played).length
        const share = group.length ? 100 * scored / group.length : 0
        return <div key={label} className="coverage-audit-row">
          <div><strong>{label}</strong><span>{scored} / {group.length} have scored games</span><strong>{share.toFixed(1)}%</strong></div>
          <div className="comparison-track"><i style={{ width: share + '%' }}/></div>
        </div>
      })}</div>
    <div className="research-section-head"><div><span className="eyebrow">RESEARCH LEADS — NOT TALENT RANKINGS</span>
      <h2>Six U23 profiles to verify next.</h2>
      <p>These names are drawn from the existing catalogue because their match evidence is missing. An absence from Sorare is not an absence of football performance.</p></div></div>
    {shortlist.length ? <div className="research-overseas">
      {shortlist.map(p => <div key={p.id}><strong>{p.name}</strong>
        <span>{p.club || 'Club not reported'} · {p.club_country || 'Location not recorded'}</span>
        <small>{p.gender} · {p.position || 'Role unknown'} · {ageAt(p.birth_date)} years · verify recent matches</small>
      </div>)}</div> : <div className="research-empty">No missing U23 cases were found in the current catalogue.</div>}
    <p className="research-caution">Next collection priorities: validate current clubs, expand women's and youth competition coverage, and confirm whether match histories are incomplete. Do not fill missing fields with estimates.</p>
    <p className="research-disclaimer">Full catalogue audit; source snapshots can be incomplete. Unlike the season-specific analysis in the other studies, these coverage counts describe all imported score history, not just {season === 'all' ? 'the past 365 days' : seasonLabel(season)}.</p>
  </section>
}

export function ResearchHub({ cataloguePlayers, performance, season, onOpen }) {
  const [study, setStudy] = useState('u23')
  return <>
    <nav className="research-study-tabs" aria-label="Scouting research studies">
      <button type="button" className={study === 'u23' ? 'selected' : ''} onClick={() => setStudy('u23')}>01 / U23 watchlist</button>
      <button type="button" className={study === 'roles' ? 'selected' : ''} onClick={() => setStudy('roles')}>02 / Role comparison</button>
      <button type="button" className={study === 'coverage' ? 'selected' : ''} onClick={() => setStudy('coverage')}>03 / Data blind spots</button>
    </nav>
    {study === 'u23' ? <U23CaseStudy cataloguePlayers={cataloguePlayers} performance={performance} season={season} onOpen={onOpen}/> :
      study === 'roles' ? <RoleComparisonStudy cataloguePlayers={cataloguePlayers} performance={performance} season={season} onOpen={onOpen}/> :
        <CoverageStudy cataloguePlayers={cataloguePlayers} performance={performance} season={season}/>}
  </>
}
