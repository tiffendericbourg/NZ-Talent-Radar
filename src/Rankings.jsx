import { useMemo, useState } from 'react'
import { seasonLabel, seasonEndDate, seasonStartDate } from './seasonUtils.js'
import { POSITIONS } from './rankingUtils.js'
import { impactRows, IMPACT_MIN_MATCHES, IMPACT_MIN_MINUTES, IMPACT_MIN_PEERS } from './impactIndex.js'

export default function Rankings({ players, performance, onOpen, season = 'all' }) {
  const [gender, setGender] = useState('Men')
  const [position, setPosition] = useState('forward')
  const [youthOnly, setYouthOnly] = useState(false)
  const rows = useMemo(() => impactRows(players, performance, seasonEndDate(season),
    seasonStartDate(season)), [players, performance, season])
  const cohort = rows.filter(r => r.player.gender === gender && r.group === position &&
    (!youthOnly || (r.player.birth_date && ageAt(r.player.birth_date) < 23)))
  const ranked = cohort.filter(r => r.index !== null)
    .sort((a, b) => b.index - a.index || b.minutes - a.minutes ||
      a.player.name.localeCompare(b.player.name))
  const waiting = cohort.filter(r => r.index === null)
    .sort((a, b) => b.minutes - a.minutes || a.player.name.localeCompare(b.player.name))
  const updated = performance?.generated_at_utc || performance?.generated_at || null
  const periodLabel = season === 'all' ? 'Last 365 days' : seasonLabel(season)
  return <section className="ranking-page">
    <div className="directory-heading">
      <span className="eyebrow">POSITIONAL ANALYSIS / ORIGINAL METHOD</span>
      <h1>NZ Impact Index<span className="green">.</span></h1>
      <p>Our own 0–100 indicator built from documented football events per 90 minutes.
        Nothing from a Sorare fantasy score is used. The number shows relative activity in
        an NZ reference cohort, not a prediction of talent or national-team selection.</p>
    </div>
    <div className="ranking-pulse">
      <div><small>DOCUMENTED PLAYERS</small><strong>{rows.filter(r => r.matches > 0).length}</strong><span>Completed match events</span></div>
      <div><small>IMPACT INDEX AVAILABLE</small><strong>{rows.filter(r => r.index !== null).length}</strong><span>Players meeting all evidence checks</span></div>
      <div><small>DATA RETRIEVED</small><strong className="ranking-pulse-date">{updated ? String(updated).slice(0, 10) : 'Pending'}</strong><span>Last published snapshot</span></div>
    </div>
    <div className="ranking-controls">
      <div className="ranking-filter"><label htmlFor="impact-gender">Group</label>
        <select id="impact-gender" value={gender} onChange={e => setGender(e.target.value)}>
          <option value="Men">Men</option><option value="Women">Women</option>
        </select></div>
      <div className="ranking-filter"><label htmlFor="impact-position">Playing role</label>
        <select id="impact-position" value={position} onChange={e => setPosition(e.target.value)}>
          {POSITIONS.map(p => <option value={p.value} key={p.value}>{p.label}</option>)}
        </select></div>
      <label className="ranking-youth"><input type="checkbox" checked={youthOnly}
        onChange={e => setYouthOnly(e.target.checked)}/>Under 23 only</label>
    </div>
    <div className="ranking-heading"><div>
      <span className="eyebrow">{periodLabel} / {gender.toUpperCase()}</span>
      <h2>{POSITIONS.find(p => p.value === position)?.label} — impact</h2>
      <p>{ranked.length} indexable players · {waiting.length} without enough comparable data</p>
    </div><span className="ranking-method">Ranked by NZ Impact Index, within this group only</span></div>
    {ranked.length ? <div className="ranking-list">
      <div className="ranking-list-label">
        <span>RANK / PLAYER</span><span>NZ IMPACT</span><span>MIN / MATCHES</span><span>REFERENCE</span>
      </div>
      {ranked.map((r, i) => <button type="button" className="ranking-entry" key={r.player.id}
        onClick={() => onOpen(r.player)} aria-label={'Open scouting report for ' + r.player.name}>
        <div className="ranking-person">
          <strong className="ranking-position-number">{String(i + 1).padStart(2, '0')}</strong>
          <span className="ranking-avatar">{r.player.name.split(' ').slice(0, 2).map(w => w[0]).join('')}</span>
          <span className="ranking-player-text"><strong>{r.player.name}</strong>
            <small>{r.player.club || 'Club not recorded'} · {r.confidence}</small>
            <small>{r.periodStart} → {r.periodEnd}</small></span>
        </div>
        <div className="ranking-average"><strong>{r.index}</strong><span> / 100</span>
          <div className="ranking-score-track"><div style={{ width: r.index + '%' }}/></div>
        </div>
        <div className="ranking-minutes"><strong>{r.minutes}</strong><span>{r.matches} matches</span></div>
        <div className="ranking-extra">{r.usableSignals}/3 <span>metrics</span><span aria-hidden="true">↗</span></div>
      </button>)}
    </div> : <div className="ranking-empty">
      <span className="eyebrow">NO VALID REFERENCE SAMPLE</span>
      <h3>No defensible impact ranking in this category.</h3>
      <p>We need enough sourced playing minutes and at least five role peers with comparable event fields.
        Missing data never become a zero or a made-up ranking.</p>
    </div>}
    <div className="ranking-waiting"><div className="ranking-heading"><div>
      <span className="eyebrow">RESEARCH QUEUE</span><h2>Players to document next</h2>
      <p>Sorted by available playing time, not by talent.</p></div></div>
      {waiting.length ? <div className="ranking-watchlist">
        {waiting.slice(0, 20).map(r => <button key={r.player.id} type="button" onClick={() => onOpen(r.player)}>
          <span><strong>{r.player.name}</strong><small>{r.matches} matches · {r.minutes} minutes · {r.reason}</small></span>
          <span>View evidence ↗</span>
        </button>)}
      </div> : <p className="scout-empty">All eligible profiles in this group have a usable index.</p>}
    </div>
    <article className="index-method">
      <h3>How NZ Impact Index works</h3>
      <p>We select three observable football actions for each broad position. Their per-90 rates
        are placed in a reference distribution of New Zealand players of the same gender and role.
        For each action: percentile = 100 × (players below + half the ties) / players observed.
        The index is the weighted average of valid action percentiles, rounded to an integer.</p>
      <p>Weights: <strong>GK</strong> saves 40%, high claims 30%, sweeper actions 30% ·
        <strong> DEF</strong> won tackles 40%, interceptions 35%, duels 25% ·
        <strong> MID</strong> final-third passes 40%, big chances created 35%, interceptions 25% ·
        <strong> FWD</strong> shots 40%, big chances created 30%, goals 30%.</p>
      <p>Requires {IMPACT_MIN_MATCHES} completed played games, {IMPACT_MIN_MINUTES} minutes,
        at least two metrics reported in 80% of games and {IMPACT_MIN_PEERS} eligible peers for
        each included metric. Weights are re-normalized over available metrics.
        Each profile shows its data quality and reference size.</p>
      <p className="research-disclaimer">Exploratory proxy of recorded actions, not a validated ability score.
        More saves may reflect a weak defence; more shots may reflect team tactics.
        Competition strength, specialist roles and opponent context remain unadjusted.
        Do not compare the index between positions or men's and women's cohorts.</p>
    </article>
  </section>
}

// Prevent relying on stale ages in the published source file.
function ageAt(birth) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return null
  const today = new Date()
  const date = new Date(birth + 'T00:00:00Z')
  return today.getUTCFullYear() - date.getUTCFullYear() -
    (today.getUTCMonth() < date.getUTCMonth() ||
      (today.getUTCMonth() === date.getUTCMonth() && today.getUTCDate() < date.getUTCDate()) ? 1 : 0)
}
