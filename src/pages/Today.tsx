import { Link } from 'react-router-dom'
import { C, Card, Ico, Spinner, Hero, GradientStat, ACCENTS, useAsync } from '../lib/ui'
import { CareScene, AiNetwork, HeroCircuit } from '../lib/art'
import { useT } from '../lib/i18n'
import { listMeds, takenTodayIds, listDietToday, listActivityToday, listJournal, listVitals } from '../lib/data'
import { supabase } from '../lib/supabase'

async function fetchFriendlyName(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const res = await fetch('/api/patient-profile', { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (!res.ok) return null
    const j = await res.json()
    const p = j?.profile
    return (p?.friendly_name || p?.first_name || null)
  } catch { return null }
}

export default function Today() {
  const { t, lang } = useT()
  const today = new Date().toLocaleDateString(lang, { weekday: 'long', month: 'long', day: 'numeric' })
  const { data, loading, error } = useAsync(async () => {
    const [meds, taken, diet, activity, journal, vitals, friendlyName] = await Promise.all([
      listMeds(), takenTodayIds(), listDietToday(), listActivityToday(), listJournal(), listVitals(), fetchFriendlyName(),
    ])
    const todayStr = new Date().toISOString().slice(0, 10)
    const checkin = journal.some(j => j.entry_date === todayStr)
    return { medsTaken: taken.length, medsTotal: meds.length, meals: diet.length, activity: activity.length, checkin, latestVital: vitals[0], friendlyName }
  }, [])

  return (
    <div className="cmp-stagger">
      <Hero style={{ marginBottom: 22 }}>
        <HeroCircuit />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 12, color: C.mint, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>{today}</div>
            <h1 style={{ fontSize: 'clamp(28px,4vw,40px)', color: C.text, lineHeight: 1.05 }}>{data?.friendlyName ? t('today.greetingName', { name: data.friendlyName }) : t('today.greeting')}</h1>
            <p style={{ color: C.muted, marginTop: 12, fontSize: 14.5, lineHeight: 1.65, maxWidth: 440 }}>{t('today.planBody')}</p>
            <Link to="/treatment" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, color: C.navy950, fontWeight: 700, fontFamily: 'Rajdhani,sans-serif', fontSize: 15, textDecoration: 'none', background: `linear-gradient(135deg, ${C.mint}, ${C.mintDk})`, borderRadius: 11, padding: '11px 18px', boxShadow: `0 8px 20px ${C.mint}33` }}>
              {t('today.viewPlan')} <Ico name="arrow" size={16} color={C.navy950} />
            </Link>
          </div>
          <div style={{ position: 'relative', flexShrink: 0 }} className="cmp-float">
            <AiNetwork width={150} height={104} style={{ position: 'absolute', right: 12, top: -16, opacity: 0.6 }} />
            <CareScene width={280} height={186} />
          </div>
        </div>
      </Hero>

      {loading && <Spinner label={t('common.loading')} />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
          {([
            ['/medications', 'pill', t('today.meds'), t('today.medsStatus', { taken: data.medsTaken, total: data.medsTotal }), ACCENTS.medications],
            ['/journal', 'journal', t('today.checkin'), data.checkin ? t('today.checkinDone') : t('today.checkinNot'), data.checkin ? { from: C.green, to: C.mint } : { from: C.amber, to: C.gold }],
            ['/vitals', 'vitals', t('today.vital'), data.latestVital ? `${t('vit.' + data.latestVital.type)} · ${data.latestVital.value} ${data.latestVital.unit ?? ''}` : t('today.noReadings'), ACCENTS.vitals],
            ['/diet', 'diet', t('today.meals'), t('today.count', { n: data.meals }), ACCENTS.diet],
            ['/exercise', 'exercise', t('today.activity'), t('today.count', { n: data.activity }), ACCENTS.exercise],
          ] as [string, string, string, string, { from: string; to: string }][]).map(([to, ic, label, value, a]) => (
            <Link key={to} to={to} style={{ textDecoration: 'none' }}>
              <GradientStat icon={ic} label={label} value={<span style={{ fontSize: 16 }}>{value}</span>} from={a.from} to={a.to} />
            </Link>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: C.subtle, marginTop: 18 }}>{t('common.emergency')}</p>
    </div>
  )
}
