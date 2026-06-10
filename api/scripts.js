// /api/scripts — guiones (scripts) por cliente + resultados de llamada. El guion
// se edita por cliente y el Orbe lo afina (api/orbe?action=optimize-script).
// Persistido en las tablas `scripts` y `call_results`, por client_key.
//
// Acciones (?action=):
//   GET  get          ?userId=&clientKey=                 → { script }   (o null)
//   POST save         Body { userId, clientKey, script }  → { script }
//   GET  results      ?userId=&clientKey=                 → { results }
//   POST save-result  Body { userId, clientKey, result }  → { result }
import { supabase, supabaseReady } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'POST' ? 'save' : 'get')
  try {
    if (action === 'get')         return getScript(req, res)
    if (action === 'save')        return saveScript(req, res)
    if (action === 'results')     return listResults(req, res)
    if (action === 'save-result') return saveResult(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[scripts]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function getScript(req, res) {
  const userId = req.query.userId
  const clientKey = req.query.clientKey || null
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ script: null })
  // .eq('client_key', null) no matchea NULL → el guion general (sin cliente) no
  // recargaba. Para clientKey null usamos .is(...,null).
  let q = supabase.from('scripts').select('content, updated_at').eq('owner_id', userId)
  q = clientKey === null ? q.is('client_key', null) : q.eq('client_key', clientKey)
  const { data } = await q.maybeSingle()
  return res.status(200).json({ script: data?.content || null })
}

async function saveScript(req, res) {
  const { userId, clientKey, script } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  const row = { owner_id: userId, client_key: clientKey || null, content: script || {}, updated_at: new Date().toISOString() }
  const { data, error } = await supabase.from('scripts').upsert(row, { onConflict: 'owner_id,client_key' }).select('content').single()
  if (error) throw new Error(error.message)
  return res.status(200).json({ script: data?.content || script })
}

async function listResults(req, res) {
  const userId = req.query.userId
  const clientKey = req.query.clientKey || null
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ results: [] })
  let q = supabase.from('call_results').select('*').eq('owner_id', userId)
  if (clientKey) q = q.eq('client_key', clientKey)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  return res.status(200).json({ results: data || [] })
}

async function saveResult(req, res) {
  const { userId, clientKey, result } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  const r = result || {}
  const row = {
    owner_id: userId, client_key: clientKey || null,
    outcome: r.outcome || null, notes: r.notes || null,
    duration_min: Number.isFinite(Number(r.duration_min)) ? Number(r.duration_min) : null,
    lead_id: r.lead_id || null,
  }
  const { data, error } = await supabase.from('call_results').insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return res.status(200).json({ result: data })
}
