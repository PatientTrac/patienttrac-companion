// Parse a scanned GS1 barcode (UDI) into its Application Identifiers.
// Handles GS1 DataMatrix / GS1-128 with FNC1 (GS, char 29) separators, and the
// human-readable "(01)…(10)…" form. Best-effort: unknown content is ignored so
// the form still auto-fills what it can and the user corrects the rest.

export type Udi = {
  di?: string         // (01) UDI-DI / GTIN
  lot?: string        // (10) batch / lot
  serial?: string     // (21) serial
  expiry?: string     // (17) expiration date, ISO YYYY-MM-DD
  production?: string  // (11) production date, ISO YYYY-MM-DD
  raw: string
}

const GS = String.fromCharCode(29)
const FIXED: Record<string, number> = { '01': 14, '11': 6, '17': 6, '15': 6, '16': 6 }

export function parseGs1(input: string): Udi {
  if (input.includes('(')) return parseParens(input)
  const s = input.replace(/^\][A-Za-z]\d?/, '') // strip symbology id (]d2, ]C1, …)
  const out: Udi = { raw: input }
  let i = 0
  while (i < s.length) {
    if (s[i] === GS) { i++; continue }
    const ai = s.substr(i, 2)
    if (!/^\d{2}$/.test(ai)) break // not an AI we understand — stop
    i += 2
    if (FIXED[ai] != null) {
      const val = s.substr(i, FIXED[ai]); i += FIXED[ai]
      assign(out, ai, val)
    } else {
      let j = s.indexOf(GS, i); if (j < 0) j = s.length
      assign(out, ai, s.substring(i, j)); i = j
    }
  }
  return out
}

function parseParens(input: string): Udi {
  const out: Udi = { raw: input }
  const re = /\((\d{2,4})\)([^(]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) assign(out, m[1], m[2].trim())
  return out
}

function assign(out: Udi, ai: string, val: string) {
  if (ai === '01') out.di = val
  else if (ai === '10') out.lot = val
  else if (ai === '21') out.serial = val
  else if (ai === '17') out.expiry = yymmdd(val)
  else if (ai === '11') out.production = yymmdd(val)
}

// GS1 date AIs are YYMMDD; DD "00" means "end of month" — normalize to the 1st.
function yymmdd(v: string): string {
  if (!/^\d{6}$/.test(v)) return v
  const yy = +v.slice(0, 2)
  const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy // GS1 century pivot
  return `${yyyy}-${v.slice(2, 4)}-${v.slice(4, 6) === '00' ? '01' : v.slice(4, 6)}`
}
