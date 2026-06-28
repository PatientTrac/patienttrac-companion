import type { Handler } from '@netlify/functions'

// Thin proxy to open.er-api.com (free tier, ~1500 req/month, no API key).
// Netlify CDN cache header saves most of those requests.
export const handler: Handler = async () => {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Upstream ${res.status}`)
    const json = await res.json() as { rates: Record<string, number>; time_last_update_utc: string }
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ rates: json.rates, updated: json.time_last_update_utc }),
    }
  } catch (err: any) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'FX rates temporarily unavailable', message: err?.message }),
    }
  }
}
