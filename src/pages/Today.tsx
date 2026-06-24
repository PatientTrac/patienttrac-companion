import { Link } from 'react-router-dom'
import { C, Card, Ico, Spinner, useAsync } from '../lib/ui'
import { listMeds, takenTodayIds, listDietToday, listActivityToday, listJournal, listVitals } from '../lib/data'

export default function Today() {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const { data, loading, error } = useAsync(async () => {
    const [meds, taken, diet, activity, journal, vitals] = await Promise.all([
      listMeds(), takenTodayIds(), listDietToday(), listActivityToday(), listJournal(), listVitals(),
    ])
    const todayStr = new Date().toISOString().slice(0, 10)
    const checkin = journal.some(j => j.entry_date === todayStr)
    const v = vitals[0]
    return { medsTaken: taken.length, medsTotal: meds.length, meals: diet.length, activity: activity.length, checkin, latestVital: v }
  }, [])

  return (
    <div>
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ fontSize: 'clamp(28px,4vw,40px)', color: C.text }}>Welcome back</h1>
        <p style={{ color: C.muted, marginTop: 6, fontSize: 15 }}>{today}</p>
      </div>

      <Card accent={C.mint} style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Ico name="plan" size={20} color={C.mint} />
          <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 600, fontSize: 18, color: C.text }}>Your care plan</span>
        </div>
        <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
          Take your medications as scheduled, keep up gentle movement, and log how you feel each day. Your care team is watching your progress between visits.
        </p>
        <Link to="/treatment" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: C.mint, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
          View plan & ask a question <Ico name="arrow" size={15} color={C.mint} />
        </Link>
      </Card>

      {loading && <Spinner />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
          {([
            ['pill', 'Medications', `${data.medsTaken} of ${data.medsTotal} taken today`, C.mint, '/medications'],
            ['journal', "Today's check-in", data.checkin ? 'Completed' : 'Not done yet', data.checkin ? C.green : C.amber, '/journal'],
            ['vitals', 'Latest vital', data.latestVital ? `${data.latestVital.type.replace('_', ' ')} · ${data.latestVital.value} ${data.latestVital.unit ?? ''}` : 'No readings yet', C.cyan, '/vitals'],
            ['diet', 'Meals logged', `${data.meals} today`, C.mint, '/diet'],
            ['exercise', 'Activity logged', `${data.activity} today`, C.mint, '/exercise'],
          ] as [string, string, string, string, string][]).map(([ic, t, s, col, to]) => (
            <Link key={t} to={to} style={{ textDecoration: 'none' }}>
              <Card style={{ height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 10, background: col + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico name={ic} size={20} color={col} /></span>
                  <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 600, fontSize: 16, color: C.text }}>{t}</span>
                </div>
                <div style={{ fontSize: 14, color: C.muted }}>{s}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
