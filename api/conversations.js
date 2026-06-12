// /api/conversations — hilos de conversación por cliente/proyecto (la "memoria"
// que el closer va construyendo sobre un cliente). Persistido en la tabla
// `conversations`, identificado por client_key (clave de texto de la UI).
//
// Acciones (?action=):
//   GET  list    ?userId=&clientKey=                    → { conversations }
//   POST upsert  Body { userId, clientKey, conversation } → { conversation }
//   POST delete  ?id=  Body { userId }                  → { ok }
import { supabase, supabaseReady } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'POST' ? 'upsert' : 'list')
  try {
    if (action === 'list')   return await listConversations(req, res)
    if (action === 'upsert') return await upsertConversation(req, res)
    if (action === 'delete') return await deleteConversation(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[conversations]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function listConversations(req, res) {
  const userId = req.query.userId
  const clientKey = req.query.clientKey || null
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ conversations: [] })
  let q = supabase.from('conversations').select('id, title, messages, created_at, updated_at, client_key').eq('owner_id', userId)
  if (clientKey) q = q.eq('client_key', clientKey)
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  return res.status(200).json({ conversations: data || [] })
}

async function upsertConversation(req, res) {
  const { userId, clientKey, conversation } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  const c = conversation || {}
  const row = {
    owner_id: userId,
    client_key: clientKey || null,
    title: (c.title || 'Conversación').slice(0, 120),
    messages: Array.isArray(c.messages) ? c.messages.map(m => ({ role: m.role, body: String(m.body || ''), ts: m.ts || Date.now() })) : [],
    updated_at: new Date().toISOString(),
  }
  if (c.id && /^[0-9a-f-]{36}$/i.test(c.id)) row.id = c.id
  const { data, error } = await supabase.from('conversations').upsert(row).select('id, title, messages, created_at, updated_at, client_key').single()
  if (error) throw new Error(error.message)
  return res.status(200).json({ conversation: data })
}

async function deleteConversation(req, res) {
  const { userId } = req.body || {}
  const id = req.query.id
  if (!userId || !id) return res.status(400).json({ error: 'userId_and_id_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { error } = await supabase.from('conversations').delete().eq('id', id).eq('owner_id', userId)
  if (error) throw new Error(error.message)
  return res.status(200).json({ ok: true })
}
