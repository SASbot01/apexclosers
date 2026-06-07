// /api/recall — endpoints Recall.ai (action-routed), POR USUARIO.
//
// Adaptado de Apex Operations a este producto: scope por `user_id` (no
// client_id), tabla `calls`, sin sync a CRM/sales. Conserva lo esencial del
// closer: grabar → transcribir → resumen + FEEDBACK (Claude). Aislamiento por
// user_id en cada query (ver docs/ai/07).
//
// Acciones (?action=...):
//   POST start      Body { userId, meetingUrl, title? }  → bot ad-hoc inmediato
//   POST webhook    Body payload Recall (status_change / transcript.data / done)
//   POST finalize   ?botId=…   → transcript final + resumen + feedback + outcome
//   GET  list       ?userId=…  → llamadas del usuario
//   GET  get        ?id=… &userId=…  → detalle de una llamada
//   POST reconcile  ?botId=…   → destraba (status real desde Recall)
//
// El webhook hace lookup por bot_id (global), no necesita userId.

import Anthropic from '@anthropic-ai/sdk'
import crypto from 'crypto'
import { supabase, supabaseReady } from './_lib/supabase.js'
import {
  createBot, getBotRaw, getBotTranscript, getRecordingUrl,
  parseRecallSegments, recallReady, deriveStatus, leaveBot,
  nameFromEmail, participantSpeaker, getSpeakerTimeline, assignSpeakers,
} from './_lib/recall.js'
import { localChat, localLLMReady } from './_lib/localLLM.js'
import { transcribeUrl, localSttReady } from './_lib/localStt.js'

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

const SUMMARY_MODEL = 'claude-sonnet-4-6'
const newShareToken = () => crypto.randomBytes(16).toString('hex')

// Nombre del host (el closer dueño de la call) a partir de su Gmail conectado.
// Cacheado por user_id para no consultar users en cada chunk del webhook.
const _hostNameCache = new Map()
async function hostNameFor(userId) {
  if (!userId) return null
  if (_hostNameCache.has(userId)) return _hostNameCache.get(userId)
  let name = null
  try {
    const { data: u } = await supabase.from('users').select('email, name').eq('id', userId).maybeSingle()
    name = nameFromEmail(u?.email) || (u?.name ? String(u.name).trim().split(/\s+/)[0] : null) || null
  } catch { /* sin user → host genérico */ }
  _hostNameCache.set(userId, name)
  return name
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action
  try {
    switch (action) {
      case 'start':     return startAdHoc(req, res)
      case 'webhook':   return handleWebhook(req, res)
      case 'finalize':  return finalize(req, res)
      case 'list':      return listCalls(req, res)
      case 'get':       return getCall(req, res)
      case 'reconcile': return reconcileBot(req, res)
      case 'reconcile-stuck': return reconcileStuck(req, res)
      default:          return res.status(400).json({ error: `unknown_action: ${action}` })
    }
  } catch (e) {
    console.error('[recall]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

// ── start (ad-hoc) ───────────────────────────────────────────────────────
async function startAdHoc(req, res) {
  const { userId, meetingUrl, title } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!meetingUrl) return res.status(400).json({ error: 'meeting_url_required' })
  if (!recallReady()) return res.status(500).json({ error: 'recall_not_configured' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })

  const bot = await createBot({ meetingUrl, metadata: { user_id: userId, source: 'ad_hoc' } })
  await supabase.from('calls').upsert({
    user_id:     userId,
    bot_id:      bot.id,
    meeting_url: meetingUrl,
    platform:    bot.meeting_url?.platform || null,
    meeting_id:  bot.meeting_url?.meeting_id || null,
    title:       title || null,
    status:      'joining',
    started_at:  new Date().toISOString(),
    share_token: newShareToken(),
  }, { onConflict: 'bot_id' })

  return res.status(200).json({ ok: true, botId: bot.id, platform: bot.meeting_url?.platform })
}

// ── webhook ──────────────────────────────────────────────────────────────
async function handleWebhook(req, res) {
  const body = req.body || {}
  const event = body.event
  const data  = body.data || {}
  const botId = data.bot_id || data.id
  if (!botId) return res.status(200).json({ ok: true, ignored: 'no_bot_id' })

  const { data: row } = await supabase
    .from('calls').select('id, user_id, raw_webhook_events, transcript')
    .eq('bot_id', botId).maybeSingle()
  if (!row) return res.status(200).json({ ok: true, ignored: 'bot_not_found' })

  const patch = {}
  const events = Array.isArray(row.raw_webhook_events) ? [...row.raw_webhook_events] : []
  events.push({ event, at: new Date().toISOString() })
  if (events.length > 50) events.splice(0, events.length - 50)
  patch.raw_webhook_events = events

  if (event === 'bot.status_change') {
    patch.status = data?.status?.code || 'scheduled'
    if (patch.status === 'in_call_recording') patch.started_at = patch.started_at || new Date().toISOString()
  }
  if (event === 'transcript.data') {
    const words = data?.data?.words || []
    const hostName = await hostNameFor(row.user_id)
    const speaker = participantSpeaker(data?.data?.participant, hostName)
    if (words.length > 0) {
      const text = words.map(w => w.text).join(' ')
      const startMs = (words[0]?.start_timestamp?.relative ?? 0) * 1000
      const endMs   = (words[words.length - 1]?.end_timestamp?.relative ?? 0) * 1000
      const transcript = Array.isArray(row.transcript) ? [...row.transcript] : []
      transcript.push({ speaker, text, startMs, endMs })
      patch.transcript = transcript
    }
  }
  if (event === 'bot.done') {
    patch.status = 'done'
    patch.ended_at = new Date().toISOString()
    const base = process.env.APEX_PUBLIC_BASE_URL || ''
    if (base && !base.includes('localhost')) {
      fetch(`${base}/api/recall?action=finalize&botId=${botId}`, { method: 'POST' }).catch(() => null)
    }
  }

  await supabase.from('calls').update(patch).eq('id', row.id)
  return res.status(200).json({ ok: true })
}

// ── finalize ───────────────────────────────────────────────────────────
// Descarga transcript final + genera RESUMEN + FEEDBACK + outcome (Claude).
// El feedback al dueño/closer es el diferenciador del producto (docs/ai/01).
async function finalize(req, res) {
  const botId = req.query.botId
  if (!botId) return res.status(400).json({ error: 'botId_required' })

  const { data: row } = await supabase.from('calls').select('*').eq('bot_id', botId).maybeSingle()
  if (!row) return res.status(404).json({ error: 'call_not_found' })
  if (row.summary && row.outcome) return res.status(200).json({ ok: true, alreadyProcessed: true })

  let transcript = Array.isArray(row.transcript) ? row.transcript : []
  let recordingUrl = row.recording_url
  if (recallReady()) {
    try { recordingUrl = (await getRecordingUrl(botId)) || recordingUrl } catch { /* best-effort */ }
  }

  // Nombre del host (Gmail conectado) para etiquetar la transcripción.
  const hostName = await hostNameFor(row.user_id)

  // Transcripción: preferimos STT LOCAL (Whisper) sobre el audio grabado por
  // Recall. Si el STT local no está activo, caemos a la transcripción de Recall.
  // En ambos casos atribuimos interlocutor: host (Gmail) vs "Cliente" cruzando
  // con la speaker timeline de Recall (metadato gratis, sin coste de transcripción).
  if (localSttReady() && recordingUrl) {
    try {
      const segments = await transcribeUrl(recordingUrl)
      if (segments.length > 0) {
        const timeline = await getSpeakerTimeline(botId)
        transcript = assignSpeakers(segments, timeline, hostName)
      }
    } catch (e) { console.error('[finalize] local STT failed', e.message) }
  } else if (recallReady()) {
    try {
      const segments = await getBotTranscript(botId)
      if (segments.length > 0) transcript = parseRecallSegments(segments, hostName)
    } catch { /* sigue con lo que haya */ }
  }
  const transcriptText = transcript.map(s => `${s.speaker}: ${s.text}`).join('\n')

  // Prompts compartidos por la ruta local (Ollama) y la ruta Anthropic.
  const SUMMARY_SYSTEM = `Eres un asistente de ventas senior. Acabas de analizar una call de tu closer. Escribe en español, primera persona, voz cálida y directa.

Genera dos bloques separados por una línea con tres guiones (---):

BLOQUE 1 — RESUMEN (markdown):
- Encabezado "## Resumen"
- 3-4 frases con lo esencial
- Sección "## Puntos clave" con bullets
- Sección "## Próximo paso" con la acción concreta

BLOQUE 2 — FEEDBACK (markdown):
- Encabezado "## Lo que vi"
- 2-3 puntos fuertes del closer
- 2-3 cosas para mejorar
- 1 frase concreta para la próxima call

Sin emojis. Sin exclamaciones. Tono de socio con 15 años de oficio.`
  const OUTCOME_SYSTEM = `Eres un analista de ventas. Lee la transcripción y devuelve SOLO un JSON válido (sin markdown) con esta forma:
{"outcome":"won"|"lost"|"follow_up"|"no_show"|"unknown","offer_made":boolean,"offer_amount":number|null,"deposit_collected":boolean,"deal_closed":boolean,"deal_amount":number|null,"next_step":"string corto en español","lead_summary":{"objetivos":"","bloqueos":"","compromiso":"","cualificacion":"","financiera":"","prioridad":"","decision":""}}
Importes en EUR como números. Si no hay info clara, null/false.
"lead_summary": cada campo es UNA frase corta en español (2-3 frases solo si hace falta) sobre el lead: objetivos (qué quiere), bloqueos (qué le frena), compromiso (su disposición), cualificacion (si encaja), financiera (capacidad/presupuesto), prioridad (cuán urgente), decision (si es el decisor).`

  const useLocalLLM = localLLMReady()
  const hasText = transcriptText.trim().length > 50

  // Resumen + feedback (markdown, separados por ---)
  let summary = null, feedback = null
  if (hasText && (useLocalLLM || anthropic)) {
    try {
      const userMsg = `Transcripción:\n\n${transcriptText.slice(0, 30000)}`
      let text
      if (useLocalLLM) {
        text = await localChat({ system: SUMMARY_SYSTEM, user: userMsg, maxTokens: 2000 })
      } else {
        const r = await anthropic.messages.create({
          model: SUMMARY_MODEL, max_tokens: 2000, system: SUMMARY_SYSTEM,
          messages: [{ role: 'user', content: userMsg }],
        })
        text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
      }
      const parts = text.split(/\n-{3,}\n/)
      summary  = parts[0]?.trim() || null
      feedback = parts[1]?.trim() || null
    } catch (e) { console.error('[finalize] summary failed', e.message) }
  }

  // Outcome estructurado (JSON)
  let outcomeData = null
  if (hasText && (useLocalLLM || anthropic)) {
    try {
      const userMsg = transcriptText.slice(0, 30000)
      let text
      if (useLocalLLM) {
        text = await localChat({ system: OUTCOME_SYSTEM, user: userMsg, maxTokens: 800, json: true })
      } else {
        const r = await anthropic.messages.create({
          model: SUMMARY_MODEL, max_tokens: 800, system: OUTCOME_SYSTEM,
          messages: [{ role: 'user', content: userMsg }],
        })
        text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
      }
      const m = text.match(/\{[\s\S]*\}/)
      if (m) outcomeData = JSON.parse(m[0])
    } catch (e) { console.error('[finalize] extraction failed', e.message) }
  }

  await supabase.from('calls').update({
    transcript,
    recording_url:     recordingUrl || null,
    summary,
    feedback,
    outcome:           outcomeData?.outcome || 'unknown',
    offer_made:        !!outcomeData?.offer_made,
    offer_amount:      outcomeData?.offer_amount ?? null,
    deposit_collected: !!outcomeData?.deposit_collected,
    deal_closed:       !!outcomeData?.deal_closed,
    deal_amount:       outcomeData?.deal_amount ?? null,
    next_step:         outcomeData?.next_step || null,
    lead_summary:      outcomeData?.lead_summary || null,
    status: 'done',
    ended_at: row.ended_at || new Date().toISOString(),
  }).eq('id', row.id)

  return res.status(200).json({ ok: true, botId, hasSummary: !!summary, outcome: outcomeData?.outcome })
}

// ── list ───────────────────────────────────────────────────────────────
async function listCalls(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data } = await supabase
    .from('calls')
    .select('id, bot_id, title, status, platform, scheduled_at, started_at, ended_at, outcome, summary, next_step, transcript')
    .eq('user_id', userId)
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(200)
  // No mandamos la transcripción completa en la lista; solo si tiene (bool).
  const calls = (data || []).map(({ transcript, ...c }) => ({
    ...c,
    has_transcript: Array.isArray(transcript) && transcript.length > 0,
  }))
  return res.status(200).json({ calls })
}

// ── get ──────────────────────────────────────────────────────────────────
async function getCall(req, res) {
  const { id, userId } = req.query
  if (!id) return res.status(400).json({ error: 'id_required' })
  let q = supabase.from('calls').select('*').eq('id', id)
  if (userId) q = q.eq('user_id', userId)   // aislamiento por usuario
  const { data } = await q.maybeSingle()
  if (!data) return res.status(404).json({ error: 'not_found' })
  return res.status(200).json(data)
}

// ── reconcile (manual / cron) ──────────────────────────────────────────
async function reconcileBot(req, res) {
  const botId = req.query.botId
  if (!botId) return res.status(400).json({ error: 'botId_required' })
  if (!recallReady()) return res.status(500).json({ error: 'recall_not_configured' })

  const bot = await getBotRaw(botId).catch(e => ({ _error: e.message }))
  if (bot?._error) return res.status(502).json({ error: 'recall_unreachable', detail: bot._error })

  const realStatus = deriveStatus(bot)
  const patch = { status: realStatus }
  const codes = (bot.status_changes || []).map(c => c.code)
  if (codes.includes('done') || codes.includes('fatal') || codes.includes('call_ended_by_host')) {
    patch.ended_at = new Date().toISOString()
  }
  await supabase.from('calls').update(patch).eq('bot_id', botId)

  let finalized = false
  if (realStatus === 'done') {
    const base = process.env.APEX_PUBLIC_BASE_URL || `https://${req.headers.host}`
    fetch(`${base}/api/recall?action=finalize&botId=${botId}`, { method: 'POST' }).catch(() => null)
    finalized = true
  }
  return res.status(200).json({ ok: true, botId, realStatus, finalizeTriggered: finalized })
}

// ── reconcile-stuck (cron cada 5 min) ──────────────────────────────────
// Destraba calls con webhooks perdidos y limpia bots colgados (bug histórico
// de bots eternos). En curso >5 min → status real desde Recall; >4h → fuerza
// salida (leave_call).
const MAX_CALL_MS = 4 * 60 * 60 * 1000
async function reconcileStuck(req, res) {
  if (!recallReady()) return res.status(500).json({ error: 'recall_not_configured' })
  const now = Date.now()
  const base = process.env.APEX_PUBLIC_BASE_URL || `https://${req.headers.host}`
  const fireFinalize = botId => fetch(`${base}/api/recall?action=finalize&botId=${botId}`, { method: 'POST' }).catch(() => null)
  const results = []

  const { data: inCall } = await supabase
    .from('calls')
    .select('id, bot_id, status, started_at, created_at')
    .in('status', ['joining', 'in_call_recording', 'in_call_not_recording'])
    .limit(100)

  for (const row of (inCall || [])) {
    const refMs = new Date(row.started_at || row.created_at || now).getTime()
    if (now - refMs < 5 * 60 * 1000) continue // fresco: deja actuar al webhook
    try {
      const bot = await getBotRaw(row.bot_id)
      const realStatus = deriveStatus(bot)
      const codes = (bot.status_changes || []).map(c => c.code)
      const patch = { status: realStatus }
      if (codes.includes('done') || codes.includes('fatal')) {
        patch.ended_at = new Date().toISOString()
      } else if (realStatus.startsWith('in_call') && row.started_at && (now - new Date(row.started_at).getTime()) > MAX_CALL_MS) {
        try { await leaveBot(row.bot_id) } catch { /* best-effort */ }
        patch.status = 'done'
        patch.ended_at = new Date().toISOString()
      }
      await supabase.from('calls').update(patch).eq('id', row.id)
      if (patch.status === 'done') fireFinalize(row.bot_id)
      results.push({ botId: row.bot_id, newStatus: patch.status })
    } catch (e) {
      results.push({ botId: row.bot_id, error: e.message })
    }
  }
  return res.status(200).json({ ok: true, reconciled: results.length, results })
}
