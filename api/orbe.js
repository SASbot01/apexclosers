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
import { retrieve, ragBlock } from './_lib/coachRag.js'

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null
const CHAT_MODEL = 'claude-sonnet-4-6'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || 'chat'
  try {
    if (action === 'chat')            return chat(req, res)
    if (action === 'metrics')         return metricsEndpoint(req, res)
    if (action === 'optimize-script') return optimizeScript(req, res)
    if (action === 'roleplay')        return roleplay(req, res)
    if (action === 'roleplay-eval')   return roleplayEval(req, res)
    if (action === 'live-support')    return liveSupport(req, res)
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
      .eq('user_id', userId).or(`started_at.gte.${since},started_at.is.null`).limit(1000),
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

Reglas: sé breve (2-6 frases o bullets). Prioriza lo accionable. Si el usuario solo saluda, ofrécele lo que puedes hacer (métricas, diagnóstico, guía de cierre). Cuando te apoyes en una llamada concreta, CÍTALA por su título/fecha (usa solo los fragmentos reales del final, no inventes). Usa SIEMPRE los datos reales siguientes como verdad:

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
  // RAG: recupera fragmentos relevantes de las transcripciones reales del closer
  // para esta pregunta y se los damos al modelo para que CITE llamadas concretas.
  const lastUser = [...history].reverse().find(m => m.role === 'user')?.body || ''
  const chunks = await retrieve(userId, lastUser, 6).catch(() => [])
  const system = systemPrompt(metrics) + ragBlock(chunks)

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

// Helper LLM (local u Anthropic) para un turno system+user.
async function llmTurn({ system, user, maxTokens = 600 }) {
  if (localLLMReady()) return localChat({ system, user, maxTokens })
  if (anthropic) {
    const r = await anthropic.messages.create({ model: CHAT_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
    return (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
  }
  throw new Error('no_llm_configured')
}

// ── Roleplay ───────────────────────────────────────────────────────────────
// La IA interpreta a un CLIENTE/prospect realista para que el closer practique.
async function roleplay(req, res) {
  const { messages, clientName, difficulty } = req.body || {}
  const history = Array.isArray(messages) ? messages.filter(m => m && m.body) : []
  if (!localLLMReady() && !anthropic) return res.status(503).json({ error: 'no_llm_configured' })
  const dif = difficulty === 'duro' ? 'difícil (muchas objeciones, escéptico)' : difficulty === 'facil' ? 'fácil (interesado, pocas pegas)' : 'realista (ni regalado ni imposible)'
  const system = `Estás en un ROLEPLAY de entrenamiento de ventas high-ticket. Interpretas a un CLIENTE POTENCIAL realista${clientName ? ` del sector "${clientName}"` : ''}. Nivel: ${dif}.
Reglas:
- Mantente SIEMPRE en personaje. Responde SOLO como el cliente, en español, natural y corto (1-3 frases).
- Pon objeciones creíbles (precio, tiempo, "lo hablo con mi pareja/socio", miedo a que no funcione, desconfianza). No seas imposible: si el closer rebate bien y genera valor, ve cediendo de forma realista; si lo hace flojo, mantente reticente.
- No des consejos, no rompas el personaje, no expliques lo que haces. Solo habla como el cliente.
- Si el closer cierra de forma sólida y resuelve tus dudas, puedes aceptar la oferta.`
  if (!history.length) {
    // Apertura: el cliente "coge el teléfono".
    const opener = await llmTurn({ system, user: 'Inicia tú la llamada como el cliente que acaba de descolgar, breve y neutro.', maxTokens: 120 }).catch(() => null)
    return res.status(200).json({ reply: (opener || 'Hola, ¿sí? Dime.').trim() })
  }
  const convo = history.slice(-16).map(m => `${m.role === 'user' ? 'Closer' : 'Cliente'}: ${m.body}`).join('\n')
  let reply
  try { reply = await llmTurn({ system, user: `${convo}\n\nCliente:`, maxTokens: 200 }) }
  catch (e) { return res.status(502).json({ error: 'llm_failed', detail: e.message }) }
  return res.status(200).json({ reply: (reply || '').trim() || '…' })
}

// Evalúa el roleplay y da nota + feedback al closer.
async function roleplayEval(req, res) {
  const { messages, clientName } = req.body || {}
  const history = Array.isArray(messages) ? messages.filter(m => m && m.body) : []
  if (!history.length) return res.status(400).json({ error: 'messages_required' })
  if (!localLLMReady() && !anthropic) return res.status(503).json({ error: 'no_llm_configured' })
  const system = `Eres un coach de ventas senior. Lee este roleplay (Closer vs Cliente simulado${clientName ? ` del sector ${clientName}` : ''}) y evalúa AL CLOSER. Devuelve markdown en español, sin emojis ni exclamaciones:
## Puntuación
X/10 — una frase justificándola.
## Lo que hizo bien
- 2-3 bullets concretos
## A mejorar
- 2-3 bullets concretos (cita el momento)
## Frase para la próxima
"una frase accionable"`
  const convo = history.map(m => `${m.role === 'user' ? 'Closer' : 'Cliente'}: ${m.body}`).join('\n')
  let text
  try { text = await llmTurn({ system, user: convo, maxTokens: 700 }) }
  catch (e) { return res.status(502).json({ error: 'llm_failed', detail: e.message }) }
  return res.status(200).json({ evaluation: (text || '').trim() })
}

// ── Live Call Support ───────────────────────────────────────────────────────
// Copiloto EN VIVO: dada la situación/objeción actual + el guion, sugiere qué decir.
async function liveSupport(req, res) {
  const { situation, clientName, objections, tonalities } = req.body || {}
  if (!situation) return res.status(400).json({ error: 'situation_required' })
  if (!localLLMReady() && !anthropic) return res.status(503).json({ error: 'no_llm_configured' })
  const objText = Array.isArray(objections) && objections.length
    ? objections.map(o => `- ${o.trigger}: ${o.response}`).join('\n') : '—'
  const tonText = Array.isArray(tonalities) && tonalities.length ? tonalities.join(', ') : '—'
  const system = `Eres el COPILOTO EN VIVO de un closer durante una llamada de venta${clientName ? ` (cliente: ${clientName})` : ''}. Te paso lo que está pasando AHORA y el guion. Devuelve UNA respuesta lista para decir EN VOZ ALTA, en español, 1-2 frases, directa, con tono de cierre y empatía. Sin preámbulos, sin comillas, solo la frase. Apóyate en las objeciones y tonalidades del guion.
Objeciones del guion:
${objText}
Tonalidades: ${tonText}`
  let reply
  try { reply = await llmTurn({ system, user: `Situación ahora mismo: ${String(situation).slice(0, 500)}`, maxTokens: 160 }) }
  catch (e) { return res.status(502).json({ error: 'llm_failed', detail: e.message }) }
  return res.status(200).json({ suggestion: (reply || '').trim() })
}

// ── optimize-script ──────────────────────────────────────────────────────
// Afina el guion de un cliente con el LLM local, apoyándose en los resultados
// reales de sus llamadas (qué outcome y qué objeciones aparecen). Devuelve un
// guion con la MISMA forma para que el front lo cargue en modo edición.
async function optimizeScript(req, res) {
  const { script, results, clientName } = req.body || {}
  if (!script || !Array.isArray(script.phases)) return res.status(400).json({ error: 'script_required' })
  if (!localLLMReady() && !anthropic) return res.status(503).json({ error: 'no_llm_configured' })

  // Resumen compacto de los resultados (no mandamos PII innecesaria).
  const R = Array.isArray(results) ? results.slice(0, 40) : []
  const counts = R.reduce((a, r) => { a[r.outcome] = (a[r.outcome] || 0) + 1; return a }, {})
  const notes = R.filter(r => r.notes).slice(0, 12).map(r => `- (${r.outcome}) ${String(r.notes).slice(0, 160)}`).join('\n') || '- (sin notas registradas)'
  const countsLine = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'sin resultados aún'

  const system = `Eres un closer senior de high-ticket que afina guiones de llamada de admisión. Te paso el guion actual de un cliente y los resultados reales de sus últimas llamadas. Devuelve un guion MEJORADO y accionable, en español, voz directa de oficio.

Trabaja con criterio de cierre:
- Refuerza las fases donde se pierden ventas según los resultados (p.ej. muchas "lost"/"follow_up" → mejora dolor, precio, cierre y manejo de objeciones).
- Añade/ajusta objeciones que aparezcan en las notas.
- Frases concretas y cortas, orientadas a resultado, sin relleno ni emojis ni exclamaciones.

Devuelve SOLO un JSON válido (sin markdown) con EXACTAMENTE esta forma:
{"phases":[{"id":"string","title":"string","lines":["..."],"tips":["..."]}],"objections":[{"trigger":"string","response":"string"}],"tonalities":["..."]}
Mantén los "id" de las fases que ya existan. Conserva un número de fases similar (no menos de 5). Cada "lines"/"tips" es una lista de frases cortas.`

  const user = `Cliente: ${clientName || 'Cliente'}
Resultados recientes (recuento): ${countsLine}
Notas de llamadas:
${notes}

Guion actual (JSON):
${JSON.stringify({ phases: script.phases, objections: script.objections || [], tonalities: script.tonalities || [] })}`

  let text
  try {
    if (localLLMReady()) {
      text = await localChat({ system, user, maxTokens: 2500, json: true })
    } else {
      const r = await anthropic.messages.create({
        model: CHAT_MODEL, max_tokens: 2500, system,
        messages: [{ role: 'user', content: user }],
      })
      text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    }
  } catch (e) {
    console.error('[orbe] optimize llm failed', e.message)
    return res.status(502).json({ error: 'llm_failed', detail: e.message })
  }

  let improved
  try {
    const m = text.match(/\{[\s\S]*\}/)
    improved = JSON.parse(m ? m[0] : text)
  } catch {
    return res.status(502).json({ error: 'bad_json_from_llm' })
  }
  if (!improved || !Array.isArray(improved.phases) || improved.phases.length < 1) {
    return res.status(502).json({ error: 'invalid_script' })
  }

  // Normaliza al shape exacto del front (defensivo con lo que devuelva el modelo).
  const norm = {
    phases: improved.phases.map((p, i) => ({
      id: p.id || script.phases[i]?.id || `fase${i + 1}`,
      title: String(p.title || `Fase ${i + 1}`),
      lines: Array.isArray(p.lines) ? p.lines.map(String).filter(Boolean) : [],
      tips: Array.isArray(p.tips) ? p.tips.map(String).filter(Boolean) : [],
    })),
    objections: Array.isArray(improved.objections)
      ? improved.objections.filter(o => o && o.trigger).map(o => ({ trigger: String(o.trigger), response: String(o.response || '') }))
      : (script.objections || []),
    tonalities: Array.isArray(improved.tonalities) ? improved.tonalities.map(String).filter(Boolean) : (script.tonalities || []),
  }
  return res.status(200).json({ script: norm })
}
