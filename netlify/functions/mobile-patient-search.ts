// mobile-patient-search.ts — org-scoped patient search for invite generation
// GET /api/mobile-patient-search?q=<name fragment>&limit=20
//
// Returns id, full name, and DOB for authenticated org staff (who already have
// chart access) so a large practice can disambiguate same-name patients.
// No diagnosis or other clinical detail. Required by the admin "Generate
// Invite" modal patient autocomplete.

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

  const trimmed = q.trim()
  const term = `%${trimmed}%`
  const numericId = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : null
  const limit = Math.min(parseInt(event.queryStringParameters?.limit as string || '20', 10), 50)

  // cr.patient schema: assumes first_name, last_name columns (standard PatientTrac clinical schema).
  // Falls back gracefully if columns differ — the catch returns an empty list rather than crashing.
  try {
    // Match on a name fragment, an exact patient_id, or an exact DOB (when the
    // query parses as a date). org_id scoping is a separate AND filter.
    const orParts = [`first_name.ilike.${term}`, `last_name.ilike.${term}`]
    if (numericId !== null) orParts.push(`patient_id.eq.${numericId}`)
    const dob = parseDob(trimmed)
    if (dob) orParts.push(`birth.eq.${dob}`)

    const { data, error } = await admin.schema('cr').from('patient')
      .select('patient_id, first_name, last_name, birth')
      .eq('org_id', staff.orgId)
      .or(orParts.join(','))
      .limit(limit)

    if (error) throw error

    return jsonOk({
      items: (data || []).map(p => ({
        patientExternalId: String(p.patient_id),
        displayName: formatName(p.first_name as string, p.last_name as string),
        dob: (p.birth as string | null) ?? null,
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
  return [f, l].filter(Boolean).join(' ')
}

// Parse a typed DOB (YYYY-MM-DD or M/D/YYYY) into an ISO date, or null if it
// isn't a valid calendar date — guards the .or() from a bad date literal that
// would otherwise fail the whole query.
function parseDob(s: string): string | null {
  let y = 0, mo = 0, d = 0
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3] }
  else { m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) { mo = +m[1]; d = +m[2]; y = +m[3] } }
  if (!m || mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
