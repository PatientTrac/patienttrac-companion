// mobile-staff-me.ts — returns staff org/role for the authenticated Supabase user
// GET /api/mobile-staff-me
//
// Called by auth.tsx to determine if the logged-in user is a staff/admin member.
// Uses the service-role client to query saas.org_members (bypasses RLS).
// Returns { isStaff: false } rather than 401 when the user is not staff,
// so the client can safely use this for routing decisions without error handling.
//
// Amendment 8: preferred path for staff detection when saas.org_members
// RLS is uncertain for the anon client.

import { createClient } from '@supabase/supabase-js'
import { verifyStaffJwt, jsonOk, jsonErr } from './_mobile-helpers'

export const handler = async (event: { httpMethod: string; headers: Record<string, string> }) => {
  if (event.httpMethod !== 'GET') return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  try {
    const staff = await verifyStaffJwt(event.headers, admin)
    if (!staff) return jsonOk({ isStaff: false, orgId: null, role: null })
    return jsonOk({ isStaff: true, orgId: staff.orgId, role: staff.orgRole })
  } catch (e: any) {
    console.error('[mobile-staff-me]', e?.message)
    return jsonErr(500, 'INTERNAL_ERROR', 'Unexpected error')
  }
}
