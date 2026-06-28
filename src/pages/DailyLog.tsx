// src/pages/DailyLog.tsx — routed page that mounts the daily-log calendar.
// Injects the signed-in patient's access token; endpoints default to
// /api/companion-care-plan-current and /api/companion-log-day (Netlify redirects).
import { useCallback } from 'react'
import CompanionDailyLog from '../components/CompanionDailyLog'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'

export default function DailyLog() {
  const { lang } = useT()

  const getToken = useCallback(
    async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    []
  )

  const loadCarePlan = useCallback(
    async (carePlanId: number | null) => {
      const headers: Record<string, string> = { accept: 'application/json' }
      const token = await getToken()
      if (token) headers.Authorization = `Bearer ${token}`
      const params = new URLSearchParams({ locale: lang })
      if (carePlanId) params.set('carePlanId', String(carePlanId))
      const res = await fetch(`/api/companion-care-plan-current?${params}`, { headers, credentials: 'include' })
      let body = null
      try { body = await res.json() } catch {}
      return { status: res.status, body }
    },
    [lang, getToken]
  )

  return (
    <CompanionDailyLog
      getAccessToken={getToken}
      loadCarePlan={loadCarePlan}
    />
  )
}
