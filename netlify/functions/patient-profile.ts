// patient-profile.ts — patient's own profile (read + photo URL update)
// GET  /api/patient-profile          — returns safe demographic shape
// PATCH /api/patient-profile          — updates photo_url + photo_storage_path only
//
// Demographics (name, DOB, address, etc.) are read-only for patients.
// Photo is patient-editable: client uploads to Supabase Storage, then calls PATCH here.

import { createClient } from '@supabase/supabase-js'
import { jsonOk, jsonErr, type NetlifyEvent } from './_mobile-helpers'

const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const PROFILE_COLS = [
  'patient_id', 'patient_ext_ref',
  'first_name', 'middle_name', 'last_name', 'suffix',
  'birth', 'gender', 'gender_identity', 'blood_type', 'marital_status',
  'email', 'phone', 'cell_phone', 'area_code',
  'address1', 'address2', 'city', 'state', 'zipcode', 'country', 'province', 'postal_code',
  'preferred_language', 'interpreter_needed',
  'photo_url', 'photo_storage_path',
].join(', ')

async function verifyPatient(headers: Record<string, string>, admin: ReturnType<typeof createClient>) {
  const jwt = (headers.authorization || headers.Authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null

  const { data } = await admin.auth.getUser(jwt)
  if (!data?.user) return null

  const { data: acct } = await admin.schema('cr').from('patient_account')
    .select('patient_id, org_id')
    .eq('auth_user_id', data.user.id)
    .maybeSingle()

  if (!acct) return null
  return { userId: data.user.id, patientId: acct.patient_id as number, orgId: acct.org_id as string }
}

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod === 'OPTIONS') return jsonOk({})

  const admin = getAdmin()
  const patient = await verifyPatient(event.headers, admin)
  if (!patient) return jsonErr(401, 'UNAUTHORIZED', 'Authentication required')

  if (event.httpMethod === 'GET') {
    const { data, error } = await admin.schema('cr').from('patient')
      .select(PROFILE_COLS)
      .eq('patient_id', patient.patientId)
      .maybeSingle()

    if (error) {
      console.error('[patient-profile GET]', error.message)
      return jsonErr(500, 'DB_ERROR', 'Could not load profile')
    }
    if (!data) return jsonErr(404, 'NOT_FOUND', 'Profile not found')

    return jsonOk({ profile: data })
  }

  if (event.httpMethod === 'PATCH') {
    let body: { photoUrl?: string; photoStoragePath?: string }
    try { body = JSON.parse(event.body || '{}') }
    catch { return jsonErr(400, 'BAD_REQUEST', 'Invalid JSON') }

    const updates: Record<string, string | null> = {}
    if ('photoUrl' in body) updates.photo_url = body.photoUrl ?? null
    if ('photoStoragePath' in body) updates.photo_storage_path = body.photoStoragePath ?? null

    if (!Object.keys(updates).length) return jsonErr(400, 'BAD_REQUEST', 'Nothing to update')

    const { error } = await admin.schema('cr').from('patient')
      .update(updates)
      .eq('patient_id', patient.patientId)

    if (error) {
      console.error('[patient-profile PATCH]', error.message)
      return jsonErr(500, 'DB_ERROR', 'Could not save photo')
    }

    return jsonOk({ ok: true })
  }

  return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
}
