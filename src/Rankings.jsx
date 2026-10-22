import { useMemo, useState } from 'react'
import { DistributionChart } from './ScoutingCharts.jsx'
import { seasonLabel, seasonEndDate } from './seasonUtils.js'
import {
  POSITIONS, RANKING_MIN_MATCHES, RANKING_MIN_MINUTES,
  RANKING_WINDOW_DAYS, rankingRows,
} from './rankingUtils.js'

const METRICS = {
  forward: 'Shots / 90',
  midfielder: 'Final-third passes / 90',
  defender: 'Tackles + interceptions / 90',
  goalkeeper: 'Saves / 90',
}

export default function Rankings({ players, performance, onOpen, season = 'all' }) {
  const [gender, setGender] = useState('Men')
  const [position, setPosition] = useState('forward')
  const [youthOnly, setYouthOnly] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState(null)

  const rows = useMemo(() => rankingRows(players, performance, seasonEndDate(season)), [players, performance, season])
  const cohort = rows.filter(p => p.gender === gender && p.group === position &&
    (!youthOnly || (p.age !== null && p.age < 23)))
  const candidates = cohort.filter(p => p.eligible)
  const versions = [...new Set(candidates.map(p => p.version))]
    .sort((a, b) => Number(b) - Number(a) || b.localeCompare(a))
  const version = versions.includes(selectedVersion) ? selectedVersion : versions[0] || null
  const ranked = candidates.filter(p => p.version === version)
    .sort((a, b) => b.average - a.average || b.matches - a.matches || a.name.localeCompare(b.name))
  const waiting = cohort.filter(p => !p.eligible || p.version !== version)
    .sort((a, b) => a.name.localeCompare(b.name))
  const totalWithGames = rows.filter(p => p.matches > 0).length
  const currentSeasonNote = season === 'all' ? 'Last ' + RANKING_WINDOW_DAYS + ' days · only completed Sorare matches' : seasonLabel(season) + ' · completed Sorare matches only'
  const updated = performance?.generated_at_utc || performance?.generated_at || null

  function changePosition(next) {
    setPosition(next)
    setSelectedVersion(null)
  }

  return <section className="ranking-page">
    <div className="directory-heading">
      <span className="eyebrow">04 / PLAYER RANKINGS</span>
      <h1>The NZ rankings<span className="green">.</span></h1>
      <p>Who's performing right now? Compare players from the same position, using verified
        Sorare game scores. No statistics means no invented ranking.</p>
    </div>

    <div className="ranking-pulse">
      <div><small>SCOUTING DATABASE</small><strong>{rows.length}</strong><span>Verified Sorare-linked players</span></div>
      <div><small>RECENT MATCH SCORES</small><strong>{totalWithGames}</strong><span>Players with recent complete scores</span></div>
      <div><small>DATA SNAPSHOT</small><strong className="ranking-pulse-date">{updated ? String(updated).slice(0, 10) : 'Pending'}</strong><span>Most recent imported source</span></div>
    </div>

    <div className="ranking-controls">
      <div className="ranking-filter">
        <label htmlFor="ranking-gender">Competition group</label>
        <select id="ranking-gender" value={gender} onChange={e => { setGender(e.target.value); setSelectedVersion(null) }}>
          <option value="Men">Men</option><option value="Women">Women</option>
        </select>
      </div>
      <div className="ranking-filter">
        <label htmlFor="ranking-position">Position</label>
        <select id="ranking-position" value={position} onChange={e => changePosition(e.target.value)}>
          {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <label className="ranking-youth">
        <input type="checkbox" checked={youthOnly} onChange={e => { setYouthOnly(e.target.checked); setSelectedVersion(null) }}/>
        Under 23 only
      </label>
      {versions.length > 1 && <div className="ranking-filter">
        <label htmlFor="ranking-version">Sorare scoring version</label>
        <select id="ranking-version" value={version} onChange={e => setSelectedVersion(e.target.value)}>
          {versions.map(v => <option key={v} value={v}>Version {v}</option>)}
        </select>
      </div>}
    </div>

    <div className="ranking-heading">
      <div>
        <span className="eyebrow">{currentSeasonNote}</span>
        <h2>{POSITIONS.find(p => p.value === position)?.label} leaderboard</h2>
        <p>{ranked.length} ranked {gender.toLowerCase()} players
          {version ? ' · scoring version ' + version : ''}</p>
      </div>
      <span className="ranking-method">Sorted by average Sorare score</span>
    </div>

    {ranked.length > 0
      ? <div className="ranking-list">
        <div className="ranking-list-label">
          <span>RANK / PLAYER</span><span>SORARE AVG</span><span>MIN / MATCHES</span><span>{METRICS[position]}</span>
        </div>
        {ranked.map((p, index) => <button key={p.id} className="ranking-entry" onClick={() => onOpen(p)}
          aria-label={'Open ranked player ' + p.name}>
          <div className="ranking-person">
            <strong className="ranking-position-number">{String(index + 1).padStart(2, '0')}</strong>
            <span className="ranking-avatar">{p.name.split(' ').slice(0, 2).map(word => word[0]).join('')}</span>
            <span className="ranking-player-text"><strong>{p.name}</strong>
              <small>{p.club || 'Club not recorded'} · {p.age === null ? 'Age unknown' : p.age + ' yrs'}</small>
              <small>Matches: {p.start} → {p.end}</small>
            </span>
          </div>
          <div className="ranking-average"><strong>{p.average?.toFixed(1)}</strong><span> / 100</span>
            <div className="ranking-score-track"><div style={{ width: Math.min(100, Math.max(0, p.average)) + '%' }}/></div>
          </div>
          <div className="ranking-minutes"><strong>{p.minutes}</strong><span>{p.matches} matches</span></div>
          <div className="ranking-extra">{p.keyMetric === null ? '—' : p.keyMetric.toFixed(1)} <span aria-hidden="true">↗</span></div>
        </button>)}
      </div>
      : <div className="ranking-empty">
        <span className="eyebrow">AWAITING VERIFIED PERFORMANCES</span>
        <h3>No ranking available for this position yet.</h3>
        <p>There are no players with enough comparable Sorare match scores in this group.
          The leaderboard will populate from published match data, not from reputation, age or a Sorare identity alone.</p>
      </div>}

    <div className="ranking-distribution">
      <DistributionChart rows={ranked}/>
    </div>
    <div className="ranking-waiting">
      <div className="ranking-heading">
        <div><span className="eyebrow">SCOUTING WATCHLIST</span><h2>Players awaiting enough data</h2>
          <p>{waiting.length} linked profiles · not ranked in this scoring version</p></div>
      </div>
      {waiting.length ? <div className="ranking-watchlist">
        {waiting.slice(0, 20).map(p => <button key={p.id} type="button" onClick={() => onOpen(p)}>
          <span><strong>{p.name}</strong><small>{p.club || 'Club not recorded'} · {p.version && p.eligible ? 'Different Sorare scoring version (' + p.version + ')' : p.matches + ' recent scores · ' + p.minutes + ' min'}</small></span>
          <span>View profile ↗</span>
        </button>)}
        {waiting.length > 20 && <p>Showing 20 of {waiting.length} players without a ranking.</p>}
      </div> : <p className="scout-empty">No unranked players in this group.</p>}
    </div>
    <p className="scout-footnote">
      Method: {RANKING_MIN_MATCHES}+ finalized, played, non-low-coverage games and
      { ' ' + RANKING_MIN_MINUTES}+ minutes {season === 'all' ? 'within the last ' + RANKING_WINDOW_DAYS + ' days.' : 'during selected season ' + seasonLabel(season) + '.'}
      Players are compared only within the same gender, broad position and Sorare scoring version.
      The score is Sorare's fantasy performance rating, not an independent NZ Talent Score.
      Position-specific figures per 90 minutes appear only when every counted match contains that statistic.
      Differences in league strength are not yet adjusted. A name on the watchlist is not a ranking.
    </p>
  </section>
}
