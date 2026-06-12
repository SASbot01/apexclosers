// /api/ranking — Ranking Global de closers por APEX ELO (no por cash collected).
// El Elo combina TODAS las métricas reales (resultado, eficiencia, habilidad del
// workshop, consistencia) con decaimiento por inactividad: a un closer inactivo
// le adelantan los activos y, si lleva >30 días parado, no se sostiene arriba.
// Ver api/_lib/elo.js para el algoritmo.
//
// Acciones (?action=):
//   GET global  [&userId=] [&scope=friends] → { ranking:[{rank,user_id,name,nickname,photo_url,elo,...}], me }

import { supabase, supabaseReady } from './_lib/supabase.js'
import { computeApexElo } from './_lib/elo.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    return await globalRanking(req, res)
  } catch (e) {
    console.error('[ranking]', e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

// Reparte filas por una clave en un Map de arrays.
function groupBy(rows, key) {
  const m = new Map()
  for (const r of rows || []) {
    const k = r[key]
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(r)
  }
  return m
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

  const DEMO_SEED = '00000000-0000-0000-0000-000000000001'
  const [{ data: allUsers }, { data: profs }] = await Promise.all([
    supabase.from('users').select('id, name, email, picture, account_type').limit(5000),
    supabase.from('profiles').select('user_id, nickname, display_name, photo_url, status').limit(5000),
  ])
  const profById = new Map((profs || []).map(p => [p.user_id, p]))

  // Candidatos: closers reales (sin la cuenta demo ni cuentas de cliente).
  const candidates = (allUsers || [])
    .filter(u => u.id !== DEMO_SEED)
    .filter(u => u.account_type !== 'client')
    .filter(u => !allow || allow.has(u.id))
  const ids = candidates.map(u => u.id)
  if (!ids.length) return res.status(200).json({ ranking: [], me: null })

  // Datos para el Elo: ventas verificadas (revenue/cash, todo el histórico),
  // llamadas y leads de los últimos 120 días (ventana de "forma" reciente).
  const since = new Date(Date.now() - 120 * 86400 * 1000).toISOString()
  const [salesRes, callsRes, leadsRes] = await Promise.all([
    supabase.from('sales').select('owner_id, revenue, cash_collected, date').eq('status', 'verified').in('owner_id', ids).limit(50000),
    supabase.from('calls').select('user_id, status, outcome, state, offer_made, deal_closed, skills, objections, started_at')
      .in('user_id', ids).or(`started_at.gte.${since},started_at.is.null`).limit(50000),
    supabase.from('leads').select('owner_id, stage, last_at').in('owner_id', ids).limit(50000),
  ])
  const salesBy = groupBy(salesRes.data, 'owner_id')
  const callsBy = groupBy(callsRes.data, 'user_id')
  const leadsBy = groupBy(leadsRes.data, 'owner_id')

  const closers = candidates.map(u => ({
    userId: u.id,
    sales: salesBy.get(u.id) || [],
    calls: callsBy.get(u.id) || [],
    leads: leadsBy.get(u.id) || [],
  }))

  const { ratings } = computeApexElo(closers)

  const ranking = ratings.map(r => {
    const u = candidates.find(c => c.id === r.userId)
    const p = profById.get(r.userId)
    return {
      rank: r.rank,
      user_id: r.userId,
      elo: r.elo,
      ranked: r.ranked,
      form: r.form,
      confidence: r.confidence,
      activity: r.activity,
      inactive: r.inactive,
      dead: r.dead,
      days_since: r.daysSince,
      breakdown: r.breakdown,
      revenue: r.revenue,
      cash: r.cash,
      deals: r.deals,
      close_rate: r.closeRate,
      nickname: p?.nickname || null,
      name: p?.display_name || u?.name || u?.email?.split('@')[0] || 'Closer',
      photo_url: p?.photo_url || u?.picture || null,
      status: p?.status || 'available',
    }
  })

  const me = userId ? ranking.find(r => r.user_id === userId) || null : null
  return res.status(200).json({ ranking: ranking.slice(0, 100), me })
}
