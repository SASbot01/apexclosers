// /api/reports — embudo diario del closer (Agendadas→Realizadas→Ofertas→
// Depósitos→Cierres). Combina lo DERIVADO de las llamadas reales (agrupadas por
// día) con lo que el closer registra a mano / por CSV (tabla `reports`).
//
// Acciones (?action=):
//   GET  list       ?userId=&client=   → { rows: [{date,client_id,scheduled,...}] }
//   POST add-entry  Body { userId, entry } → suma al día (+cliente) y devuelve fila
import { supabase, supabaseReady } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'POST' ? 'add-entry' : 'list')
  try {
    if (action === 'list')      return await listReports(req, res)
    if (action === 'add-entry') return await addEntry(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[reports]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

const dayOf = (iso) => (iso || new Date().toISOString()).slice(0, 10)

// Deriva filas de embudo a partir de las llamadas reales del usuario.
function deriveFromCalls(calls, clientFilter) {
  const map = new Map()
  for (const c of calls) {
    if (clientFilter && clientFilter !== 'all' && c.client_id !== clientFilter) continue
    const date = dayOf(c.started_at || c.scheduled_at || c.created_at)
    const key = `${date}|${c.client_id || ''}`
    if (!map.has(key)) map.set(key, { id: `call-${key}`, date, client_id: c.client_id || null, scheduled: 0, realizadas: 0, offers: 0, deposits: 0, closes: 0, _derived: true })
    const r = map.get(key)
    r.scheduled += 1
    const held = c.status === 'done' || ['won', 'lost', 'follow_up'].includes(c.outcome)
    if (held) r.realizadas += 1
    if (c.offer_made) r.offers += 1
    if (c.deposit_collected) r.deposits += 1
    if (c.outcome === 'won' || c.deal_closed) r.closes += 1
  }
  return [...map.values()]
}

async function listReports(req, res) {
  const userId = req.query.userId
  const client = req.query.client || 'all'
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ rows: [] })

  const [{ data: calls }, { data: manual }] = await Promise.all([
    supabase.from('calls').select('started_at, scheduled_at, created_at, status, outcome, offer_made, deposit_collected, deal_closed, client_id').eq('user_id', userId).limit(5000),
    supabase.from('reports').select('*').eq('owner_id', userId).limit(5000),
  ])

  // Combina derivadas + manuales por (día, cliente), sumando contadores.
  const merged = new Map()
  const put = (r) => {
    const key = `${r.date}|${r.client_id || ''}`
    if (!merged.has(key)) merged.set(key, { id: r.id || key, date: r.date, client_id: r.client_id || null, scheduled: 0, realizadas: 0, offers: 0, deposits: 0, closes: 0 })
    const m = merged.get(key)
    for (const k of ['scheduled', 'realizadas', 'offers', 'deposits', 'closes']) m[k] += Number(r[k]) || 0
  }
  deriveFromCalls(calls || [], client).forEach(put)
  for (const r of (manual || [])) {
    if (client !== 'all' && (r.client_id || null) !== client) continue
    put({ ...r, date: dayOf(r.date) })
  }
  const rows = [...merged.values()].sort((a, b) => b.date.localeCompare(a.date))
  return res.status(200).json({ rows })
}

async function addEntry(req, res) {
  const { userId, entry } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  const e = entry || {}
  const date = dayOf(e.date)
  const client_id = e.client_id || null
  // Suma al día (+cliente) si ya existe. OJO: .eq('client_id', null) NO matchea
  // NULL en SQL → hay que usar .is(...,null), si no se inserta una fila nueva
  // cada vez en vez de sumar (totales del día inflados/duplicados).
  let q = supabase.from('reports').select('*').eq('owner_id', userId).eq('date', date)
  q = client_id === null ? q.is('client_id', null) : q.eq('client_id', client_id)
  const { data: existing } = await q.maybeSingle()
  const add = (k) => (Number(existing?.[k]) || 0) + (Number(e[k]) || 0)
  const row = {
    owner_id: userId, date, client_id,
    scheduled: add('scheduled'), realizadas: add('realizadas'),
    offers: add('offers'), deposits: add('deposits'), closes: add('closes'),
  }
  if (existing) {
    const { data, error } = await supabase.from('reports').update(row).eq('id', existing.id).select('*').single()
    if (error) throw new Error(error.message)
    return res.status(200).json({ row: data })
  }
  const { data, error } = await supabase.from('reports').insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return res.status(200).json({ row: data })
}
