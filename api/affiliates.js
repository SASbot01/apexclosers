// /api/affiliates — programa de afiliados (tracking real de referidos). Quién
// trajo a quién se registra al hacer signup con ?ref= (ver api/auth.js). La
// comisión (20% normal · 25% comunidad) se liquidará cuando haya facturación.
//
//   GET summary ?userId=  → { referrals:[{name,nickname,date,plan,commission,status}], stats:{count,active} }
import { supabase, supabaseReady } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || 'summary'
  try {
    if (action === 'summary') return await summary(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[affiliates]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function summary(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ referrals: [], stats: { count: 0, active: 0 } })
  const { data: refs } = await supabase.from('referrals').select('*').eq('referrer_id', userId).order('created_at', { ascending: false })
  const ids = (refs || []).map(r => r.referred_id)
  const cards = {}
  if (ids.length) {
    const [{ data: profs }, { data: users }] = await Promise.all([
      supabase.from('profiles').select('user_id, nickname, display_name').in('user_id', ids),
      supabase.from('users').select('id, name, email').in('id', ids),
    ])
    const byU = new Map((users || []).map(u => [u.id, u]))
    for (const id of ids) {
      const p = (profs || []).find(x => x.user_id === id)
      const u = byU.get(id)
      cards[id] = { name: p?.display_name || u?.name || u?.email?.split('@')[0] || 'Closer', nickname: p?.nickname || null }
    }
  }
  const referrals = (refs || []).map(r => ({
    id: r.id,
    name: cards[r.referred_id]?.name || 'Closer',
    nickname: cards[r.referred_id]?.nickname || null,
    date: r.created_at,
    plan: r.plan || '—',
    commission: r.commission || 20,
    status: r.status || 'active',
  }))
  const stats = { count: referrals.length, active: referrals.filter(r => r.status === 'active').length }
  return res.status(200).json({ referrals, stats })
}
