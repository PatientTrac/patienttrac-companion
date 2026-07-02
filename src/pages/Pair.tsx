// Pair.tsx — universal deep-link landing page for mobile pairing
// QR URL:    https://patienttraccompanion.com/pair?code=PT-XXXX-XXXX  (web, shown in browser)
// Deep link: patienttraccompanion://pair?code=PT-XXXX-XXXX           (fires native app)
//
// Strategy:
//   1. "Open app" button fires the custom URL scheme via window.location.href.
//   2. visibilitychange listener detects if iOS backgrounded the tab (= app opened).
//   3. 1.5 s timeout: if still visible, app isn't installed → show fallback with code copy.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { C, PMark } from '../lib/ui'

// ── Replace this placeholder before App Store submission ──────────────────────
// To find your App Store URL: App Store Connect → App → View on App Store → copy URL
const APP_STORE_URL = 'https://apps.apple.com/app/patienttrac-companion'

const card: React.CSSProperties = {
  background: `linear-gradient(180deg, ${C.navy900}, ${C.navy950})`,
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 20, padding: '40px 32px',
  maxWidth: 440, width: '100%', textAlign: 'center',
}

const primaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  width: '100%', padding: '14px 20px', borderRadius: 12,
  background: `linear-gradient(135deg, ${C.mint}, ${C.mintDk})`,
  color: C.navy950, fontWeight: 700, fontSize: 16,
  border: 'none', cursor: 'pointer', boxShadow: `0 4px 18px ${C.mint}44`,
}

const outlineBtn: React.CSSProperties = {
  display: 'block', width: '100%', padding: '12px 20px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.14)',
  color: C.text, fontWeight: 600, fontSize: 14,
  textDecoration: 'none', textAlign: 'center', background: 'none', cursor: 'pointer',
}

export default function Pair() {
  const [params] = useSearchParams()
  const code = params.get('code')
  const [appOpenFailed, setAppOpenFailed] = useState(false)
  const [copied, setCopied]               = useState(false)

  const container: React.CSSProperties = {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: 24, background: C.navy950,
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

  const openApp = () => {
    setAppOpenFailed(false)
    let appOpened = false

    const onVisibility = () => {
      if (document.hidden) appOpened = true
    }
    document.addEventListener('visibilitychange', onVisibility, { once: true })

    // Fire the custom URL scheme — iOS opens the app if installed
    window.location.href = deepLink

    // After 1.5 s: if the page is still visible, app didn't open
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (!appOpened && !document.hidden) setAppOpenFailed(true)
    }, 1500)
  }

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <div style={container}>
      <div style={card}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 28 }}>
          <PMark size={52} />
          <div style={{ textAlign: 'left' }}>
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
          Open the PatientTrac Companion app to pair your iPhone. If the app isn't installed yet,
          download it from the App Store first.
        </p>

        {/* Pairing code — visible at all times for manual entry fallback */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.mint}33`,
          borderRadius: 12, padding: '14px 20px', marginBottom: 8,
        }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Pairing code
          </div>
          <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 18, color: C.mint, letterSpacing: 3 }}>
            {code}
          </div>
        </div>

        {/* Copy code — always available */}
        <button onClick={copyCode} style={{ ...outlineBtn, marginBottom: 20, fontSize: 13, color: copied ? C.mint : C.muted }}>
          {copied ? '✓ Copied!' : 'Copy code'}
        </button>

        {/* Primary CTA */}
        <button onClick={openApp} style={primaryBtn}>
          Open PatientTrac Companion
        </button>

        {/* Failure state */}
        {appOpenFailed && (
          <div style={{
            marginTop: 18, padding: '14px 16px', borderRadius: 12,
            background: `${C.amber}18`, border: `1px solid ${C.amber}44`,
            textAlign: 'left',
          }}>
            <p style={{ color: C.amber, fontSize: 13.5, fontWeight: 600, margin: '0 0 6px' }}>
              App couldn't be opened
            </p>
            <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
              Make sure the app is installed, then open it and enter the code above manually,
              or tap "Open PatientTrac Companion" again.
            </p>
          </div>
        )}

        <p style={{ fontSize: 13, color: C.muted, margin: '22px 0 10px' }}>
          Don't have the app yet?
        </p>

        <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={outlineBtn}>
          Download from the App Store
        </a>

        <p style={{ fontSize: 11, color: C.subtle, marginTop: 28, lineHeight: 1.6 }}>
          This pairing link is single-use. If it has expired or already been used, ask your care team for a new invite.
        </p>
      </div>
    </div>
  )
}
