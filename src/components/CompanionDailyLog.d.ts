// Type declarations for the JS component CompanionDailyLog.jsx
// (lets DailyLog.tsx import it under `tsc` strict mode).
import * as React from 'react'

export interface CompanionDailyLogProps {
  /** care-plan fetch endpoint (default: /api/companion-care-plan-current) */
  endpoint?: string
  /** day-save endpoint (default: /api/companion-log-day) */
  saveEndpoint?: string
  /** returns the signed-in patient's Supabase access token */
  getAccessToken?: () => Promise<string | null>
  /** optional override for fetching the plan */
  loadCarePlan?: (carePlanId: number | null) => Promise<{ status: number; body: any }>
  /** optional override for saving a day */
  saveDay?: (payload: any) => Promise<{ status: number; body: any }>
}

declare const CompanionDailyLog: React.FC<CompanionDailyLogProps>
export default CompanionDailyLog
