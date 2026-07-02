// netlify/functions/companion-ai.ts
// Server-side proxy for Companion's education assistant (treatment / diet / exercise).
// Strict, non-diagnostic, non-prescriptive guardrails.
// ENV: ANTHROPIC_API_KEY (server-only), SUPABASE_URL, SUPABASE_ANON_KEY.
//
// AUTH (audit C1): requires a valid Supabase patient JWT. Previously this
// endpoint was unauthenticated — an open relay against the Anthropic key.
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!

const MAX_QUESTION_CHARS = 2000
const MAX_CONTEXT_CHARS = 8000

const BASE = `You are PatientTrac Companion's patient-education assistant.
You explain things in plain, calm, encouraging language so patients understand their care.

Hard rules — never break these:
- NEVER diagnose, interpret symptoms, or judge severity.
- NEVER prescribe or change anything: no medications, doses, specific diets, calorie or weight targets, or exercise programs beyond what the patient's clinician has already given them.
- Give only GENERAL, educational information, grounded in the provided care-plan context.
- For anything specific to this patient — symptoms, "is this right for me", worsening, dosing, side effects — direct them to their care team. For emergencies, tell them to call their local emergency number.
- Keep answers short (2-4 sentences), warm, jargon-free. If unsure, say so and point to the care team.`

const TOPIC: Record<string, string> = {
  treatment: 'Topic: the patient\'s care plan. Explain what it means and why it matters.',
  diet: 'Topic: nutrition, in general educational terms only. Do NOT create meal plans, calorie goals, restrictive diets, or weight targets. Encourage balanced, plan-appropriate eating and defer specifics to their care team or a registered dietitian.',
  exercise: 'Topic: movement and activity. Only reinforce the clinician/physical-therapy plan the patient already has. Do NOT invent new exercises, sets, reps, or intensity. Emphasize gentle, within-plan movement, stopping if pain increases, and checking with their physical therapist or care team.',
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

export const handler = async (event: { httpMethod: string; headers: Record<string, string>; body: string | null }) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' })

  // ── Require a valid Supabase session (patient JWT) ─────────────────────────
  const auth = event.headers.authorization || event.headers.Authorization || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return json(401, { error: 'unauthorized' })
  const token = auth.slice(7).trim()

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user) return json(401, { error: 'unauthorized' })

  try {
    const { topic, question, context, planSummary } = JSON.parse(event.body || '{}')
    if (typeof question !== 'string' || !question.trim()) return json(400, { error: 'bad_request' })
    if (question.length > MAX_QUESTION_CHARS) return json(400, { error: 'question_too_long' })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return json(500, { error: 'AI not configured' })

    const topicLine = TOPIC[topic as string] || TOPIC.treatment
    const rawCtx = typeof context === 'string' && context ? context
      : typeof planSummary === 'string' && planSummary ? planSummary : 'none provided'
    const ctx = rawCtx.slice(0, MAX_CONTEXT_CHARS)

    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `${BASE}\n\n${topicLine}`,
      messages: [{ role: 'user', content: `Care-plan context: ${ctx}\n\nPatient question: ${question}` }],
    })
    const text = msg.content.filter(b => b.type === 'text').map((b: any) => b.text).join('\n')
    return json(200, { text })
  } catch (e: any) {
    return json(500, { error: e?.message || 'error' })
  }
}
