// Supabase Edge Function: companion-translate
// Translates patient-facing clinical text (EN → ES/FR) with a DB-backed cache.
// English stays canonical in the source columns; only translated versions are stored here.
//
// Allowed source tables / columns (whitelist prevents arbitrary column reads):
//   care_plan              → plain_language
//   companion_medication   → instructions
//   companion_education    → question, ai_answer

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MODEL = 'claude-sonnet-4-6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED: Record<string, string[]> = {
  care_plan:             ['plain_language'],
  companion_medication:  ['instructions'],
  companion_education:   ['question', 'ai_answer'],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS, status: 204 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  let body: { source_table: string; source_id: string; source_column: string; target_lang: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { source_table, source_id, source_column, target_lang } = body

  // Validate inputs
  const allowed = ALLOWED[source_table]
  if (!allowed || !allowed.includes(source_column)) {
    return json({ error: 'source_table/source_column not permitted' }, 403)
  }
  if (!['es', 'fr'].includes(target_lang)) {
    return json({ error: 'target_lang must be es or fr' }, 400)
  }
  if (!source_id) return json({ error: 'source_id required' }, 400)

  const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_ANON_KEY        = Deno.env.get('SUPABASE_ANON_KEY')!
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANTHROPIC_API_KEY        = Deno.env.get('PATIENTTRAC_EMR_API')

  // User-scoped client: reads are RLS-gated to this patient's data
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  // Service-role client: cache reads/writes bypass RLS
  const svcClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Fetch the English source row (RLS-scoped — fails if patient doesn't own it)
  const { data: srcRow, error: srcErr } = await userClient
    .schema('cr')
    .from(source_table)
    .select(`${source_column}, patient_id, org_id`)
    .eq('id', source_id)
    .maybeSingle()

  if (srcErr || !srcRow) return json({ error: 'Source row not found' }, 404)

  const sourceText: string = srcRow[source_column] ?? ''
  if (!sourceText.trim()) return json({ translated_text: '', is_machine_translated: false, reviewed_by: null })

  // 2. SHA-256 hash of the English source text (for stale-cache detection)
  const encoded = new TextEncoder().encode(sourceText)
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded)
  const sourceHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

  // 3. Cache lookup
  const { data: cached } = await svcClient
    .schema('cr')
    .from('companion_translation')
    .select('translated_text, source_hash, is_machine_translated, reviewed_by')
    .eq('source_table', source_table)
    .eq('source_id', source_id)
    .eq('source_column', source_column)
    .eq('target_lang', target_lang)
    .maybeSingle()

  if (cached && cached.source_hash === sourceHash) {
    return json({
      translated_text: cached.translated_text,
      is_machine_translated: cached.is_machine_translated,
      reviewed_by: cached.reviewed_by,
    })
  }

  // 4. On cache miss or stale hash — translate via Claude
  if (!ANTHROPIC_API_KEY) return json({ error: 'Translation service unavailable' }, 503)

  const langName = target_lang === 'es' ? 'Spanish' : 'French'
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: [
        `You are a medical translator. Translate the following patient-facing clinical text from English to ${langName}.`,
        'Preserve the exact clinical meaning. Add nothing, remove nothing.',
        'Use a warm, plain-language, patient-friendly register.',
        'Output the translation only — no preamble, no explanation.',
      ].join(' '),
      messages: [{ role: 'user', content: sourceText }],
    }),
  })

  if (!claudeRes.ok) {
    console.error('Anthropic error:', claudeRes.status, await claudeRes.text())
    return json({ error: 'Translation failed' }, 502)
  }

  const claudeData = await claudeRes.json()
  const translatedText: string = claudeData.content[0].text.trim()

  // 5. Upsert into cache (on conflict: update text/hash/model, clear review fields)
  const { error: upsertErr } = await svcClient
    .schema('cr')
    .from('companion_translation')
    .upsert({
      org_id:              srcRow.org_id,
      patient_id:          srcRow.patient_id,
      source_table,
      source_id,
      source_column,
      target_lang,
      source_hash:         sourceHash,
      translated_text:     translatedText,
      model:               MODEL,
      is_machine_translated: true,
      reviewed_by:         null,
      reviewed_at:         null,
    }, { onConflict: 'source_table,source_id,source_column,target_lang' })

  if (upsertErr) console.error('Cache upsert error:', upsertErr)

  return json({ translated_text: translatedText, is_machine_translated: true, reviewed_by: null })
})
