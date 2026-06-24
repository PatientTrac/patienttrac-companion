import { useState, useEffect } from 'react'

export const C = {
  navy950: '#020a14', navy900: '#060e1c', navy800: '#0a1628', navy700: '#0f2040',
  gold: '#c9a96e', cyan: '#00d4ff', mint: '#34d399', mintDk: '#1f9e8f',
  text: '#e8eaf0', muted: '#8a9bc0', subtle: '#3a4a6a',
  green: '#4ade80', amber: '#fbbf24', red: '#ff6b6b',
}

// Network-P brand mark (reversed for dark surfaces)
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
    journal: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    plan: <><path d="M9 4h6v3H9z" /><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 12l2 2 4-4" /></>,
    check: <polyline points="4 12 9 17 20 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    watch: <><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 3h6M9 21h6M12 9v3l2 1" /></>,
    ai: <><circle cx="12" cy="12" r="4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>,
    alert: <><path d="M12 3 2 20h20Z" /><path d="M12 9v5M12 17h.01" /></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]}</svg>
  )
}

export function Card({ children, accent, style }:
  { children: React.ReactNode; accent?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.navy800, border: `1px solid ${accent ? accent + '33' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 16, padding: 20, ...style,
    }}>{children}</div>
  )
}

export function Button({ children, onClick, kind = 'primary' }:
  { children: React.ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' }) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 10,
    fontSize: 15, fontWeight: 600, fontFamily: 'Rajdhani,sans-serif', letterSpacing: '.02em',
    cursor: 'pointer', border: 'none',
  }
  const styles = kind === 'primary'
    ? { ...base, background: C.mint, color: C.navy950 }
    : { ...base, background: 'transparent', color: C.text, border: `1px solid ${C.subtle}` }
  return <button onClick={onClick} style={styles}>{children}</button>
}

// Simple localStorage-backed state (Supabase swap-in point — see lib/data.ts)
export function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T : initial } catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ } }, [key, val])
  return [val, setVal]
}
