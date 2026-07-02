import { useSearchParams } from 'react-router-dom'
import { C, PMark } from '../lib/ui'

const card: React.CSSProperties = {
  background: `linear-gradient(180deg, ${C.navy900}, ${C.navy950})`,
  border: `1px solid rgba(255,255,255,0.07)`,
  borderRadius: 20,
  padding: '40px 32px',
  maxWidth: 440,
  width: '100%',
  textAlign: 'center' as const,
}

const primaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  width: '100%', padding: '14px 20px', borderRadius: 12,
  background: `linear-gradient(135deg, ${C.mint}, ${C.mintDk})`,
  color: C.navy950, fontWeight: 700, fontSize: 16,
  textDecoration: 'none', border: 'none', cursor: 'pointer',
  boxShadow: `0 4px 18px ${C.mint}44`,
}

const secondaryBtn: React.CSSProperties = {
  display: 'block', width: '100%', padding: '12px 20px', borderRadius: 12,
  border: `1px solid rgba(255,255,255,0.12)`,
  color: C.text, fontWeight: 600, fontSize: 14,
  textDecoration: 'none', textAlign: 'center' as const,
}

export default function Pair() {
  const [params] = useSearchParams()
  const code = params.get('code')

  const container: React.CSSProperties = {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
    background: C.navy950,
  }

  if (!code) {
    return (
      <div style={container}>
        <div style={card}>
          <PMark size={52} />
          <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: '20px 0 12px' }}>
            Invalid pairing link
          </h1>
          <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6 }}>
            This link is missing a pairing code. Ask your care team to generate a new invite.
          </p>
        </div>
      </div>
    )
  }

  const deepLink = `patienttraccompanion://pair?code=${encodeURIComponent(code)}`
  // Replace with the published App Store URL when the app is live
  const appStoreUrl = 'https://apps.apple.com/app/patienttrac-companion'

  return (
    <div style={container}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 28 }}>
          <PMark size={52} />
          <div style={{ textAlign: 'left' as const }}>
            <div style={{ fontFamily: 'Poppins,Rajdhani,sans-serif', fontWeight: 700, fontSize: 22, lineHeight: 1 }}>
              <span style={{ color: C.text }}>Patient</span><span style={{ color: C.gold }}>Trac</span>
            </div>
            <div style={{ fontSize: 13, color: C.mint, fontWeight: 600, marginTop: 3 }}>Companion</div>
          </div>
        </div>

        <h1 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>
          Pair this device
        </h1>
        <p style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.65, margin: '0 0 24px' }}>
          Open the PatientTrac Companion app to pair your iPhone. If the app isn't installed yet, download it from the App Store first.
        </p>

        <div style={{
          background: `rgba(255,255,255,0.04)`, border: `1px solid rgba(255,255,255,0.08)`,
          borderRadius: 12, padding: '14px 20px', marginBottom: 28,
          fontFamily: 'ui-monospace, monospace', fontSize: 16,
          color: C.mint, letterSpacing: 3, textAlign: 'center' as const,
        }}>
          {code}
        </div>

        <a href={deepLink} style={primaryBtn}>
          Open PatientTrac Companion
        </a>

        <p style={{ fontSize: 13, color: C.muted, margin: '22px 0 10px' }}>
          Don't have the app yet?
        </p>

        <a href={appStoreUrl} target="_blank" rel="noopener noreferrer" style={secondaryBtn}>
          Download from the App Store
        </a>

        <p style={{ fontSize: 11, color: C.subtle, marginTop: 28, lineHeight: 1.6 }}>
          This pairing link is single-use. If it has expired or already been used, ask your care team for a new invite.
        </p>
      </div>
    </div>
  )
}
