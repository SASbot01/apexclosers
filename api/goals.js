// /api/goals — objetivos mensuales del usuario (Home / Ajustes). Un set por
// usuario; el Home lo escala al periodo del filtro. Si no hay fila, devuelve los
// valores semilla para que el front pinte algo coherente.
import { supabase, supabaseReady } from './_lib/supabase.js'

const DEFAULTS = { calls: 12, closes: 4, cash: 6000, extra: {} }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'POST' ? 'set' : 'get')
  try {
    if (action === 'get') return getGoals(req, res)
    if (action === 'set') return setGoals(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[goals]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function getGoals(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ goals: DEFAULTS })
  const { data } = await supabase.from('goals').select('*').eq('user_id', userId).maybeSingle()
  return res.status(200).json({ goals: data || DEFAULTS })
}

async function setGoals(req, res) {
  const { userId, goals } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  const row = {
    user_id: userId,
    calls: Number(goals?.calls) || 0,
    closes: Number(goals?.closes) || 0,
    cash: Number(goals?.cash) || 0,
    extra: goals?.extra && typeof goals.extra === 'object' ? goals.extra : {},
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('goals').upsert(row, { onConflict: 'user_id' }).select('*').single()
  if (error) throw new Error(error.message)
  return res.status(200).json({ goals: data })
}
