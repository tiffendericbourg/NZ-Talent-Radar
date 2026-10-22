// Position groups shared by the independent football-event analysis.
export const POSITIONS = [
  { value: 'forward', label: 'Forwards' },
  { value: 'midfielder', label: 'Midfielders' },
  { value: 'defender', label: 'Defenders' },
  { value: 'goalkeeper', label: 'Goalkeepers' },
]

export function positionGroup(position) {
  const p = String(position || '').toLowerCase().replace(/[_-]/g, ' ')
  if (/keeper|goalie/.test(p)) return 'goalkeeper'
  if (/defend|back|centre back|center back|fullback/.test(p)) return 'defender'
  if (/midfield|wing half/.test(p)) return 'midfielder'
  if (/forward|striker|winger|attacker|attack/.test(p)) return 'forward'
  return null
}
