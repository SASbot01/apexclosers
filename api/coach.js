// /api/coach — utilidades del RAG del coach.
//   GET reindex ?userId=  → (re)indexa todas las llamadas 'done' del usuario
//   GET status  ?userId=  → nº de fragmentos indexados
import { supabase, supabaseReady } from './_lib/supabase.js'
import { indexCall } from './_lib/coachRag.js'
import { embedReady } from './_lib/embeddings.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || 'status'
  try {
    if (action === 'reindex') return reindex(req, res)
    if (action === 'status')  return status(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[coach]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function reindex(req, res) {
  const userId = req.query.userId || req.body?.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  if (!embedReady()) return res.status(200).json({ ok: false, error: 'no_embeddings' })
  const { data: calls } = await supabase.from('calls')
    .select('id, user_id, title, started_at, scheduled_at, created_at, transcript, summary, feedback')
    .eq('user_id', userId).eq('status', 'done').limit(500)
  let total = 0, indexed = 0
  for (const c of (calls || [])) {
    const n = await indexCall({ ...c, started_at: c.started_at || c.scheduled_at || c.created_at }).catch(() => 0)
    total += n
    if (n) indexed++
  }
  return res.status(200).json({ ok: true, calls: (calls || []).length, indexed, chunks: total })
}

async function status(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ chunks: 0 })
  const { count } = await supabase.from('call_chunks').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  return res.status(200).json({ chunks: count || 0, embeddings: embedReady() })
}
