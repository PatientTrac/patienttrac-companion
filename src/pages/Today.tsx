import { Link } from 'react-router-dom'
import { C, Card, Ico, useLocal } from '../lib/ui'

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <h1 style={{ fontSize: 'clamp(28px,4vw,40px)', color: C.text }}>{title}</h1>
      <p style={{ color: C.muted, marginTop: 6, fontSize: 15 }}>{sub}</p>
    </div>
  )
}

export default function Today() {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const [medsTaken] = useLocal<number>('cmp_meds_taken_today', 2)
  const [checkin] = useLocal<boolean>('cmp_checkin_done', false)

  const tiles: [string, string, string, string, string][] = [
    ['pill', 'Medications', `${medsTaken} of 3 taken today`, C.mint, '/medications'],
    ['journal', "Today's check-in", checkin ? 'Completed' : 'Not done yet', checkin ? C.green : C.amber, '/journal'],
    ['vitals', 'Latest vital', 'Heart rate · 72 bpm', C.cyan, '/vitals'],
    ['diet', 'Meals logged', '1 today', C.mint, '/diet'],
  ]
  return (
    <div>
      <Header title="Good to see you, Jane" sub={today} />
      <Card accent={C.mint} style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Ico name="plan" size={20} color={C.mint} />
          <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 600, fontSize: 18, color: C.text }}>Your care plan</span>
        </div>
        <div style={{ fontSize: 15, color: C.text, marginBottom: 4 }}>Post-surgery recovery — total knee replacement</div>
        <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          Keep up gentle movement, take your medications as scheduled, and log how you feel each day.
          Your care team is watching your progress between visits.
        </p>
        <Link to="/treatment" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: C.mint, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
          View plan & ask a question <Ico name="arrow" size={15} color={C.mint} />
        </Link>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        {tiles.map(([ic, t, s, col, to]) => (
          <Link key={t} to={to} style={{ textDecoration: 'none' }}>
            <Card style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: col + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ico name={ic} size={20} color={col} />
                </span>
                <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 600, fontSize: 16, color: C.text }}>{t}</span>
              </div>
              <div style={{ fontSize: 14, color: C.muted }}>{s}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
