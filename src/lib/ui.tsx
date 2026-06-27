import { useState, useEffect } from 'react'
import { useT, LANGS } from './i18n'

export const C = {
  navy950: '#020a14', navy900: '#060e1c', navy800: '#0a1628', navy700: '#0f2040', navy600: '#152b55',
  gold: '#c9a96e', cyan: '#00d4ff', mint: '#34d399', mintDk: '#1f9e8f',
  text: '#e8eaf0', muted: '#8a9bc0', subtle: '#3a4a6a',
  green: '#4ade80', amber: '#fbbf24', red: '#ff6b6b', violet: '#8b7cff',
}

// Per-section accent palette (gives each screen its own colour identity)
export const ACCENTS: Record<string, { c: string; from: string; to: string }> = {
  today:      { c: C.mint,   from: '#34d399', to: '#00d4ff' },
  medications:{ c: C.cyan,   from: '#00d4ff', to: '#3b82f6' },
  diet:       { c: C.amber,  from: '#fbbf24', to: '#f59e0b' },
  exercise:   { c: C.violet, from: '#8b7cff', to: '#6366f1' },
  vitals:     { c: C.red,    from: '#ff6b6b', to: '#ec4899' },
  journal:    { c: C.gold,   from: '#c9a96e', to: '#e8cc9a' },
  messages:   { c: C.cyan,   from: '#00d4ff', to: '#34d399' },
  progress:   { c: C.gold,   from: '#c9a96e', to: '#00d4ff' },
  treatment:  { c: C.mint,   from: '#34d399', to: '#1f9e8f' },
  'companion-mobile': { c: C.cyan, from: '#00d4ff', to: '#34d399' },
  admin:      { c: C.gold,  from: '#c9a96e', to: '#e8cc9a' },
  selfchart:  { c: C.cyan,  from: '#00d4ff', to: '#c9a96e' },
  billing: { c: C.green, from: '#4ade80', to: '#1f9e8f' },
}

export function PMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs><linearGradient id="cmg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#0097A7" /><stop offset="1" stopColor="#4DB6E5" />
      </linearGradient></defs>
      <path d="M24 14 H54 C70 14 80 25 80 37 C80 49 70 60 54 60 H40 V86 H24 Z M40 28 H53 C61 28 65 32 65 37 C65 42 61 46 53 46 H40 Z"
        fill="url(#cmg)" fillRule="evenodd" stroke="#D4AF37" strokeWidth="1" />
      <g stroke="#D4AF37" strokeWidth="1.5" opacity="0.95">
        <line x1="32" y1="26" x2="45" y2="38" /><line x1="54" y1="20" x2="45" y2="38" />
        <line x1="70" y1="37" x2="45" y2="38" /><line x1="54" y1="54" x2="45" y2="38" />
        <line x1="32" y1="60" x2="45" y2="38" /><line x1="54" y1="20" x2="70" y2="37" />
      </g>
      <circle cx="32" cy="26" r="3" fill="#fff" /><circle cx="54" cy="20" r="3" fill="#fff" />
      <circle cx="70" cy="37" r="3" fill="#fff" /><circle cx="54" cy="54" r="3" fill="#fff" />
      <circle cx="32" cy="60" r="3" fill="#fff" /><circle cx="45" cy="38" r="4.4" fill="#D4AF37" />
    </svg>
  )
}

export function Ico({ name, size = 22, color = 'currentColor', stroke = 1.7 }:
  { name: string; size?: number; color?: string; stroke?: number }) {
  const p: Record<string, JSX.Element> = {
    today: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    pill: <><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(45 12 12)" /><path d="M8.5 8.5l7 7" /></>,
    diet: <><path d="M7 3v8a3 3 0 0 0 6 0V3M10 3v18" /><path d="M17 3c-1.5 1-2 3-2 6s.5 4 2 4v8" /></>,
    exercise: <><path d="M6 8v8M18 8v8M4 10v4M20 10v4M6 12h12" /></>,
    vitals: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>,
    journal: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    plan: <><path d="M9 4h6v3H9z" /><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 12l2 2 4-4" /></>,
    check: <polyline points="4 12 9 17 20 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    chevron: <path d="M9 6l6 6-6 6" />,
    lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    watch: <><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 3h6M9 21h6M12 9v3l2 1" /></>,
    ai: <><circle cx="12" cy="12" r="4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
    alert: <><path d="M12 3 2 20h20Z" /><path d="M12 9v5M12 17h.01" /></>,
    heart: <path d="M12 20s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5c-2.5 4.5-9.5 9-9.5 9Z" />,
    leaf: <><path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 12-4 16-9 16Z" /><path d="M8 16c4-4 6-6 10-8" /></>,
    message: <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
    sparkle: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
    shield: <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    send: <path d="M4 12l16-7-7 16-2-7z" />,
    mobile: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM17 17h3M14 20h3M20 14v3" /></>,
    device: <><path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0M2 12a10 10 0 0 1 20 0" /><circle cx="12" cy="12" r="1" /></>,
    flask: <path d="M9 3h6M9 3v5.5L5 15a2 2 0 0 0 1.76 3h10.48A2 2 0 0 0 19 15l-4-6.5V3" />,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    revoke: <><path d="M18 6 6 18M6 6l12 12" /><circle cx="12" cy="12" r="9" /></>,
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    refresh: <path d="M23 4v6h-6M1 20v-6h6M3.5 9A9 9 0 0 1 20.5 9M20.5 15A9 9 0 0 1 3.5 15" />,
    billing: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]}</svg>
  )
}

// Richer card — subtle gradient, depth, optional accent edge
export function Card({ children, accent, style }:
  { children: React.ReactNode; accent?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: `linear-gradient(160deg, ${C.navy800}, ${C.navy900})`,
      border: `1px solid ${accent ? accent + '38' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 18, padding: 22,
      boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
      ...(accent ? { borderTop: `2px solid ${accent}` } : null),
      ...style,
    }}>{children}</div>
  )
}

// Coloured icon chip + title (section header)
export function SectionHeader({ icon, title, sub, color = C.mint }:
  { icon: string; title: string; sub?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
      <div style={{
        width: 46, height: 46, borderRadius: 13, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: `linear-gradient(150deg, ${color}26, ${color}0d)`, border: `1px solid ${color}40`,
      }}>
        <Ico name={icon} size={22} color={color} />
      </div>
      <div>
        <h1 style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 26, lineHeight: 1.1, color: C.text, margin: 0 }}>{title}</h1>
        {sub && <div style={{ fontSize: 13.5, color: C.muted, marginTop: 3, maxWidth: 560 }}>{sub}</div>}
      </div>
    </div>
  )
}

// Colourful gradient stat tile
export function GradientStat({ icon, label, value, from, to }:
  { icon: string; label: string; value: React.ReactNode; from: string; to: string }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', borderRadius: 16, padding: 18,
      background: `linear-gradient(150deg, ${from}26, ${to}10)`, border: `1px solid ${from}33`,
    }}>
      <div style={{ position: 'absolute', right: -16, top: -16, width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle, ${from}33, transparent 70%)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ico name={icon} size={16} color={from} />
        <span style={{ fontSize: 11.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: 'DM Mono,monospace' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 26, color: C.text, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

// Gradient hero wrapper with soft glow
export function Hero({ children, from = '#34d399', to = '#00d4ff', style }:
  { children: React.ReactNode; from?: string; to?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden', borderRadius: 22, padding: 26,
      background: `linear-gradient(135deg, ${C.navy700}, ${C.navy900} 60%)`,
      border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 44px rgba(0,0,0,0.35)', ...style,
    }}>
      <div style={{ position: 'absolute', right: -60, top: -60, width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, ${from}2e, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: -40, bottom: -70, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, ${to}24, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  )
}

export function Button({ children, onClick, kind = 'primary', style, type }:
  { children: React.ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost'; style?: React.CSSProperties; type?: 'button' | 'submit' }) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 22px', borderRadius: 11,
    fontSize: 15, fontWeight: 600, fontFamily: 'Rajdhani,sans-serif', letterSpacing: '.02em', cursor: 'pointer', border: 'none',
  }
  const styles = kind === 'primary'
    ? { ...base, background: `linear-gradient(135deg, ${C.mint}, ${C.mintDk})`, color: C.navy950, boxShadow: `0 8px 20px ${C.mint}33` }
    : { ...base, background: 'transparent', color: C.text, border: `1px solid ${C.subtle}` }
  return <button type={type} onClick={onClick} style={{ ...styles, ...style }}>{children}</button>
}

export function LanguageSwitcher() {
  const { lang, setLang } = useT()
  return (
    <div style={{ display: 'flex', gap: 4, background: C.navy900, borderRadius: 9, padding: 3, border: `1px solid ${C.subtle}` }}>
      {LANGS.map(l => (
        <button key={l.code} onClick={() => setLang(l.code)} style={{
          border: 'none', cursor: 'pointer', borderRadius: 7, padding: '4px 9px', fontSize: 11.5, fontWeight: 700,
          fontFamily: 'DM Mono,monospace',
          background: lang === l.code ? C.mint : 'transparent', color: lang === l.code ? C.navy950 : C.muted,
        }}>{l.label}</button>
      ))}
    </div>
  )
}

export function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T : initial } catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ } }, [key, val])
  return [val, setVal]
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'DM Sans,sans-serif', width: '100%', ...(props.style || {}) }} />
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div style={{ color: C.muted, fontSize: 14, padding: '14px 0' }}>{label}</div>
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let on = true; setLoading(true); setError(null)
    fn().then(d => { if (on) { setData(d); setLoading(false) } })
        .catch(e => { if (on) { setError(e?.message || 'Error'); setLoading(false) } })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  return { data, loading, error, reload: () => setN(x => x + 1) }
}
