// Patient-facing "My Profile" page — read-only demographics + photo upload
import { useEffect, useRef, useState } from 'react'
import { C, Card, Ico, SectionHeader, Spinner, useAsync } from '../lib/ui'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'

type Profile = {
  patient_id: number
  patient_ext_ref: string | null
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  suffix: string | null
  birth: string | null
  gender: string | null
  gender_identity: string | null
  blood_type: string | null
  marital_status: string | null
  email: string | null
  phone: string | null
  cell_phone: string | null
  area_code: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  zipcode: string | null
  country: string | null
  province: string | null
  postal_code: string | null
  preferred_language: string | null
  interpreter_needed: boolean | null
  photo_url: string | null
  photo_storage_path: string | null
  friendly_name: string | null
}

async function fetchProfile(): Promise<Profile> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/patient-profile', {
    headers: { Authorization: `Bearer ${session?.access_token}` },
  })
  if (!res.ok) throw new Error((await res.json()).error?.message || 'Failed to load profile')
  const j = await res.json()
  return j.profile as Profile
}

async function savePhotoUrl(photoUrl: string, photoStoragePath: string) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/patient-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ photoUrl, photoStoragePath }),
  })
  if (!res.ok) throw new Error((await res.json()).error?.message || 'Could not save photo')
}

async function saveFriendlyName(friendlyName: string) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/patient-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ friendlyName }),
  })
  if (!res.ok) throw new Error((await res.json()).error?.message || 'Could not save name')
}

function formatDob(birth: string | null) {
  if (!birth) return null
  try {
    return new Date(birth + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return birth }
}

function fullName(p: Profile) {
  return [p.first_name, p.middle_name, p.last_name, p.suffix].filter(Boolean).join(' ') || 'Patient'
}

function formatPhone(areaCode: string | null, phone: string | null) {
  if (!phone) return null
  if (areaCode) return `(${areaCode}) ${phone}`
  return phone
}

function formatAddress(p: Profile) {
  const parts = [p.address1, p.address2].filter(Boolean)
  const cityLine = [p.city, p.state, p.zipcode || p.postal_code].filter(Boolean).join(', ')
  if (cityLine) parts.push(cityLine)
  if (p.country && p.country !== 'US' && p.country !== 'USA') parts.push(p.country)
  return parts
}

export default function Profile() {
  const { session } = useAuth()
  const { data: profile, loading, error, reload } = useAsync(fetchProfile, [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const { t } = useT()
  const [nameDraft, setNameDraft] = useState('')
  const [nameState, setNameState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => { setNameDraft(profile?.friendly_name || '') }, [profile?.friendly_name])

  // patient-photos is a private (PHI) bucket, so a public URL 403s. Resolve a
  // short-lived signed URL from the stored path; fall back to the placeholder.
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    ;(async () => {
      const path = profile?.photo_storage_path
      if (path) {
        const { data } = await supabase.storage.from('patient-photos').createSignedUrl(path, 3600)
        if (active && data?.signedUrl) { setPhotoSrc(data.signedUrl); return }
      }
      if (active) setPhotoSrc(profile?.photo_url ?? null)
    })()
    return () => { active = false }
  }, [profile?.photo_storage_path, profile?.photo_url])

  const handleNameSave = async () => {
    if ((profile?.friendly_name || '') === nameDraft.trim()) return
    setNameState('saving')
    try {
      await saveFriendlyName(nameDraft.trim())
      setNameState('saved')
      reload()
    } catch { setNameState('error') }
    setTimeout(() => setNameState('idle'), 2000)
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !session) return
    setUploading(true)
    setUploadError(null)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${session.user.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage
        .from('patient-photos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('patient-photos').getPublicUrl(path)
      // Bust cache with a version param so the browser reloads the new photo
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`
      await savePhotoUrl(publicUrl, path)
      reload()
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const row: React.CSSProperties = {
    display: 'flex', gap: 8, alignItems: 'flex-start',
    padding: '10px 0', borderBottom: `1px solid ${C.subtle}22`,
  }
  const label: React.CSSProperties = { fontSize: 12, color: C.muted, minWidth: 140, flexShrink: 0, marginTop: 2 }
  const value: React.CSSProperties = { fontSize: 14, color: C.text, lineHeight: 1.5 }

  if (loading) return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
      <Spinner label="Loading profile…" />
    </div>
  )
  if (error) return <p style={{ color: C.red, fontSize: 14 }}>{error}</p>
  if (!profile) return null

  const address = formatAddress(profile)
  const dob = formatDob(profile.birth)
  const mainPhone = formatPhone(profile.area_code, profile.phone)
  const cell = profile.cell_phone || null

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="user" title="My Profile" sub="Your information on file with your care team." color={C.violet} />

      {/* Photo + name hero */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: `linear-gradient(135deg, ${C.violet}44, ${C.cyan}22)`,
              border: `2px solid ${C.violet}44`,
              overflow: 'hidden', display: 'grid', placeItems: 'center',
            }}>
              {photoSrc ? (
                <img src={photoSrc} alt="" onError={() => setPhotoSrc(null)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Ico name="user" size={40} color={C.violet} stroke={1.2} />
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Change photo"
              style={{
                position: 'absolute', bottom: 0, right: -4,
                width: 26, height: 26, borderRadius: '50%', border: 'none',
                background: `linear-gradient(135deg, ${C.violet}, #6366f1)`,
                display: 'grid', placeItems: 'center', cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}
            >
              {uploading ? <Spinner label="" /> : <Ico name="camera" size={13} color={C.text} stroke={2} />}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </div>

          {/* Name + MRN */}
          <div>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 26, color: C.text, lineHeight: 1.1 }}>
              {fullName(profile)}
            </div>
            {profile.patient_ext_ref && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontFamily: 'DM Mono,monospace' }}>
                MRN: {profile.patient_ext_ref}
              </div>
            )}
            {uploadError && <p style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{uploadError}</p>}

            {/* Friendly name — the one patient-editable name field */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                {t('profile.friendlyName')}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={nameDraft}
                  maxLength={60}
                  placeholder={t('profile.friendlyNamePlaceholder')}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleNameSave() }}
                  aria-label={t('profile.friendlyName')}
                  style={{
                    background: C.navy800, color: C.text, border: `1px solid ${C.subtle}66`,
                    borderRadius: 9, padding: '8px 11px', fontSize: 14, minWidth: 180,
                  }}
                />
                <button
                  onClick={handleNameSave}
                  disabled={nameState === 'saving' || (profile.friendly_name || '') === nameDraft.trim()}
                  style={{
                    border: 'none', borderRadius: 9, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    color: C.navy950,
                    background: nameState === 'saved' ? C.green : nameState === 'error' ? C.red : `linear-gradient(135deg, ${C.violet}, #6366f1)`,
                    opacity: nameState === 'saving' || (profile.friendly_name || '') === nameDraft.trim() ? 0.55 : 1,
                  }}>
                  {nameState === 'saving' ? '…' : nameState === 'saved' ? '✓' : nameState === 'error' ? '!' : t('common.save')}
                </button>
              </div>
              <p style={{ fontSize: 11.5, color: C.subtle, margin: '5px 0 0' }}>{t('profile.friendlyNameHint')}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Demographics */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          Personal
        </div>

        {dob && (
          <div style={row}>
            <span style={label}>Date of birth</span>
            <span style={value}>{dob}</span>
          </div>
        )}
        {profile.gender && (
          <div style={row}>
            <span style={label}>Sex on record</span>
            <span style={value}>{profile.gender}</span>
          </div>
        )}
        {profile.gender_identity && profile.gender_identity !== profile.gender && (
          <div style={row}>
            <span style={label}>Gender identity</span>
            <span style={value}>{profile.gender_identity}</span>
          </div>
        )}
        {profile.blood_type && (
          <div style={row}>
            <span style={label}>Blood type</span>
            <span style={value}>{profile.blood_type}</span>
          </div>
        )}
        {profile.marital_status && (
          <div style={row}>
            <span style={label}>Marital status</span>
            <span style={value}>{profile.marital_status}</span>
          </div>
        )}
        {!dob && !profile.gender && !profile.blood_type && (
          <p style={{ fontSize: 14, color: C.muted }}>No personal information on file.</p>
        )}
      </Card>

      {/* Contact */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          Contact
        </div>

        {profile.email && (
          <div style={row}>
            <span style={label}><Ico name="mail" size={13} color={C.muted} /> Email</span>
            <span style={value}>{profile.email}</span>
          </div>
        )}
        {mainPhone && (
          <div style={row}>
            <span style={label}><Ico name="phone" size={13} color={C.muted} /> Phone</span>
            <span style={value}>{mainPhone}</span>
          </div>
        )}
        {cell && (
          <div style={row}>
            <span style={label}><Ico name="mobile" size={13} color={C.muted} /> Cell</span>
            <span style={value}>{cell}</span>
          </div>
        )}
        {address.length > 0 && (
          <div style={row}>
            <span style={label}><Ico name="home" size={13} color={C.muted} /> Address</span>
            <span style={value}>{address.map((l, i) => <span key={i} style={{ display: 'block' }}>{l}</span>)}</span>
          </div>
        )}
        {!profile.email && !mainPhone && !cell && address.length === 0 && (
          <p style={{ fontSize: 14, color: C.muted }}>No contact information on file.</p>
        )}
      </Card>

      {/* Preferences */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          Preferences
        </div>
        {profile.preferred_language && (
          <div style={row}>
            <span style={label}>Preferred language</span>
            <span style={value}>{profile.preferred_language}</span>
          </div>
        )}
        {profile.interpreter_needed && (
          <div style={row}>
            <span style={label}>Interpreter</span>
            <span style={value}>Needed</span>
          </div>
        )}
        {!profile.preferred_language && !profile.interpreter_needed && (
          <p style={{ fontSize: 14, color: C.muted }}>No preferences on file.</p>
        )}
      </Card>

      {/* Request correction */}
      <div style={{
        background: `${C.subtle}22`, border: `1px solid ${C.subtle}44`,
        borderRadius: 14, padding: '16px 20px',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <Ico name="alert" size={18} color={C.muted} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.muted, marginBottom: 4 }}>Need to correct something?</div>
          <div style={{ fontSize: 13, color: C.subtle, lineHeight: 1.5 }}>
            Demographic information is managed by your care team. If you spot an error, send a message to your care team and they can update it.
          </div>
        </div>
      </div>
    </div>
  )
}
