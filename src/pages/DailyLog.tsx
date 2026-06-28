// src/pages/DailyLog.tsx — routed page that mounts the daily-log calendar.
// Injects the signed-in patient's access token; endpoints default to
// /api/companion-care-plan-current and /api/companion-log-day (Netlify redirects).
import CompanionDailyLog from '../components/CompanionDailyLog'
import { supabase } from '../lib/supabase'

export default function DailyLog() {
  return (
    <CompanionDailyLog
      getAccessToken={async () =>
        (await supabase.auth.getSession()).data.session?.access_token ?? null
      }
    />
  )
}
