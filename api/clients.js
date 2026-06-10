// /api/clients — clientes/cuentas del closer, añadidos A MANO (por ahora). Más
// adelante los propios clientes confirmarán que trabajan con el closer. Tabla
// `clients` (owner_id, name, sector). El id es la clave que etiqueta ventas/leads
// y equipos (client_id / client_key) para las métricas filtradas por cliente.
import { supabase, supabaseReady } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'POST' ? 'create' : 'list')
  try {
    if (action === 'list')   return listClients(req, res)
    if (action === 'create') return createClient(req, res)
    if (action === 'delete') return deleteClient(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[clients]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function listClients(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ clients: [] })
  const { data, error } = await supabase.from('clients').select('id, name, sector, created_at').eq('owner_id', userId).order('created_at')
  if (error) throw new Error(error.message)
  return res.status(200).json({ clients: data || [] })
}

async function createClient(req, res) {
  const { userId, name, sector } = req.body || {}
  if (!userId || !name) return res.status(400).json({ error: 'userId_and_name_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data, error } = await supabase.from('clients')
    .insert({ owner_id: userId, name: String(name).slice(0, 120), sector: sector ? String(sector).slice(0, 80) : null })
    .select('id, name, sector, created_at').single()
  if (error) throw new Error(error.message)
  return res.status(200).json({ client: data })
}

async function deleteClient(req, res) {
  const { userId } = req.body || {}
  const id = req.query.id
  if (!userId || !id) return res.status(400).json({ error: 'userId_and_id_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { error } = await supabase.from('clients').delete().eq('id', id).eq('owner_id', userId)
  if (error) throw new Error(error.message)
  return res.status(200).json({ ok: true })
}
