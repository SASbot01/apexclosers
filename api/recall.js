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
import {
  EXTRACTION_SYSTEM, normalizeExtraction, saleCashFor, factsLine,
  summarySystem, buildCoachingContext,
  SKILLS_SYSTEM, normalizeSkills, transcriptStats,
} from './_lib/callAnalysis.js'
import { notify, enqueueFollowUps } from './_lib/workflow.js'
import { indexCall } from './_lib/coachRag.js'
import { detectProject } from './_lib/projectDetector.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const useLocalLLM = localLLMReady()
  const hasText = transcriptText.trim().length > 50

  // Contexto de aprendizaje: patrón de las llamadas anteriores del closer (para
  // que el feedback mejore con el historial). Independiente de esta call.
  const coaching = await buildCoachingContext(row.user_id)

  // 1) EXTRACCIÓN comercial rica (JSON) — la base de la tabla de ventas.
  let outcomeData = null
  if (hasText && (useLocalLLM || anthropic)) {
    try {
      const userMsg = transcriptText.slice(0, 30000)
      let text
      if (useLocalLLM) {
        text = await localChat({ system: EXTRACTION_SYSTEM, user: userMsg, maxTokens: 1100, json: true })
      } else {
        const r = await anthropic.messages.create({
          model: SUMMARY_MODEL, max_tokens: 1100, system: EXTRACTION_SYSTEM,
          messages: [{ role: 'user', content: userMsg }],
        })
        text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
      }
      const m = text.match(/\{[\s\S]*\}/)
      if (m) outcomeData = normalizeExtraction(JSON.parse(m[0]))
    } catch (e) { console.error('[finalize] extraction failed', e.message) }
  }

  // 2) RESUMEN + FEEDBACK (markdown, separados por ---). Anclado en los HECHOS
  // ya extraídos (que no se los invente) y en el CONTEXTO del closer (aprende).
  let summary = null, feedback = null
  if (hasText && (useLocalLLM || anthropic)) {
    try {
      const facts = factsLine(outcomeData)
      const userMsg = `Transcripción:\n\n${transcriptText.slice(0, 30000)}${facts ? `\n\nHechos ya detectados (úsalos, no inventes cifras):\n${facts}` : ''}`
      const system = summarySystem(coaching)
      let text
      if (useLocalLLM) {
        text = await localChat({ system, user: userMsg, maxTokens: 2000 })
      } else {
        const r = await anthropic.messages.create({
          model: SUMMARY_MODEL, max_tokens: 2000, system,
          messages: [{ role: 'user', content: userMsg }],
        })
        text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
      }
      const parts = text.split(/\n-{3,}\n/)
      summary  = parts[0]?.trim() || null
      feedback = parts[1]?.trim() || null
    } catch (e) { console.error('[finalize] summary failed', e.message) }
  }

  // 3) HABILIDADES (Workshop): puntúa al closer en las 6 fases + estilo. Se
  // cachea en calls.skills; el Workshop las agrega. Defensivo: si falla, null.
  let skills = null
  if (hasText && (useLocalLLM || anthropic)) {
    try {
      const userMsg = transcriptText.slice(0, 30000)
      let text
      if (useLocalLLM) {
        text = await localChat({ system: SKILLS_SYSTEM, user: userMsg, maxTokens: 400, json: true })
      } else {
        const r = await anthropic.messages.create({
          model: SUMMARY_MODEL, max_tokens: 400, system: SKILLS_SYSTEM,
          messages: [{ role: 'user', content: userMsg }],
        })
        text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
      }
      const m = text.match(/\{[\s\S]*\}/)
      if (m) skills = normalizeSkills(JSON.parse(m[0]))
    } catch (e) { console.error('[finalize] skills failed', e.message) }
    // Completa volumen/preguntas con lo medible de la transcripción.
    if (skills) {
      const st = transcriptStats(transcript)
      skills.words = st.words
      if (st.minutes) skills.minutes = Math.round(st.minutes * 10) / 10
      if (!skills.questions && st.questions) skills.questions = st.questions
    }
  }

  await supabase.from('calls').update({
    transcript,
    recording_url:     recordingUrl || null,
    summary,
    feedback,
    skills,
    outcome:           outcomeData?.outcome || 'unknown',
    offer_made:        !!outcomeData?.offer_made,
    offer_amount:      outcomeData?.offer_amount ?? null,
    deposit_collected: !!outcomeData?.deposit_collected,
    deal_closed:       !!outcomeData?.deal_closed,
    deal_amount:       outcomeData?.deal_amount ?? null,
    next_step:         outcomeData?.next_step || null,
    lead_summary:      outcomeData?.lead_summary || null,
    objections:        outcomeData?.objections || null,   // para el aprendizaje
    extraction:        outcomeData || null,                // extracción completa
    state:             outcomeData?.state || null,         // estado fino (flujo)
    status: 'done',
    started_at: row.started_at || row.scheduled_at || row.created_at || new Date().toISOString(),
    ended_at: row.ended_at || new Date().toISOString(),
  }).eq('id', row.id)

  // RAG: indexa esta llamada (resumen + feedback + transcripción) para que el
  // coach pueda recuperarla y CITARLA. Best-effort, no bloquea la respuesta.
  indexCall({ id: row.id, user_id: row.user_id, title: row.title, started_at: row.started_at || row.scheduled_at || row.created_at, transcript, summary, feedback }).catch(() => {})

  // 🧠 PROYECTO de la llamada (IA): si el closer lleva varios clientes, deduce a
  // cuál pertenece esta llamada (título + asistentes + cuenta + transcripción) y
  // lo fija en la llamada, la venta y el lead. Si ya venía marcado, se respeta.
  let projectKey = row.client_id || null
  try {
    if (!projectKey) {
      const det = await detectProject({ closerId: row.user_id, title: row.title, summary, transcript })
      if (det.key) {
        projectKey = det.key
        if (UUID_RE.test(projectKey)) await supabase.from('calls').update({ client_id: projectKey }).eq('id', row.id)
        if (row.calendar_event_id) await supabase.from('leads').update({ project: projectKey }).eq('owner_id', row.user_id).eq('calendar_event_id', row.calendar_event_id)
        console.log(`[finalize] proyecto detectado (${det.method}, conf ${det.confidence}): ${det.name}`)
      }
    }
  } catch (e) { console.error('[finalize] project detect failed', e.message) }

  // Si en la transcripción se CERRÓ una venta, la registramos en la TABLA DE
  // VENTAS como "pendiente" con TODOS los campos (producto, precio, método y tipo
  // de pago, cobrado…). NO cuenta en métricas hasta subir justificante y
  // verificarla (api/sales.js).
  let saleCreated = false
  // Creamos la venta si se cerró Y hay importe, O si el estado es de venta
  // (ganada/deposito) aunque el importe quede a 0 (editable luego en la tabla).
  const isSaleState = outcomeData?.state === 'ganada' || outcomeData?.state === 'deposito'
  if (outcomeData && (outcomeData.deal_closed || isSaleState)) {
    try {
      const saleRow = {
        owner_id:       row.user_id,
        client_id:      projectKey ?? row.client_id ?? null,   // proyecto detectado por IA
        call_id:        row.id,
        date:           row.ended_at || new Date().toISOString(),
        closer:         hostName || null,
        product:        outcomeData.product || row.title || 'Cierre en llamada',
        revenue:        Number(outcomeData.deal_amount) || 0,
        cash_collected: Number(saleCashFor(outcomeData)) || 0,
        payment_method: outcomeData.payment_method || null,
        payment_type:   outcomeData.payment_type || 'Pago único',
        source:         'transcription',
        status:         'pending',
        notes:          outcomeData.evidence || outcomeData.next_step || null,
      }
      // Sin onConflict (el índice de call_id es parcial): comprobar y luego
      // insertar o actualizar.
      const { data: existing } = await supabase.from('sales').select('id').eq('call_id', row.id).maybeSingle()
      if (existing) await supabase.from('sales').update(saleRow).eq('id', existing.id)
      else await supabase.from('sales').insert(saleRow)
      saleCreated = true
    } catch (e) { console.error('[finalize] sale insert failed', e.message) }
  }

  // Notificaciones + secuencias de seguimiento según el flujo de la captura:
  //  - Venta → notifica "confirma (sube justificante)".
  //  - No venta (follow_up/no_show/perdido/deposito) → dispara la secuencia
  //    activa de ese estado (crea las tareas de seguimiento que ejecuta el cron).
  if (outcomeData) {
    const st = outcomeData.state || 'unknown'
    try {
      if (saleCreated || st === 'ganada' || st === 'deposito') {
        await notify(row.user_id, {
          kind: 'sale_confirm',
          title: 'Confirma tu venta',
          body: `${outcomeData.product || row.title || 'Venta'} · ${outcomeData.deal_amount || ''} ${outcomeData.currency || 'EUR'}. Sube el justificante para que cuente en métricas.`,
          link: '/clientes',
        })
      }
      if (['follow_up_hot', 'follow_up_nurture', 'no_show', 'deposito', 'perdido'].includes(st)) {
        await enqueueFollowUps({ ownerId: row.user_id, callId: row.id, leadId: null, state: st, contact: null })
      }
    } catch (e) { console.error('[finalize] workflow failed', e.message) }
  }

  return res.status(200).json({ ok: true, botId, hasSummary: !!summary, outcome: outcomeData?.outcome, state: outcomeData?.state, saleCreated })
}

// ── list ───────────────────────────────────────────────────────────────
async function listCalls(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data } = await supabase
    .from('calls')
    .select('id, bot_id, title, status, platform, scheduled_at, started_at, ended_at, outcome, summary, next_step, transcript, recording_url, deal_amount')
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
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  // Aislamiento por usuario SIEMPRE: sin el filtro, pasar solo el id devolvía la
  // llamada de cualquiera (transcript + grabación). Ahora exige y filtra userId.
  const { data } = await supabase.from('calls').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!data) return res.status(404).json({ error: 'not_found' })
  // La URL de grabación de Recall es PREFIRMADA y CADUCA: la refrescamos bajo
  // demanda al abrir el detalle para que el vídeo siempre se vea (antes se
  // guardaba una URL que expiraba → vídeo en blanco).
  if (data.bot_id && data.status === 'done' && recallReady()) {
    try {
      const fresh = await getRecordingUrl(data.bot_id)
      if (fresh && fresh !== data.recording_url) {
        data.recording_url = fresh
        supabase.from('calls').update({ recording_url: fresh }).eq('id', data.id).then(() => {}, () => {})
      }
    } catch { /* deja la url que haya */ }
  }
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
