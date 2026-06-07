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

  const { data: sales } = await supabase.from('sales')
    .select('owner_id, revenue, cash_collected').eq('status', 'verified').limit(20000)

  // Agregamos por closer en memoria (escala de dogfooding).
  const agg = new Map()
  for (const s of (sales || [])) {
    if (allow && !allow.has(s.owner_id)) continue
    const a = agg.get(s.owner_id) || { owner_id: s.owner_id, revenue: 0, cash: 0, deals: 0 }
    a.revenue += Number(s.revenue) || 0
    a.cash += Number(s.cash_collected) || 0
    a.deals += 1
    agg.set(s.owner_id, a)
  }
  const rows = [...agg.values()].sort((a, b) => b.revenue - a.revenue)
  const ids = rows.map(r => r.owner_id)

  // Tarjetas de perfil (nick, nombre, foto).
  let cards = {}
  if (ids.length) {
    const [{ data: profs }, { data: users }] = await Promise.all([
      supabase.from('profiles').select('user_id, nickname, display_name, photo_url').in('user_id', ids),
      supabase.from('users').select('id, name, email, picture').in('id', ids),
    ])
    const byUser = new Map((users || []).map(u => [u.id, u]))
    for (const id of ids) {
      const p = (profs || []).find(x => x.user_id === id)
      const u = byUser.get(id)
      cards[id] = {
        nickname: p?.nickname || null,
        name: p?.display_name || u?.name || u?.email?.split('@')[0] || 'Closer',
        photo_url: p?.photo_url || u?.picture || null,
      }
    }
  }

  const ranking = rows.map((r, i) => ({ rank: i + 1, user_id: r.owner_id, revenue: r.revenue, cash: r.cash, deals: r.deals, ...cards[r.owner_id] }))
  const me = req.query.userId ? ranking.find(r => r.user_id === req.query.userId) || null : null
  return res.status(200).json({ ranking: ranking.slice(0, 100), me })
}
