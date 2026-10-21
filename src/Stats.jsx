import { useMemo } from 'react'

function Metric({ label, value, note, muted = false }) {
  return <article className="scout-stat"><small>{label}</small><strong className={muted ? 'scout-unavailable' : ''}>{value ?? '—'}</strong><span>{note}</span></article>
}

function CountBars({ title, rows, total }) {
  const max = Math.max(...rows.map(item => item.value), 1)
  return <article className="scout-panel"><h3>{title}</h3>
    {rows.map(item => <div className="scout-bar-row" key={item.label}>
      <div><span>{item.label}</span><strong>{item.value.toLocaleString('en-NZ')}</strong></div>
      <div className="scout-track"><span style={{ width: (item.value / max * 100) + '%' }} /></div>
    </div>)}
    <p>Based on {total.toLocaleString('en-NZ')} player profiles; unknown values are kept separate.</p>
  </article>
}

export function ScoutingDashboard({ players, sorare, understat }) {
  const counts = useMemo(() => {
    const age = player => {
      if (!player.birth_date) return null
      const birth = new Date(player.birth_date + 'T00:00:00Z')
      if (Number.isNaN(birth.getTime())) return null
      const now = new Date()
      return now.getUTCFullYear() - birth.getUTCFullYear() -
        (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate()) ? 1 : 0)
    }
    const ages = players.map(age)
    return {
      women: players.filter(p => p.gender === 'Women').length,
      men: players.filter(p => p.gender === 'Men').length,
      unknownGender: players.filter(p => !['Men', 'Women'].includes(p.gender)).length,
      young: ages.filter(a => a !== null && a < 23).length,
      age23to29: ages.filter(a => a !== null && a >= 23 && a < 30).length,
      age30plus: ages.filter(a => a !== null && a >= 30).length,
      ageUnknown: ages.filter(a => a === null).length,
      abroad: players.filter(p => p.club && p.club_country && p.club_country !== 'New Zealand').length,
      clubs: new Set(players.map(p => p.club).filter(Boolean)).size,
      clubsMissing: players.filter(p => !p.club).length,
    }
  }, [players])
  const linked = players.filter(p => p.sorare_slug).length
  const shotPlayers = Object.values(understat?.players || {})
  const shots = shotPlayers.reduce((sum, p) => sum + (p.stats?.shots || 0), 0)
  return <section className="scout-dashboard">
    <div className="directory-heading"><span className="eyebrow">03 / SCOUTING INTELLIGENCE</span>
      <h1>By the numbers<span className="green">.</span></h1>
      <p>A transparent view of NZ football talent. Source coverage is not the same as player performance.</p>
    </div>
    <p className="scout-strip">DATABASE SNAPSHOT <span>Wikidata · Sorare · Understat</span></p>
    <div className="scout-stats-grid">
      <Metric label="PLAYER PROFILES" value={players.length.toLocaleString('en-NZ')} note="Source-linked catalogue"/>
      <Metric label="SORARE IDENTITIES" value={linked.toLocaleString('en-NZ')} note={players.length ? (100 * linked / players.length).toFixed(1) + '% of catalogue' : '—'}/>
      <Metric label="UNDERSTAT PLAYERS" value={shotPlayers.length} note="Verified Understat IDs"/>
      <Metric label="SHOT EVENTS" value={shots.toLocaleString('en-NZ')} note="Imported X/Y locations"/>
      <Metric label="OVERSEAS CLUBS" value={counts.abroad} note="Club location documented"/>
    </div>
    <div className="scout-chart-grid">
      <CountBars title="Who is in the database?" total={players.length} rows={[
        {label:'Women',value:counts.women},{label:'Men',value:counts.men},
        {label:'Not recorded',value:counts.unknownGender}
      ]}/>
      <CountBars title="Age distribution" total={players.length} rows={[
        {label:'Under 23',value:counts.young},{label:'23–29',value:counts.age23to29},
        {label:'30+',value:counts.age30plus},{label:'Date missing',value:counts.ageUnknown}
      ]}/>
      <CountBars title="Source coverage" total={players.length} rows={[
        {label:'Sorare linked',value:linked},
        {label:'Understat shots',value:shotPlayers.length},
        {label:'Club unknown',value:counts.clubsMissing}
      ]}/>
    </div>
    <p className="scout-footnote">Numbers are descriptive, not scouting rankings. Sorare IDs are matched by name and birth date; Understat only covers selected competitions. Understat shot coordinates are normalised from 0 to 1.</p>
  </section>
}

export function ShotMap({ shots }) {
  const visible = shots.slice(-500)
  return <div className="pitch-wrap">
    <svg viewBox="0 0 560 360" className="shot-pitch" role="img"
      aria-label={'Attacking-direction pitch map with ' + visible.length + ' plotted shots'}>
      <rect x="4" y="4" width="552" height="352" fill="#142c1e" rx="4" stroke="#5c8c65" strokeWidth="2"/>
      <path d="M280 4V356M4 180H556" stroke="#52825b" strokeWidth="1.2" strokeDasharray="4 5"/>
      <rect x="4" y="70" width="90" height="220" fill="none" stroke="#52825b" strokeWidth="1.5"/>
      <rect x="466" y="70" width="90" height="220" fill="none" stroke="#52825b" strokeWidth="1.5"/>
      <rect x="518" y="126" width="38" height="108" fill="none" stroke="#52825b" strokeWidth="1.5"/>
      <circle cx="280" cy="180" r="48" fill="none" stroke="#52825b" strokeWidth="1.5"/>
      <circle cx="478" cy="180" r="3" fill="#9dbb9e"/>
      {visible.map((shot, index) => <circle key={shot.id || index} cx={4 + shot.x * 552}
        cy={4 + shot.y * 352} r={shot.result === 'Goal' ? 5.5 : 3.2}
        fill={shot.result === 'Goal' ? '#d2f59b' : '#f1aa83'} fillOpacity=".78"
        stroke="#112017" strokeWidth=".4"><title>{(shot.result || 'Shot') + ' · xG ' + shot.xg}</title></circle>)}
    </svg>
    <div className="pitch-legend"><span><i className="goal-dot"/> Goal</span><span><i className="shot-dot"/> Other shot</span><span>ATTACK →</span></div>
    {shots.length > visible.length && <p>Showing the last {visible.length} events of {shots.length} to keep the map readable.</p>}
  </div>
}

export function PlayerPerformance({ player, sorare, understat }) {
  const record = understat?.players?.[player.id]
  const data = record?.stats
  const match = (sorare?.matches || []).find(row => row.player_id === player.id)
  const linked = player.sorare_slug
  return <section className="performance-section">
    <div className="performance-heading"><div><span className="eyebrow">03 / PERFORMANCE</span><h2>On the radar<span className="green">.</span></h2></div>
      <span className="scout-source">{record ? 'UNDERSTAT · ALL IMPORTED SHOTS' : 'SOURCE COVERAGE'}</span></div>
    <div className="scout-stats-grid player-metrics">
      <Metric label="SHOTS" value={data?.shots} note={record ? 'Tracked events' : 'Not available'} muted={!record}/>
      <Metric label="GOALS" value={data?.goals} note={record ? 'Shot outcomes' : 'Not available'} muted={!record}/>
      <Metric label="EXPECTED GOALS" value={data ? data.xg.toFixed(2) : null} note={record ? 'Understat xG' : 'Not available'} muted={!record}/>
      <Metric label="CONVERSION" value={data?.conversion_pct == null ? null : data.conversion_pct + '%'} note={record ? 'Goals / shots' : 'Not available'} muted={!record}/>
      <Metric label="xG PER SHOT" value={data?.xg_per_shot == null ? null : data.xg_per_shot.toFixed(3)} note={record ? 'Shot quality' : 'Not available'} muted={!record}/>
    </div>
    {record && record.shots?.length ? <><h3 className="shot-map-title">Shot locations · Understat X/Y</h3><ShotMap shots={record.shots}/><p className="scout-footnote">Shot coordinates are normalised (0–1) with attack towards the right. Period: all imported Understat matches, not necessarily the player's entire career. <a href={record.source_url} target="_blank" rel="noreferrer">Source ↗</a></p></>
      : <p className="scout-empty">No verified Understat shots for this player yet. Missing statistics are never treated as zero.</p>}
    <div className="scout-links"><span>Sorare: <strong>{linked ? 'Verified identity' : match?.status === 'needs_review' ? 'Needs review' : match?.status === 'not_found' ? 'Not found' : 'Not checked'}</strong></span>
      {linked && <a href={'https://sorare.com/football/players/' + encodeURIComponent(linked)} target="_blank" rel="noreferrer">View Sorare profile ↗</a>}
    </div>
  </section>
}
