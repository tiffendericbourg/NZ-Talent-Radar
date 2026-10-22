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
      <div><strong>{report.games}</strong><small>played games</small></div>
      <div><strong>{report.index == null ? '—' : report.index}</strong><small>NZ Impact / 100</small></div>
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
      <div><small>NZ IMPACT INDEX</small><strong>{report.index == null ? '—' : report.index + '/100'}</strong></div>
      <div><small>ROLE REFERENCE</small><strong>{report.referenceSize || 0} players</strong></div>
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
          <span>{metric.label}<small>{metric.observed} / {metric.possible} played games · {metric.referenceCount ?? 0} reference players</small></span>
          <strong>{metric.per90 == null ? '—' : metric.per90.toFixed(1)}</strong>
        </div>) : <p>Role-specific comparisons unavailable until the position is verified.</p>}
        <p className="research-disclaimer">Per-90 values use only matches reporting each statistic. No missing statistic is treated as zero.</p>
      </article>
    </div>
    <p className="research-source-line">
      MATCH WINDOW {dateText(report.matchStart)} → {dateText(report.matchEnd)}
      {' · '}NZ IMPACT SIGNALS {report.usableSignals || 0} / 3
      {' · '}RETRIEVED {dateText(report.retrievedAt)}
      {' · '}{report.index == null ? 'Insufficient role benchmarks' : 'NZ role reference: ' + report.referenceSize + ' players'}
    </p>
    <p className="research-disclaimer">
      NZ Impact is an exploratory relative index based on real football actions. Groups share gender and broad position, not league strength or tactical role. Missing values never count as zero. This is not an ability prediction or selection recommendation.
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
      <div><small>WITH PLAYED MATCHES</small><strong>{fmt(result.withMatches)}</strong></div>
    </div>
    <div className="research-section-head">
      <div><span className="eyebrow">01 / VIDEO REVIEW QUEUE</span><h2>Three cases, when the data supports them.</h2>
        <p>{result.ready} U23 players meet the preliminary threshold (3 played matches and 180 minutes). These video-review leads are ordered by minutes, with role variety, not by a cross-league index.</p></div>
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
        <strong>{r.player.name}</strong><span>{r.games} played matches · {r.minutes} minutes</span>
        <small>Verify playing time, position and match coverage before interpretation.</small>
      </div>)}</div></>}
    <p className="research-disclaimer">Research criteria: documented NZ nationality or senior team link, age under 23, played minutes from sourced match events. Names are not selected solely by a derived index. Competition quality, video, medical data and international eligibility require separate checks.</p>
  </section>
}

export function MethodologyPage({ cataloguePlayers, performance, understat, onCaseStudy }) {
  const linked = cataloguePlayers.filter(p => Boolean(p.sorare_slug)).length
  const scored = Object.values(performance?.players || {}).filter(p =>
    (p.games || []).some(g => g.score_status === 'FINAL' &&
      g.stats?.playedInGame === true && Number(g.stats?.minsPlayed) > 0 &&
      g.low_coverage === false)).length
  const importedShots = Object.values(understat?.players || {}).reduce((sum, record) => sum + (record.shots?.length || 0), 0)
  return <section className="research-page methodology-page">
    <div className="directory-heading"><span className="eyebrow">ABOUT / THE ANALYST'S APPROACH</span>
      <h1>Better questions.<br/><em>Better scouting.</em></h1>
      <p>I started NZ Talent Radar with a simple question: could I build a reliable way to follow New Zealand footballers abroad, then explain which ones deserve a closer look? This is my independent football data portfolio, from messy sources to practical scouting notes.</p>
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
      <div><small>PLAYERS WITH MATCH EVENTS</small><strong>{fmt(scored)}</strong></div>
      <div><small>UNDERSTAT XY EVENTS</small><strong>{fmt(importedShots)}</strong></div>
    </div>
    <div className="methodology-columns">
      <article><span className="eyebrow">DATA ENGINEERING</span><h3>Reproducible before impressive</h3>
        <p>Python imports discover possible players and connect sources. Reviewed CSV corrections and identity decisions survive automated updates. React reads published JSON snapshots; API secrets remain in GitHub Actions.</p>
        <p>Source dates, match dates, season grouping and sampling rules are documented separately. Index percentiles are calculated from sourced event rates; no synthetic matches or shot locations are published.</p>
      </article>
      <article><span className="eyebrow">FOOTBALL ANALYSIS</span><h3>Context before ranking</h3>
        <p>NZ Impact Index compares three football actions per 90 minutes within each gender and broad playing role, using transparent weighted rank percentiles. Missing observations block the index rather than become zeros. A small sample leads to a video/data review, never an automatic verdict.</p>
        <p>Comparisons do not yet correct for opposition, league standard or tactical duties. These missing controls are visible in every report.</p>
      </article>
      <article><span className="eyebrow">WHAT COMES NEXT</span><h3>Video, benchmarking, validation</h3>
        <p>Produce reviewed player dossiers, verify current clubs, expand reliable women's and youth coverage, then benchmark specialist roles against appropriate leagues — not only against other NZ players.</p>
        <p>Where licensed shot events exist, add Understat xG and locations. A sourced X/Y shot map is not an all-purpose positioning map.</p>
      </article>
    </div>
    <div className="methodology-conclusion"><div>
      <span className="eyebrow">THE OBJECTIVE</span><h2>A useful conversation with a football staff.</h2>
      <p>I want a coach or analyst to understand what the numbers can tell them, what they cannot, and which match is worth watching next. Data is useful when it makes a football decision clearer.</p>
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
  const left = reports.find(r => r.player.id === leftId) || reports[0]
  const right = reports.find(r => r.player.id === rightId && r.player.id !== left?.player.id) ||
    reports.find(r => r.player.id !== left?.player.id)
  const fields = (left?.metrics || []).map(m => m.field)
  const get = (r, field) => r?.metrics.find(m => m.field === field)
  const usable = (metric, report) => metric?.per90 != null &&
    metric.observed / report.games >= 0.8
  return <section className="research-page">
    <div className="directory-heading"><span className="eyebrow">CASE STUDY 02 / COMPARABLE ROLES</span>
      <h1>What changes by position<span className="green">?</span></h1>
      <p>Compare documented role-specific football events, not fantasy scores. The NZ Impact Index is a transparent relative activity signal, not a cross-league talent rating.</p></div>
    <div className="research-toolbar comparison-controls">
      <label>Group<select value={gender} onChange={e => { setGender(e.target.value); setLeftId(''); setRightId('') }}>
        <option value="Men">Men</option><option value="Women">Women</option></select></label>
      <label>Position<select value={group} onChange={e => { setGroup(e.target.value); setLeftId(''); setRightId('') }}>
        {GROUP_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <span>{reports.length} profiles with documented minutes · {season === 'all' ? 'past 365 days' : seasonLabel(season)}</span>
    </div>
    {reports.length < 2 ? <div className="research-empty"><h3>Not enough player evidence.</h3>
      <p>This comparison needs two players of the same group and role with at least three matches and 180 minutes. Try another cohort or season.</p>
    </div> : <>
      <div className="comparison-players">
        <label>Player A<select value={left.player.id} onChange={e => setLeftId(e.target.value)}>
          {reports.filter(r => r.player.id !== right?.player.id).map(r =>
            <option key={r.player.id} value={r.player.id}>{r.player.name}</option>)}</select></label>
        <label>Player B<select value={right.player.id} onChange={e => setRightId(e.target.value)}>
          {reports.filter(r => r.player.id !== left?.player.id).map(r =>
            <option key={r.player.id} value={r.player.id}>{r.player.name}</option>)}</select></label>
      </div>
      <div className="comparison-cards">{[left, right].map(r => <article key={r.player.id} className="research-case">
        <span className="eyebrow">{r.player.club_country || 'CLUB COUNTRY UNKNOWN'}</span>
        <h3>{r.player.name}</h3><p>{r.player.club || 'Club not confirmed'}</p>
        <div className="research-numbers">
          <div><strong>{fmt(r.minutes)}</strong><small>minutes</small></div>
          <div><strong>{r.games}</strong><small>games</small></div>
          <div><strong>{r.index ?? '—'}</strong><small>NZ Impact /100</small></div>
        </div>
        <p className="research-observation">{r.nextAction}</p>
        <button type="button" className="research-link" onClick={() => onOpen(r.player)}>Read player report ↗</button>
      </article>)}</div>
      <div className="comparison-metrics">
        <div className="comparison-metrics-head"><h2>Recorded actions per 90</h2><span>Missing statistics are not zero</span></div>
        {fields.map(field => {
          const a = get(left, field), b = get(right, field)
          const comparable = usable(a, left) && usable(b, right)
          const max = Math.max(1, a?.per90 || 0, b?.per90 || 0)
          return <div className="comparison-metric-row" key={field}>
            <strong>{a?.label || field}</strong>
            <div className="comparison-bar"><span>A: {comparable ? a.per90.toFixed(1) : 'Not comparable'}</span>
              <div className="comparison-track">{comparable && <i style={{ width: a.per90 / max * 100 + '%' }}/>}</div></div>
            <div className="comparison-bar"><span>B: {comparable ? b.per90.toFixed(1) : 'Not comparable'}</span>
              <div className="comparison-track alt">{comparable && <i style={{ width: b.per90 / max * 100 + '%' }}/>}</div></div>
          </div>
        })}</div>
      <p className="research-caution">Higher counts do not necessarily mean better performance: team tactics, opponents and playing time affect these events. Watch the video before making a selection decision.</p>
    </>}
    <p className="research-disclaimer">Source: documented match-event statistics. Player comparisons do not correct for league strength, tactical responsibilities or opponent quality.</p>
  </section>
}

export function CoverageStudy({ cataloguePlayers, performance, season }) {
  const sources = performance?.players || {}
  const played = p => (sources[p.id]?.games || []).some(g => g.score_status === 'FINAL' &&
    g.low_coverage === false && g.stats?.playedInGame === true &&
    Number(g.stats?.minsPlayed) > 0)
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
          <div><strong>{label}</strong><span>{scored} / {group.length} have played games</span><strong>{share.toFixed(1)}%</strong></div>
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
