// /api/ranking — Ranking Global de closers por ventas VERIFICADAS. Solo entra
// en el ranking quien tenga ventas verificadas; se muestra con su perfil público.
//
// Acciones (?action=):
//   GET global  [&userId=]  → { ranking:[{rank,user_id,name,nickname,photo_url,revenue,deals}], me }

import { supabase, supabaseReady } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    return globalRanking(req, res)
  } catch (e) {
    console.error('[ranking]', e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function globalRanking(req, res) {
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const userId = req.query.userId
  const scope = req.query.scope === 'friends' ? 'friends' : 'global'

  // Ámbito "amigos": solo tú + tus amigos aceptados.
  let allow = null
  if (scope === 'friends' && userId) {
    const { data: fr } = await supabase.from('friendships')
      .select('requester_id, addressee_id').eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    allow = new Set([userId, ...(fr || []).map(f => f.requester_id === userId ? f.addressee_id : f.requester_id)])
  }

  // TODOS los closers entran en el ranking (aunque tengan 0), no solo los que
  // ya tienen ventas verificadas. Partimos de la lista de usuarios reales.
  const DEMO_SEED = '00000000-0000-0000-0000-000000000001'
  const [{ data: allUsers }, { data: profs }, { data: sales }] = await Promise.all([
    supabase.from('users').select('id, name, email, picture, account_type').limit(5000),
    supabase.from('profiles').select('user_id, nickname, display_name, photo_url, status').limit(5000),
    supabase.from('sales').select('owner_id, revenue, cash_collected').eq('status', 'verified').limit(20000),
  ])
  const profById = new Map((profs || []).map(p => [p.user_id, p]))

  // Candidatos: usuarios reales (sin la cuenta demo); en ámbito amigos, solo los permitidos.
  const candidates = (allUsers || [])
    .filter(u => u.id !== DEMO_SEED)
    .filter(u => u.account_type !== 'client')   // el ranking es de CLOSERS, no de cuentas de cliente
    .filter(u => !allow || allow.has(u.id))

  // Agregado de ventas verificadas por closer (0 si no tiene).
  const agg = new Map()
  for (const s of (sales || [])) {
    const a = agg.get(s.owner_id) || { revenue: 0, cash: 0, deals: 0 }
    a.revenue += Number(s.revenue) || 0
    a.cash += Number(s.cash_collected) || 0
    a.deals += 1
    agg.set(s.owner_id, a)
  }

  const rows = candidates.map(u => {
    const a = agg.get(u.id) || { revenue: 0, cash: 0, deals: 0 }
    const p = profById.get(u.id)
    return {
      owner_id: u.id, revenue: a.revenue, cash: a.cash, deals: a.deals,
      nickname: p?.nickname || null,
      name: p?.display_name || u.name || u.email?.split('@')[0] || 'Closer',
      photo_url: p?.photo_url || u.picture || null,
      status: p?.status || 'available',
    }
  }).sort((a, b) => b.revenue - a.revenue || b.deals - a.deals || a.name.localeCompare(b.name))

  const ranking = rows.map((r, i) => ({ rank: i + 1, user_id: r.owner_id, revenue: r.revenue, cash: r.cash, deals: r.deals, nickname: r.nickname, name: r.name, photo_url: r.photo_url, status: r.status }))
  const me = req.query.userId ? ranking.find(r => r.user_id === req.query.userId) || null : null
  return res.status(200).json({ ranking: ranking.slice(0, 100), me })
}
