// netlify/functions/companion-ai.ts
// Server-side proxy for Companion's education assistant (treatment / diet / exercise).
// Strict, non-diagnostic, non-prescriptive guardrails. ENV: ANTHROPIC_API_KEY (server-only).
import Anthropic from '@anthropic-ai/sdk'

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

export const handler = async (event: { httpMethod: string; body: string | null }) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  try {
    const { topic, question, context, planSummary } = JSON.parse(event.body || '{}')
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'AI not configured' }) }
    const topicLine = TOPIC[topic as string] || TOPIC.treatment
    const ctx = context || planSummary || 'none provided'

    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `${BASE}\n\n${topicLine}`,
      messages: [{ role: 'user', content: `Care-plan context: ${ctx}\n\nPatient question: ${question}` }],
    })
    const text = msg.content.filter(b => b.type === 'text').map((b: any) => b.text).join('\n')
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || 'error' }) }
  }
}
