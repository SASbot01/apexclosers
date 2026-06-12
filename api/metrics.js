// /api/metrics — métricas del usuario (backend canónico que usan Métricas y el
// Perfil). Las ventas SOLO cuentan si están verificadas (status='verified').
//
// Visibilidad: cada métrica puede ser pública o privada (tabla metric_visibility).
// Si la pide otro usuario (viewerId != userId), se devuelven solo las públicas.
//
// Acciones (?action=):
//   GET metrics      ?userId= [&viewerId=]   → { metrics, list, visibility, isOwner }
//   GET visibility   ?userId=                → { visibility }
//   POST visibility  Body { userId, visible } → guarda el mapa público/privado

import { supabase, supabaseReady } from './_lib/supabase.js'

// Catálogo canónico de métricas. fmt: money | int | pct.
export const METRIC_DEFS = [
  { key: 'revenue',       label: 'Revenue',        fmt: 'money' },
  { key: 'cash_collected',label: 'Cash collected', fmt: 'money' },
  { key: 'recollected',   label: '% Recollected',  fmt: 'pct' },
  { key: 'deals',         label: 'Cierres',        fmt: 'int' },
  { key: 'avg_ticket',    label: 'Ticket medio',   fmt: 'money' },
  { key: 'calls',         label: 'Llamadas',       fmt: 'int' },
  { key: 'held',          label: 'Realizadas',     fmt: 'int' },
  { key: 'show_rate',     label: 'Show rate',      fmt: 'pct' },
  { key: 'offers',        label: 'Ofertas',        fmt: 'int' },
  { key: 'close_rate',    label: 'Close rate',     fmt: 'pct' },
  { key: 'pipeline_value',label: 'Pipeline abierto', fmt: 'money' },
]

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'POST' ? 'visibility' : 'metrics')
  try {
    if (action === 'metrics')    return await getMetrics(req, res)
    if (action === 'visibility') return await (req.method === 'POST' ? setVisibility(req, res) : getVisibility(req, res))
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[metrics]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

// Si se pasa clientKey, las métricas se FILTRAN a ese cliente: las ventas por
// client_id; las de llamadas (show/close rate, pipeline) no se pueden filtrar por
// cliente (las calls no llevan esa clave) → se devuelven null en la vista filtrada.
export async function computeUserMetrics(userId, clientKey = null) {
  if (!supabaseReady() || !userId) return null
  const since = new Date(Date.now() - 365 * 86400 * 1000).toISOString()
  let salesQ = supabase.from('sales').select('revenue, cash_collected, status').eq('owner_id', userId).eq('status', 'verified')
  if (clientKey) salesQ = salesQ.eq('client_id', clientKey)
  const S = (await salesQ.limit(5000)).data || []
  const revenue = S.reduce((a, s) => a + (Number(s.revenue) || 0), 0)
  const cash    = S.reduce((a, s) => a + (Number(s.cash_collected) || 0), 0)
  const deals   = S.length

  // Vista filtrada a un cliente: solo métricas de ventas (revenue/cash/cierres).
  if (clientKey) {
    return {
      revenue, cash_collected: cash, recollected: revenue ? cash / revenue : null,
      deals, avg_ticket: deals ? revenue / deals : 0,
      calls: null, held: null, show_rate: null, offers: null, close_rate: null, pipeline_value: null,
    }
  }

  const [callsRes, leadsRes] = await Promise.all([
    supabase.from('calls').select('status, outcome, offer_made, deal_closed').eq('user_id', userId).or(`started_at.gte.${since},started_at.is.null`).limit(5000),
    supabase.from('leads').select('stage, value').eq('owner_id', userId).limit(5000),
  ])
  const C = callsRes.data || [], L = leadsRes.data || []

  const held    = C.filter(c => c.status === 'done' || ['won', 'lost', 'follow_up'].includes(c.outcome)).length
  const noShow  = C.filter(c => c.outcome === 'no_show').length
  const offers  = C.filter(c => c.offer_made).length
  const won     = C.filter(c => c.outcome === 'won' || c.deal_closed).length
  const pipeline = L.filter(l => l.stage !== 'cerrado' && l.stage !== 'cerrada').reduce((a, l) => a + (Number(l.value) || 0), 0)

  return {
    revenue,
    cash_collected: cash,
    recollected: revenue ? cash / revenue : null,
    deals,
    avg_ticket: deals ? revenue / deals : 0,
    calls: C.length,
    held,
    show_rate: (held + noShow) ? held / (held + noShow) : null,
    offers,
    close_rate: offers ? won / offers : null,
    pipeline_value: pipeline,
  }
}

async function visibilityMap(userId) {
  const { data } = await supabase.from('metric_visibility').select('visible').eq('user_id', userId).maybeSingle()
  return (data && data.visible) || {}
}

async function getMetrics(req, res) {
  const userId = req.query.userId
  const viewerId = req.query.viewerId || null
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const isOwner = viewerId === userId
  const client = req.query.client || null
  const [metrics, visible] = await Promise.all([computeUserMetrics(userId, client), visibilityMap(userId)])
  const list = METRIC_DEFS
    .filter(d => isOwner || visible[d.key] === true)   // a terceros, solo públicas
    .map(d => ({ ...d, value: metrics ? metrics[d.key] : null, public: visible[d.key] === true }))
  // A terceros NO devolvemos el objeto crudo `metrics` (lleva TODOS los valores
  // privados) ni el mapa de visibilidad completo: solo el `list` ya filtrado.
  return res.status(200).json({ metrics: isOwner ? metrics : null, list, visibility: isOwner ? visible : {}, isOwner })
}

async function getVisibility(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  return res.status(200).json({ visibility: await visibilityMap(userId) })
}

async function setVisibility(req, res) {
  const { userId, visible } = req.body || {}
  if (!userId || typeof visible !== 'object') return res.status(400).json({ error: 'userId_and_visible_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { error } = await supabase.from('metric_visibility').upsert({ user_id: userId, visible }, { onConflict: 'user_id' })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true, visibility: visible })
}
