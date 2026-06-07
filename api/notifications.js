// /api/notifications — campana de notificaciones del closer.
//
// Acciones (?action=):
//   GET  list      ?userId= [&unread=1]   → { notifications, unread }
//   POST read      Body { userId, id }     → marca una leída
//   POST read-all  Body { userId }         → marca todas leídas

import { supabase, supabaseReady } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'POST' ? 'read' : 'list')
  try {
    if (action === 'list')     return listNotif(req, res)
    if (action === 'read')     return markRead(req, res)
    if (action === 'read-all') return markAll(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[notifications]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function listNotif(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  let q = supabase.from('notifications').select('*').eq('user_id', userId)
  if (req.query.unread) q = q.eq('read', false)
  const { data } = await q.order('created_at', { ascending: false }).limit(50)
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false)
  return res.status(200).json({ notifications: data || [], unread: count || 0 })
}

async function markRead(req, res) {
  const { userId, id } = req.body || {}
  if (!userId || !id) return res.status(400).json({ error: 'userId_and_id_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  await supabase.from('notifications').update({ read: true }).eq('id', id).eq('user_id', userId)
  return res.status(200).json({ ok: true })
}

async function markAll(req, res) {
  const { userId } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
  return res.status(200).json({ ok: true })
}
