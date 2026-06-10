// /api/workshop — el Workshop (IA · tus habilidades) con DATOS REALES.
//
// Agrega las llamadas (calls.skills, calculadas por la IA al leer la
// transcripción) + las ventas verificadas en el mismo shape que consumía el
// front demo: hexagrama de habilidades, estilo (habla/escucha, tono, ritmo),
// resultados, evolución de métricas en el tiempo, cuello de botella y la lectura
// de la IA. El chat-coach reutiliza /api/orbe; aquí se guardan los hilos.
//
// Acciones (?action=):
//   GET  summary    ?userId=&period=&client=   → todo el panel del Workshop
//   GET  chats      ?userId=                    → hilos guardados del coach
//   POST chat-save  Body { userId, id?, title, messages } → upsert hilo
//   POST chat-del   ?id=  Body { userId }       → borra hilo

import { supabase, supabaseReady } from './_lib/supabase.js'
import { localChat, localLLMReady } from './_lib/localLLM.js'
import { SKILLS_SYSTEM, normalizeSkills, transcriptStats } from './_lib/callAnalysis.js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null
const SCORE_LIMIT = 6   // máx. llamadas a puntuar (LLM) por petición, para no bloquear

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || 'summary'
  try {
    if (action === 'summary')   return summary(req, res)
    if (action === 'chats')     return listChats(req, res)
    if (action === 'chat-save') return saveChat(req, res)
    if (action === 'chat-del')  return delChat(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[workshop]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

// ── Metadatos de habilidades (etiquetas + copy del cuello de botella/readout) ──
const SKILL_KEYS = ['apertura', 'descubrimiento', 'propuesta', 'objeciones', 'cierre', 'seguimiento']
const SKILL_LABEL = { apertura: 'Apertura', descubrimiento: 'Descubrim.', propuesta: 'Propuesta', objeciones: 'Objeciones', cierre: 'Cierre', seguimiento: 'Seguim.' }
const SKILL_COPY = {
  apertura: {
    strength: 'Apertura con control: fijas agenda y autoridad desde el minuto uno.',
    weakness: 'Apertura floja: arrancas sin fijar agenda y la llamada va a remolque.',
    next: 'Usa un marco de 30 s al empezar: contexto → permiso → agenda.',
    headline: 'Apertura de la llamada',
    diagnosis: 'Arrancas sin fijar agenda ni autoridad, así que el resto de la llamada va a remolque.',
    action: 'Usa un marco de 30 s al empezar: contexto → permiso → agenda. Aplícalo en cada primera llamada esta semana.',
    why: 'Una apertura que toma el control arrastra al alza descubrimiento, propuesta y cierre.',
  },
  descubrimiento: {
    strength: 'Buen descubrimiento: cuantificas el dolor antes de proponer.',
    weakness: 'Descubrimiento corto: cierras las preguntas demasiado pronto.',
    next: 'Añade 2 preguntas de dolor + 1 de impacto económico antes de presentar.',
    headline: 'Profundidad del descubrimiento',
    diagnosis: 'Cierras las preguntas demasiado pronto; sin dolor cuantificado, propuesta y cierre se caen.',
    action: 'Añade 2 preguntas de dolor + 1 de impacto económico antes de presentar. Practícalo hoy en roleplay.',
    why: 'Es la restricción raíz: sin dolor claro, todo lo que viene después convierte peor.',
  },
  propuesta: {
    strength: 'Propuesta anclada en valor: presentas ROI antes que precio.',
    weakness: 'Propuesta floja: presentas características antes de anclar valor.',
    next: 'Reordena la propuesta: ROI de un cierre → prueba social → precio.',
    headline: 'Construcción de la propuesta',
    diagnosis: 'Presentas características antes de anclar valor, y eso dispara la objeción de precio.',
    action: 'Reordena tu propuesta tipo: ROI de un solo cierre → prueba social → precio. Reescríbela esta semana.',
    why: 'Una propuesta anclada en valor desactiva las objeciones antes de que aparezcan.',
  },
  objeciones: {
    strength: 'Manejas bien las objeciones: re-anclas valor antes de dar la cifra.',
    weakness: 'Objeciones: sueltas el precio antes de re-anclar valor y se caen llamadas calientes.',
    next: 'Memoriza 3 rebatidas de precio (validar → re-anclar ROI → cifra).',
    headline: 'Manejo de objeciones',
    diagnosis: 'Cuando aparece “precio” sueltas la cifra antes de re-anclar valor, y ahí se te caen las llamadas calientes.',
    action: 'Memoriza 3 rebatidas de precio (validar → re-anclar ROI → cifra) y haz 3 roleplays esta semana.',
    why: 'Es donde más llamadas calientes se pierden: corregirlo sube directo tu close rate.',
  },
  cierre: {
    strength: 'Cierre asumido natural: pides el sí sin titubear.',
    weakness: 'Cierre tibio: llegas con valor construido pero no pides el sí con claridad.',
    next: 'Cierre asumido + silencio: propón el siguiente paso y calla 3 segundos.',
    headline: 'Pedir el cierre',
    diagnosis: 'Llegas con el valor construido pero no pides el sí con claridad y dejas que la llamada se enfríe.',
    action: 'Cierre asumido + silencio: tras la oferta propón el siguiente paso y calla 3 segundos. Cada llamada.',
    why: 'Convierte en ventas el trabajo que ya haces bien antes; es la palanca más inmediata.',
  },
  seguimiento: {
    strength: 'Buen seguimiento: dejas el próximo paso concreto y agendado.',
    weakness: 'Seguimiento débil: las llamadas en “seguimiento” se enfrían sin sistema.',
    next: 'Activa una secuencia de 3 toques en 72 h y agéndala al colgar.',
    headline: 'Sistema de seguimiento',
    diagnosis: 'Las llamadas en “seguimiento” se enfrían porque no hay un follow-up sistemático.',
    action: 'Activa una secuencia de 3 toques en 72 h para cada “seguimiento” y agéndalos al colgar.',
    why: 'Recuperas pipeline que ya generaste: el revenue está, solo falta no dejarlo escapar.',
  },
}
const OBJ_LABEL = { precio: 'Precio', tiempo: 'Tiempo', confianza: 'Confianza', pareja: 'Pareja', socio: 'Socio', autoridad: 'Autoridad', miedo: 'Miedo', necesidad: 'Necesidad', urgencia: 'Urgencia' }

const periodStart = (period) => {
  const d = new Date()
  if (period === 'this_month') return new Date(d.getFullYear(), d.getMonth(), 1)
  if (period === 'this_quarter') return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
  if (period === 'this_year') return new Date(d.getFullYear(), 0, 1)
  return null // all
}
const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
const round2 = (v) => Math.round(v * 100) / 100

// ── summary ────────────────────────────────────────────────────────────────
async function summary(req, res) {
  const userId = req.query.userId
  const period = req.query.period || 'this_year'
  const client = req.query.client || 'all'
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(503).json({ error: 'no_backend' })

  const start = periodStart(period)
  const startIso = start ? start.toISOString() : null

  // Llamadas del periodo (incluye started_at NULL, como en métricas).
  let cq = supabase.from('calls')
    .select('id, started_at, status, outcome, state, objections, offer_made, deposit_collected, deal_closed, deal_amount, skills, transcript, client_id')
    .eq('user_id', userId)
  if (client !== 'all') cq = cq.eq('client_id', client)
  if (startIso) cq = cq.or(`started_at.gte.${startIso},started_at.is.null`)
  const { data: callsRaw } = await cq.order('started_at', { ascending: true }).limit(5000)
  let calls = callsRaw || []

  // Ventas verificadas del periodo (para revenue y la serie de evolución).
  let sq = supabase.from('sales').select('revenue, date, client_id').eq('owner_id', userId).eq('status', 'verified')
  if (client !== 'all') sq = sq.eq('client_id', client)
  if (startIso) sq = sq.gte('date', startIso)
  const { data: salesRaw } = await sq.limit(5000)
  const sales = salesRaw || []

  // Leads abiertos (para el eje de Seguimiento del hexagrama).
  const { data: leadsRaw } = await supabase.from('leads').select('stage, last_at, client_id').eq('owner_id', userId).limit(5000)
  const leads = (leadsRaw || []).filter(l => client === 'all' || l.client_id === client)

  // Puntúa de forma PEREZOSA las llamadas con transcripción pero sin skills.
  const toScore = calls.filter(c => !c.skills && Array.isArray(c.transcript) && c.transcript.length)
  let scoredNow = 0
  if (toScore.length && (localLLMReady() || anthropic)) {
    for (const c of toScore.slice(0, SCORE_LIMIT)) {
      const sk = await scoreCall(c.transcript).catch(() => null)
      if (sk) { c.skills = sk; scoredNow++; supabase.from('calls').update({ skills: sk }).eq('id', c.id).then(() => {}, () => {}) }
    }
  }

  const withSkills = calls.filter(c => c.skills && typeof c.skills === 'object')

  // ── Hexagrama de habilidades DERIVADO DEL EMBUDO REAL (no inventado) ──────
  // Cada eje sale de los datos: llamadas, ofertas, cierres, objeciones, ventas y
  // leads. Así los % se mueven con tu rendimiento real.
  const clampR = (a, b) => b > 0 ? Math.max(0, Math.min(1, a / b)) : null
  const heldC    = calls.filter(c => c.status === 'done' || ['won', 'lost', 'follow_up'].includes(c.outcome) || c.offer_made || c.deal_closed).length
  const noShowC  = calls.filter(c => c.state === 'no_show' || c.outcome === 'no_show').length
  const offersC  = calls.filter(c => c.offer_made).length
  const depositsC = calls.filter(c => c.deposit_collected).length
  const wonC     = calls.filter(c => c.outcome === 'won' || c.deal_closed).length
  const objCalls = calls.filter(c => Array.isArray(c.objections) && c.objections.length)
  const wonObjC  = objCalls.filter(c => c.outcome === 'won' || c.deal_closed).length
  const openLeads  = leads.filter(l => l.stage !== 'cerrado')
  const staleLeads = openLeads.filter(l => !l.last_at || (Date.now() - new Date(l.last_at).getTime()) > 7 * 86400 * 1000)
  // apertura=show rate · descubrimiento=tasa de oferta · propuesta=compromiso
  // (cierres+depósitos / ofertas) · objeciones=cierre con objeción · cierre=close
  // rate · seguimiento=salud del pipeline (leads no estancados).
  const SKILL_FROM = {
    apertura:      clampR(heldC, heldC + noShowC),
    descubrimiento: clampR(offersC, heldC),
    propuesta:     clampR(wonC + depositsC, offersC),
    objeciones:    objCalls.length ? clampR(wonObjC, objCalls.length) : clampR(wonC, offersC),
    cierre:        clampR(wonC, offersC),
    seguimiento:   openLeads.length ? clampR(openLeads.length - staleLeads.length, openLeads.length) : null,
  }
  const skills = SKILL_KEYS.map(k => ({ key: k, label: SKILL_LABEL[k], value: round2(SKILL_FROM[k] ?? 0) }))
  const byKey = Object.fromEntries(skills.map(s => [s.key, s.value]))
  const strong = skills.reduce((a, s) => s.value > a.value ? s : a, skills[0])
  const weak = skills.reduce((a, s) => s.value < a.value ? s : a, skills[0])

  // Estilo: habla/escucha (media de talk_ratio), tono (media), ritmo (media wpm).
  const talk = withSkills.length ? round2(avg(withSkills.map(c => Number(c.skills.talk_ratio) || 0.5))) : 0.5
  const listen = round2(1 - talk)
  const tonoAvg = (k) => Math.round(avg(withSkills.map(c => Number(c.skills.tono?.[k]) || 0)))
  let tSeg = tonoAvg('seguridad'), tEmp = tonoAvg('empatia'), tDud = tonoAvg('dudas')
  if (tSeg + tEmp + tDud === 0) { tSeg = 50; tEmp = 30; tDud = 20 }
  const tones = [
    { label: 'Seguridad', value: tSeg },
    { label: 'Empatía', value: tEmp },
    { label: 'Dudas', value: tDud },
  ]
  const dominantTone = tones.reduce((a, t) => t.value > a.value ? t : a, tones[0]).label
  const wpm = withSkills.length ? Math.round(avg(withSkills.map(c => Number(c.skills.wpm) || 130))) : 0

  // Volumen.
  const callsN = calls.length
  const words = withSkills.reduce((a, c) => a + (Number(c.skills.words) || 0), 0)
  // Minutos: de las marcas de tiempo del transcript; si faltan (transcripciones
  // sin timestamps), se estiman por volumen de palabras (~130 wpm) para que las
  // "horas transcritas" no salgan a 0.
  let minutes = withSkills.reduce((a, c) => a + (Number(c.skills.minutes) || 0), 0)
  if (minutes < 1 && words > 0) minutes = words / 130
  const hours = Math.max(words > 0 ? 1 : 0, Math.round(minutes / 60))
  const questions = withSkills.length ? round2(avg(withSkills.map(c => Number(c.skills.questions) || 0))) : 0

  // Objeción más frecuente.
  const objCount = {}
  for (const c of calls) for (const o of (Array.isArray(c.objections) ? c.objections : [])) {
    const k = String(o).toLowerCase().trim(); if (k) objCount[k] = (objCount[k] || 0) + 1
  }
  const topObj = Object.entries(objCount).sort((a, b) => b[1] - a[1])[0]?.[0]
  const objection = topObj ? (OBJ_LABEL[topObj] || (topObj[0].toUpperCase() + topObj.slice(1))) : '—'

  // Resultados (donut): por estado fino, con fallback a outcome.
  const isWon = (c) => c.state === 'ganada' || c.state === 'deposito' || c.outcome === 'won' || c.deal_closed
  const isNoShow = (c) => c.state === 'no_show' || c.outcome === 'no_show'
  const isLost = (c) => c.state === 'perdido' || c.outcome === 'lost'
  const won = calls.filter(isWon).length
  const noshow = calls.filter(c => !isWon(c) && isNoShow(c)).length
  const lost = calls.filter(c => !isWon(c) && !isNoShow(c) && isLost(c)).length
  const follow = Math.max(0, callsN - won - noshow - lost)
  const outcomes = [
    { key: 'won', label: 'Cerradas', value: won },
    { key: 'follow', label: 'Seguimiento', value: follow },
    { key: 'lost', label: 'Perdidas', value: lost },
    { key: 'noshow', label: 'No-show', value: noshow },
  ]

  // Tipo de closer.
  const closer = listen >= 0.58 ? { name: 'Consultivo', desc: 'Escucha más de lo que habla y cierra por valor.' }
    : byKey.cierre >= 0.9 ? { name: 'Cerrador', desc: 'Fuerte en el cierre.' }
      : byKey.objeciones >= 0.7 ? { name: 'Negociador', desc: 'Domina las objeciones.' }
        : { name: 'Directo', desc: 'Va al grano.' }

  // Evolución: series reales por métrica y granularidad.
  const evolution = buildEvolution(calls, sales, withSkills, period)

  // Cuello de botella (teoría de restricciones sobre la habilidad más débil).
  const bottleneck = buildBottleneck(weak, won, withSkills.length)

  // Lectura de la IA derivada de las habilidades reales (top/bottom).
  const ranked = [...skills].sort((a, b) => b.value - a.value)
  const readout = {
    strengths: ranked.slice(0, 3).map(s => SKILL_COPY[s.key].strength),
    weaknesses: ranked.slice(-3).reverse().map(s => SKILL_COPY[s.key].weakness),
    next: ranked.slice(-3).reverse().map(s => SKILL_COPY[s.key].next),
  }

  return res.status(200).json({
    period, client,
    skills, talk, listen, calls: callsN, hours, words, questions,
    objection, closer, strong, weak, outcomes, tones, dominantTone, wpm,
    bottleneck, evolution, readout,
    scored: withSkills.length, scoredNow, pendingScore: Math.max(0, toScore.length - scoredNow),
    revenue: sales.reduce((a, s) => a + (Number(s.revenue) || 0), 0),
  })
}

// Puntúa una transcripción vía LLM y completa volumen medible.
async function scoreCall(transcript) {
  const text = (Array.isArray(transcript) ? transcript : []).map(s => `${s.speaker}: ${s.text}`).join('\n')
  if (text.trim().length < 50) return null
  let raw
  if (localLLMReady()) {
    raw = await localChat({ system: SKILLS_SYSTEM, user: text.slice(0, 30000), maxTokens: 400, json: true })
  } else if (anthropic) {
    const r = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 400, system: SKILLS_SYSTEM, messages: [{ role: 'user', content: text.slice(0, 30000) }] })
    raw = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
  } else return null
  const m = String(raw).match(/\{[\s\S]*\}/)
  const sk = m ? normalizeSkills(JSON.parse(m[0])) : null
  if (sk) {
    const st = transcriptStats(transcript)
    sk.words = st.words
    if (st.minutes) sk.minutes = Math.round(st.minutes * 10) / 10
    if (!sk.questions && st.questions) sk.questions = st.questions
  }
  return sk
}

// Cuello de botella: la habilidad más débil limita la cadena. Proyecta el lift.
const TICKET = 1600
function buildBottleneck(weak, wonDeals, n) {
  const w = weak.value
  const gap = Math.min(0.40, Math.max(0.05, 0.80 - w))
  const liftPts = Math.max(3, Math.round(gap * 34))
  const extraDeals = Math.max(1, Math.round((wonDeals || Math.round(n * 0.27)) * gap * 1.05))
  const meta = SKILL_COPY[weak.key] || SKILL_COPY.objeciones
  return {
    area: weak.label, key: weak.key, value: w,
    headline: meta.headline, diagnosis: meta.diagnosis, action: meta.action, why: meta.why,
    liftPts, revLift: extraDeals * TICKET, extraDeals,
    confidence: Math.min(95, 60 + Math.round((n || 0) * 1.5)),   // más datos → más confianza
  }
}

// Series de evolución reales por métrica (close_rate, listen, revenue, objeciones,
// cierre) y granularidad (día/semana/mes), agregando por buckets temporales.
function buildEvolution(calls, sales, withSkills, period) {
  const METRICS = {
    close_rate: { label: 'Close rate', fmt: 'pct' },
    listen:     { label: 'Ratio de escucha', fmt: 'pct' },
    revenue:    { label: 'Revenue', fmt: 'money' },
    objeciones: { label: 'Habilidad · Objeciones', fmt: 'pct' },
    cierre:     { label: 'Habilidad · Cierre', fmt: 'pct' },
  }
  const GRANS = { dia: 14, semana: 8, mes: 6 }
  const now = new Date()
  const dateOf = (x) => x.started_at || x.date ? new Date(x.started_at || x.date) : null

  function buckets(gran) {
    const n = GRANS[gran]
    const out = []
    for (let i = n - 1; i >= 0; i--) {
      let from, to, label
      if (gran === 'dia') {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        to = new Date(from); to.setDate(to.getDate() + 1)
        label = `${from.getDate()}`
      } else if (gran === 'semana') {
        to = new Date(now); to.setDate(to.getDate() - 7 * i)
        from = new Date(to); from.setDate(from.getDate() - 7)
        label = `S${n - i}`
      } else {
        from = new Date(now.getFullYear(), now.getMonth() - i, 1)
        to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
        label = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][from.getMonth()]
      }
      out.push({ from, to, label })
    }
    return out
  }

  const inBucket = (items, b) => items.filter(x => { const d = dateOf(x); return d && d >= b.from && d < b.to })

  const series = {}
  for (const gran of Object.keys(GRANS)) {
    const bs = buckets(gran)
    series[gran] = {}
    for (const key of Object.keys(METRICS)) {
      series[gran][key] = bs.map(b => {
        if (key === 'revenue') return [b.label, inBucket(sales, b).reduce((a, s) => a + (Number(s.revenue) || 0), 0)]
        const cb = inBucket(calls, b)
        if (key === 'close_rate') {
          const offers = cb.filter(c => c.offer_made).length
          const wons = cb.filter(c => c.outcome === 'won' || c.deal_closed).length
          return [b.label, offers ? round2(wons / offers) : 0]
        }
        const sk = cb.filter(c => c.skills)
        if (key === 'listen') return [b.label, sk.length ? round2(1 - avg(sk.map(c => Number(c.skills.talk_ratio) || 0.5))) : 0]
        return [b.label, sk.length ? round2(avg(sk.map(c => Number(c.skills[key]) || 0))) : 0]
      })
    }
  }
  const out = {}
  for (const [key, m] of Object.entries(METRICS)) out[key] = { label: m.label, fmt: m.fmt, series: { dia: series.dia[key], semana: series.semana[key], mes: series.mes[key] } }
  return out
}

// ── Chats del coach (Workshop) ───────────────────────────────────────────────
async function listChats(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ chats: [] })
  const { data, error } = await supabase.from('coach_chats').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  return res.status(200).json({ chats: data || [] })
}

async function saveChat(req, res) {
  const { userId, id, title, messages } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  const row = {
    user_id: userId,
    title: (title || 'Conversación').slice(0, 120),
    messages: Array.isArray(messages) ? messages.map(m => ({ role: m.role, body: String(m.body || ''), ts: m.ts || Date.now() })) : [],
    updated_at: new Date().toISOString(),
  }
  if (id && /^[0-9a-f-]{36}$/i.test(id)) row.id = id   // solo uuid (ids locales 'w123' → insert nuevo)
  const { data, error } = await supabase.from('coach_chats').upsert(row).select('*').single()
  if (error) throw new Error(error.message)
  return res.status(200).json({ chat: data })
}

async function delChat(req, res) {
  const { userId } = req.body || {}
  const id = req.query.id
  if (!userId || !id) return res.status(400).json({ error: 'userId_and_id_required' })
  const { error } = await supabase.from('coach_chats').delete().eq('id', id).eq('user_id', userId)
  if (error) throw new Error(error.message)
  return res.status(200).json({ ok: true })
}
