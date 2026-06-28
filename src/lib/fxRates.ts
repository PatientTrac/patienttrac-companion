// src/lib/fxRates.ts
// FX rate layer for billing display conversions.
// Rates are fetched from /api/companion-fx-rates (Netlify proxy → open.er-api.com, free tier).
// Cached in sessionStorage for 1 hour. All rates are expressed as units-per-1-USD.
// Conversion is display-only — the invoice's native currency is always the authoritative amount.

const CACHE_KEY = 'ptc.fxRates'
const CACHE_TTL_MS = 60 * 60 * 1000

export type RateMap = Record<string, number>

export const SUPPORTED_CURRENCIES: { code: string }[] = [
  { code: 'USD' },
  { code: 'EUR' },
  { code: 'GBP' },
  { code: 'CAD' },
  { code: 'COP' },
  { code: 'MXN' },
  { code: 'BRL' },
  { code: 'ARS' },
  { code: 'CLP' },
  { code: 'PEN' },
]

export const ALL_CURRENCY_CODES = SUPPORTED_CURRENCIES.map(c => c.code)

// Currencies formatted without decimal places
export const ZERO_DECIMAL = new Set(['COP', 'CLP', 'ARS', 'JPY', 'KRW'])

export async function fetchRates(): Promise<RateMap> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) {
      const { rates, ts } = JSON.parse(cached) as { rates: RateMap; ts: number }
      if (Date.now() - ts < CACHE_TTL_MS) return rates
    }
  } catch { /* private mode or stale JSON */ }

  const res = await fetch('/api/companion-fx-rates')
  if (!res.ok) throw new Error('FX rates unavailable')
  const json = await res.json() as { rates: RateMap }

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ rates: json.rates, ts: Date.now() }))
  } catch { /* ignore */ }

  return json.rates
}

/**
 * Convert `amount` from `from` currency to `to` currency.
 * Both rates are expressed as units-per-1-USD, so we go: from → USD → to.
 */
export function convert(amount: number, from: string, to: string, rates: RateMap): number {
  if (from === to) return amount
  const fromRate = rates[from] ?? 1
  const toRate = rates[to] ?? 1
  return (amount / fromRate) * toRate
}
