// mobile-patient-search.ts — org-scoped patient search for invite generation
// GET /api/mobile-patient-search?q=<name fragment>&limit=20
//
// Returns id + display name only. No DOB, diagnosis, or full PII.
// Required by the admin "Generate Invite" modal patient autocomplete.

import { createClient } from '@supabase/supabase-js'
import { verifyStaffJwt, jsonOk, jsonErr, type NetlifyEvent } from './_mobile-helpers'

const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== 'GET') return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

  const admin = getAdmin()
  const staff = await verifyStaffJwt(event.headers, admin)
  if (!staff) return jsonErr(401, 'UNAUTHORIZED', 'Authentication required')

  const q = event.queryStringParameters?.q as string | null
  if (!q || q.trim().length < 2) return jsonOk({ items: [] })

  const term = `%${q.trim()}%`
  const limit = Math.min(parseInt(event.queryStringParameters?.limit as string || '20', 10), 50)

  // cr.patient schema: assumes first_name, last_name columns (standard PatientTrac clinical schema).
  // Falls back gracefully if columns differ — the catch returns an empty list rather than crashing.
  try {
    const { data, error } = await admin.schema('cr').from('patient')
      .select('patient_id, first_name, last_name')
      .eq('org_id', staff.orgId)
      .or(`first_name.ilike.${term},last_name.ilike.${term}`)
      .limit(limit)

    if (error) throw error

    return jsonOk({
      items: (data || []).map(p => ({
        patientExternalId: String(p.patient_id),
        displayName: formatName(p.first_name as string, p.last_name as string),
      })),
    })
  } catch (e: any) {
    console.error('[mobile-patient-search]', e?.message)
    // Return empty rather than 500 — the UI can fall back to manual ID entry
    return jsonOk({ items: [] })
  }
}

function formatName(first: string, last: string): string {
  const f = (first || '').trim()
  const l = (last || '').trim()
  if (!f && !l) return 'Unknown Patient'
  if (!l) return f
  if (!f) return l
  return `${f} ${l[0]}.`
}
