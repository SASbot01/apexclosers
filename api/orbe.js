// /api/orbe — el cerebro del Orbe (asistente IA flotante del shell), POR USUARIO.
//
// El Orbe hace tres cosas (lo que pidió el producto):
//   1) Te dice TODAS tus métricas (llamadas, show rate, ofertas, cierres, cash…).
//   2) Te dice QUÉ ESTÁ FALLANDO (los cuellos de botella de tu embudo).
//   3) Te GUÍA en las llamadas para cerrar mejor (consejos accionables).
//
// Corre sobre el LLM LOCAL (Ollama) si está activo; si no, cae a Anthropic. El
// contexto de métricas se calcula aquí desde Supabase (tabla calls + leads) y se
// inyecta en el prompt, así el modelo responde con datos reales del usuario.
//
// Acciones (?action=):
//   POST chat     Body { userId, messages:[{role,body}] }  → { reply, metrics }
//   GET  metrics  ?userId=                                  → { metrics }

import Anthropic from '@anthropic-ai/sdk'
import { supabase, supabaseReady } from './_lib/supabase.js'
import { localChat, localLLMReady } from './_lib/localLLM.js'

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null
const CHAT_MODEL = 'claude-sonnet-4-6'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || 'chat'
  try {
    if (action === 'chat')    return chat(req, res)
    if (action === 'metrics') return metricsEndpoint(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[orbe]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

// ── Métricas del usuario (desde calls + leads) ───────────────────────────
async function computeMetrics(userId) {
  if (!supabaseReady() || !userId) return null
  const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString()
  const [{ data: calls }, { data: leads }] = await Promise.all([
    supabase.from('calls')
      .select('status, outcome, offer_made, offer_amount, deposit_collected, deal_closed, deal_amount, next_step, started_at, scheduled_at, title')
      .eq('user_id', userId).gte('started_at', since).limit(1000),
    supabase.from('leads')
      .select('stage, value, tags, next_step, next_at, last_at')
      .eq('owner_id', userId).limit(1000),
  ])

  const C = calls || []
  const held      = C.filter(c => c.status === 'done' || ['won', 'lost', 'follow_up'].includes(c.outcome))
  const noShow    = C.filter(c => c.outcome === 'no_show')
  const offers    = C.filter(c => c.offer_made)
  const deposits  = C.filter(c => c.deposit_collected)
  const won       = C.filter(c => c.outcome === 'won' || c.deal_closed)
  const followUps = C.filter(c => c.next_step && !['won', 'lost'].includes(c.outcome))
  const cash      = won.reduce((a, c) => a + (Number(c.deal_amount) || 0), 0)
  const offered   = offers.reduce((a, c) => a + (Number(c.offer_amount) || 0), 0)

  const denomShow = held.length + noShow.length
  const showRate  = denomShow ? held.length / denomShow : null
  const closeRate = offers.length ? won.length / offers.length : null
  const offerRate = held.length ? offers.length / held.length : null

  const L = leads || []
  const openLeads = L.filter(l => l.stage !== 'cerrado')
  const pipeline  = openLeads.reduce((a, l) => a + (Number(l.value) || 0), 0)
  const stale     = L.filter(l => l.last_at && (Date.now() - new Date(l.last_at).getTime()) > 7 * 86400 * 1000 && l.stage !== 'cerrado')
  const hot       = L.filter(l => (l.tags || []).includes('caliente') && l.stage !== 'cerrado')
  const dueFollow = L.filter(l => l.next_at && new Date(l.next_at).getTime() <= Date.now() && l.stage !== 'cerrado')

  // Qué está fallando — cuellos de botella detectados por umbral.
  const issues = []
  if (showRate != null && showRate < 0.7) issues.push(`Show rate bajo (${pct(showRate)}): se te caen las agendadas antes de la call.`)
  if (closeRate != null && offers.length >= 3 && closeRate < 0.3) issues.push(`Conviertes pocas ofertas (${pct(closeRate)}): el problema está en el cierre, no en generar oferta.`)
  if (offerRate != null && held.length >= 3 && offerRate < 0.5) issues.push(`Lanzas oferta en pocas llamadas (${pct(offerRate)}): falta pasar a oferta más a menudo.`)
  if (stale.length) issues.push(`${stale.length} lead(s) sin tocar +7 días: pipeline enfriándose.`)
  if (dueFollow.length) issues.push(`${dueFollow.length} seguimiento(s) vencido(s) hoy o antes.`)
  if (deposits.length === 0 && offers.length >= 3) issues.push('Ninguna oferta cerró con depósito: prueba a pedir señal para fijar el compromiso.')
  if (!issues.length) issues.push('Sin cuellos de botella graves ahora mismo. Mantén el ritmo de seguimientos.')

  return {
    window_days: 90,
    calls: C.length,
    held: held.length,
    no_shows: noShow.length,
    offers: offers.length,
    deposits: deposits.length,
    closes: won.length,
    cash_closed: cash,
    offered_total: offered,
    show_rate: showRate,
    close_rate: closeRate,
    offer_rate: offerRate,
    follow_ups_open: followUps.length,
    leads_total: L.length,
    leads_open: openLeads.length,
    pipeline_value: pipeline,
    hot_leads: hot.length,
    stale_leads: stale.length,
    due_followups: dueFollow.length,
    issues,
  }
}

const pct = (v) => v == null ? '—' : `${Math.round(v * 100)}%`
const eur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)

function metricsBlock(m) {
  if (!m) return 'No hay métricas disponibles (sin backend o sin datos todavía).'
  return [
    `Ventana: últimos ${m.window_days} días.`,
    `Llamadas: ${m.calls} · realizadas: ${m.held} · no-shows: ${m.no_shows}`,
    `Ofertas: ${m.offers} · depósitos: ${m.deposits} · cierres: ${m.closes}`,
    `Cash cerrado: ${eur(m.cash_closed)} · ofertado: ${eur(m.offered_total)}`,
    `Show rate: ${pct(m.show_rate)} · Close rate (de ofertas): ${pct(m.close_rate)} · Tasa de oferta: ${pct(m.offer_rate)}`,
    `Pipeline abierto: ${m.leads_open} leads · ${eur(m.pipeline_value)} · calientes: ${m.hot_leads} · sin tocar +7d: ${m.stale_leads} · seguimientos vencidos: ${m.due_followups}`,
    '',
    'Qué está fallando (detectado por umbrales):',
    ...m.issues.map(i => `- ${i}`),
  ].join('\n')
}

// El "alma" del Orbe: quién es y qué tres funciones cumple. Esto es lo que
// explica al LLM local su papel — no es un chat genérico, es un copiloto de cierre.
function systemPrompt(m) {
  return `Eres el ORBE de APEX: el copiloto de ventas del closer, integrado en su software. Hablas en español, en primera persona, voz de socio con oficio: cálida, directa, sin relleno ni emojis ni exclamaciones.

Tienes exactamente tres trabajos:
1) DECIR LAS MÉTRICAS — cuando te pregunten por números (llamadas, show rate, ofertas, cierres, cash, pipeline…), respóndelos exactos desde los datos de abajo. No inventes cifras; si un dato no está, dilo.
2) DECIR QUÉ ESTÁ FALLANDO — señala el cuello de botella real del embudo y por qué duele, apoyándote en la sección "Qué está fallando".
3) GUIAR PARA CERRAR MEJOR — da consejos accionables y concretos para la próxima llamada o seguimiento (qué decir, qué preguntar, cómo rebatir, cuándo pedir señal). Conecta el consejo con el dato que lo justifica.

Reglas: sé breve (2-6 frases o bullets). Prioriza lo accionable. Si el usuario solo saluda, ofrécele lo que puedes hacer (métricas, diagnóstico, guía de cierre). Usa SIEMPRE los datos reales siguientes como verdad:

=== DATOS DEL USUARIO ===
${metricsBlock(m)}
=== FIN DATOS ===`
}

// ── chat ─────────────────────────────────────────────────────────────────
async function chat(req, res) {
  const { userId, messages } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  const history = Array.isArray(messages) ? messages.filter(m => m && m.body) : []
  if (!history.length) return res.status(400).json({ error: 'messages_required' })

  const metrics = await computeMetrics(userId).catch(() => null)
  const system = systemPrompt(metrics)

  if (!localLLMReady() && !anthropic) {
    return res.status(503).json({ error: 'no_llm_configured', reply: 'No hay LLM configurado (ni Ollama local ni Anthropic). Arranca el LLM local para activarme.' })
  }

  let reply
  try {
    if (localLLMReady()) {
      // Ollama: un system + un user. Plegamos el historial en el user para
      // mantener el hilo de la conversación.
      const convo = history.slice(-12).map(m => `${m.role === 'user' ? 'Closer' : 'Orbe'}: ${m.body}`).join('\n')
      reply = await localChat({ system, user: `${convo}\n\nOrbe:`, maxTokens: 700 })
    } else {
      const r = await anthropic.messages.create({
        model: CHAT_MODEL, max_tokens: 700, system,
        messages: history.slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.body })),
      })
      reply = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    }
  } catch (e) {
    console.error('[orbe] llm failed', e.message)
    return res.status(502).json({ error: 'llm_failed', detail: e.message })
  }

  return res.status(200).json({ reply: (reply || '').trim() || 'No tengo respuesta ahora mismo.', metrics })
}

async function metricsEndpoint(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  const metrics = await computeMetrics(userId).catch(() => null)
  return res.status(200).json({ metrics })
}
