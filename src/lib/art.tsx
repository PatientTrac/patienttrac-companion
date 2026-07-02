// Offline-safe, brand-colored SVG illustrations.
// Themes: AI (network glow), patient care + recovery (care scene), vitality (pulse).

export function Glow({ color = '#34d399', size = 380, opacity = 0.22, style }:
  { color?: string; size?: number; opacity?: number; style?: React.CSSProperties }) {
  return (
    <div aria-hidden style={{
      position: 'absolute', width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle, ${color}, transparent 70%)`,
      opacity, filter: 'blur(8px)', pointerEvents: 'none', ...style,
    }} />
  )
}

// AI motif — a soft network of nodes/edges that gently pulses.
export function AiNetwork({ width = 220, height = 150, style }:
  { width?: number; height?: number; style?: React.CSSProperties }) {
  const nodes = [[30, 40], [80, 22], [128, 52], [60, 92], [110, 110], [170, 80], [196, 40]] as const
  const edges = [[0, 1], [1, 2], [0, 3], [2, 3], [3, 4], [2, 5], [5, 6], [4, 5], [1, 5]] as const
  return (
    <svg width={width} height={height} viewBox="0 0 220 150" fill="none" style={style} aria-hidden>
      <defs>
        <radialGradient id="ai-g" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#00d4ff" stopOpacity="0.18" /><stop offset="1" stopColor="#00d4ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="110" cy="70" r="80" fill="url(#ai-g)" />
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]}
          stroke="#34d399" strokeWidth="1" opacity="0.4" />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 2 ? 5 : 3.2} fill={i === 2 ? '#c9a96e' : '#00d4ff'} opacity="0.9">
          <animate attributeName="opacity" values="0.5;1;0.5" dur={`${2.5 + i * 0.3}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  )
}

// Patient care + recovery hero scene — supportive, warm, with a heart pulse and a growth sprout.
export function CareScene({ width = 300, height = 200, style }:
  { width?: number; height?: number; style?: React.CSSProperties }) {
  return (
    <svg width={width} height={height} viewBox="0 0 300 200" fill="none" style={style} aria-hidden>
      <defs>
        <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f2040" /><stop offset="1" stopColor="#0a1628" />
        </linearGradient>
        <linearGradient id="cs-heart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#00d4ff" />
        </linearGradient>
        <radialGradient id="cs-glow" cx="50%" cy="40%" r="55%">
          <stop offset="0" stopColor="#34d399" stopOpacity="0.25" /><stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="300" height="200" rx="18" fill="url(#cs-sky)" />
      <circle cx="150" cy="84" r="92" fill="url(#cs-glow)" />

      {/* network filaments (AI watching over care) */}
      <g stroke="#00d4ff" strokeWidth="0.8" opacity="0.35">
        <line x1="40" y1="40" x2="92" y2="78" /><line x1="260" y1="46" x2="208" y2="80" />
        <line x1="60" y1="150" x2="110" y2="120" /><line x1="240" y1="150" x2="190" y2="120" />
      </g>
      {[[40, 40], [260, 46], [60, 150], [240, 150]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill="#c9a96e">
          <animate attributeName="opacity" values="0.4;1;0.4" dur={`${3 + i}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* two cupped hands (care) */}
      <path d="M96 150 q-18 -6 -22 -26 q-2 -10 6 -12 q6 -1 8 8 l4 16" fill="#152b55" stroke="#1d3a6e" strokeWidth="1" />
      <path d="M204 150 q18 -6 22 -26 q2 -10 -6 -12 q-6 -1 -8 8 l-4 16" fill="#152b55" stroke="#1d3a6e" strokeWidth="1" />
      <path d="M96 150 q54 26 108 0 l0 6 q-54 28 -108 0 Z" fill="#0f2040" stroke="#1d3a6e" strokeWidth="1" />

      {/* heart with pulse (vitality) */}
      <path d="M150 78 c-10 -16 -34 -10 -34 8 c0 16 22 28 34 36 c12 -8 34 -20 34 -36 c0 -18 -24 -24 -34 -8 Z"
        fill="url(#cs-heart)" />
      <path d="M120 110 h14 l5 -12 6 22 5 -14 h24" fill="none" stroke="#060e1c" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />

      {/* recovery sprout */}
      <g stroke="#34d399" strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M150 150 v-12" />
        <path d="M150 142 q-9 -3 -11 -12 q9 1 11 9" fill="#34d399" opacity="0.85" stroke="none" />
        <path d="M150 144 q9 -3 11 -12 q-9 1 -11 9" fill="#1f9e8f" opacity="0.85" stroke="none" />
      </g>
    </svg>
  )
}

// Vitality pulse line (decorative footer/header accent)
export function Pulse({ width = 160, height = 28, color = '#34d399', style }:
  { width?: number; height?: number; color?: string; style?: React.CSSProperties }) {
  return (
    <svg width={width} height={height} viewBox="0 0 160 28" fill="none" style={style} aria-hidden>
      <path d="M0 14 h40 l8 -10 8 20 8 -16 6 12 h6 l6 -6 h72" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  )
}

// Full-bleed futuristic AI backdrop for hero panels — circuit traces with
// travelling data pulses, drifting nodes, and a receding perspective grid.
// Brand palette (mint/cyan/gold on deep navy); heaviest on the right so hero
// text on the left stays readable. Animations are SVG-native and disabled
// globally by the prefers-reduced-motion rule in index.css.
export function HeroCircuit({ style }: { style?: React.CSSProperties }) {
  const traces = [
    'M600 30 h90 l26 26 h140 l30 30 h114',
    'M640 78 h120 l22 22 h110 l26 26 h82',
    'M580 150 h70 l-20 20 h-90',
    'M700 190 h130 l24 -24 h146',
    'M660 236 h90 l20 20 h150',
  ]
  const nodes: [number, number, string][] = [
    [690, 30, '#00d4ff'], [856, 86, '#34d399'], [1000, 86, '#c9a96e'],
    [760, 78, '#34d399'], [1018, 126, '#00d4ff'], [650, 150, '#c9a96e'],
    [830, 190, '#00d4ff'], [1000, 166, '#34d399'], [750, 236, '#c9a96e'], [920, 256, '#00d4ff'],
  ]
  return (
    <svg viewBox="0 0 1100 300" preserveAspectRatio="xMidYMid slice" aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }}>
      <defs>
        <linearGradient id="hc-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#34d399" stopOpacity="0" />
          <stop offset="0.5" stopColor="#34d399" stopOpacity="0.55" />
          <stop offset="1" stopColor="#00d4ff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="hc-orb1" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#00d4ff" stopOpacity="0.16" /><stop offset="1" stopColor="#00d4ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hc-orb2" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#c9a96e" stopOpacity="0.13" /><stop offset="1" stopColor="#c9a96e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hc-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0a1628" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#0a1628" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ambient orbs */}
      <circle cx="920" cy="70" r="200" fill="url(#hc-orb1)" />
      <circle cx="700" cy="260" r="170" fill="url(#hc-orb2)" />

      {/* receding perspective grid (floor) */}
      <g stroke="#00d4ff" opacity="0.10">
        {[0, 1, 2, 3, 4].map(i => (
          <line key={`h${i}`} x1={380 - i * 60} y1={230 + i * 18} x2={1100} y2={230 + i * 18} strokeWidth={0.7 + i * 0.15} />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <line key={`v${i}`} x1={480 + i * 90} y1="300" x2={560 + i * 74} y2="222" strokeWidth="0.7" />
        ))}
      </g>

      {/* circuit traces with travelling pulses */}
      <g fill="none" strokeLinecap="round">
        {traces.map((d, i) => (
          <g key={i}>
            <path d={d} stroke="#34d399" strokeWidth="1" opacity="0.16" />
            <path d={d} stroke="url(#hc-beam)" strokeWidth="1.6" strokeDasharray="46 340" opacity="0.85">
              <animate attributeName="stroke-dashoffset" values="386;0" dur={`${5 + i * 1.3}s`} repeatCount="indefinite" />
            </path>
          </g>
        ))}
      </g>

      {/* junction nodes */}
      {nodes.map(([x, y, c], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="7" fill={c} opacity="0.12" />
          <circle cx={x} cy={y} r="2.4" fill={c} opacity="0.9">
            <animate attributeName="opacity" values="0.35;0.95;0.35" dur={`${2.6 + (i % 5) * 0.6}s`} repeatCount="indefinite" />
          </circle>
        </g>
      ))}

      {/* scan sweep */}
      <rect x="560" y="0" width="2" height="300" fill="#34d399" opacity="0.10">
        <animate attributeName="x" values="560;1080;560" dur="14s" repeatCount="indefinite" />
      </rect>

      {/* left fade so hero copy stays readable */}
      <rect x="0" y="0" width="760" height="300" fill="url(#hc-fade)" />
    </svg>
  )
}
