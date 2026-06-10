// /api/friends — invitaciones de amistad + grupos de amigos (club) para
// compartir highlights y métricas, como pidió el producto.
//
// Acciones (?action=):
//   GET  list      ?userId=                         → { friends, incoming, outgoing }
//   POST invite    Body { userId, nick|email }      → invita (friendship pending)
//   POST respond   Body { userId, requestId, accept } → acepta/rechaza
//   POST remove    Body { userId, friendId }        → elimina amistad
//   GET  groups    ?userId=                          → grupos + miembros
//   POST group-create Body { userId, name, emoji }
//   POST group-delete Body { userId, groupId }
//   POST group-add    Body { userId, groupId, memberId }
//   POST group-remove Body { userId, groupId, memberId }

import { supabase, supabaseReady } from './_lib/supabase.js'
import { computeUserMetrics } from './metrics.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action
  try {
    if (action === 'list')         return listFriends(req, res)
    if (action === 'invite')       return invite(req, res)
    if (action === 'respond')      return respond(req, res)
    if (action === 'remove')       return removeFriend(req, res)
    if (action === 'groups')       return listGroups(req, res)
    if (action === 'group-create') return groupCreate(req, res)
    if (action === 'group-delete') return groupDelete(req, res)
    if (action === 'group-add')    return groupAdd(req, res)
    if (action === 'group-remove') return groupRemove(req, res)
    if (action === 'teams')        return listTeams(req, res)
    if (action === 'team-create')  return teamCreate(req, res)
    if (action === 'team-delete')  return teamDelete(req, res)
    if (action === 'team-add')     return teamAdd(req, res)
    if (action === 'team-remove')  return teamRemove(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[friends]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

// Tarjetas básicas de perfil para un conjunto de user ids.
async function cardsFor(ids) {
  const list = [...new Set(ids.filter(Boolean))]
  if (!list.length) return {}
  const [{ data: profs }, { data: users }] = await Promise.all([
    supabase.from('profiles').select('user_id, nickname, display_name, headline, photo_url, status').in('user_id', list),
    supabase.from('users').select('id, name, email, picture').in('id', list),
  ])
  const byUser = new Map((users || []).map(u => [u.id, u]))
  const map = {}
  for (const id of list) {
    const p = (profs || []).find(x => x.user_id === id)
    const u = byUser.get(id)
    map[id] = {
      user_id: id,
      nickname: p?.nickname || null,
      display_name: p?.display_name || u?.name || u?.email?.split('@')[0] || 'Closer',
      headline: p?.headline || null,
      photo_url: p?.photo_url || u?.picture || null,
      status: p?.status || 'available',
    }
  }
  return map
}

async function listFriends(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data: rows } = await supabase.from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`).limit(500)
  const all = rows || []
  const otherId = (r) => r.requester_id === userId ? r.addressee_id : r.requester_id
  const cards = await cardsFor(all.map(otherId))
  const friends = all.filter(r => r.status === 'accepted').map(r => ({ ...cards[otherId(r)], friendshipId: r.id }))
  const incoming = all.filter(r => r.status === 'pending' && r.addressee_id === userId).map(r => ({ ...cards[r.requester_id], requestId: r.id }))
  const outgoing = all.filter(r => r.status === 'pending' && r.requester_id === userId).map(r => ({ ...cards[r.addressee_id], requestId: r.id }))
  return res.status(200).json({ friends, incoming, outgoing })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function findUser({ nick, email, targetId }) {
  if (targetId && UUID_RE.test(String(targetId))) {
    const { data } = await supabase.from('users').select('id').eq('id', targetId).maybeSingle()
    if (data) return data.id
  }
  if (nick) {
    const { data } = await supabase.from('profiles').select('user_id').ilike('nickname', String(nick).replace(/^@/, '')).maybeSingle()
    if (data) return data.user_id
  }
  if (email) {
    const { data } = await supabase.from('users').select('id').ilike('email', email).maybeSingle()
    if (data) return data.id
  }
  return null
}

async function invite(req, res) {
  const { userId, nick, email, targetId } = req.body || {}
  if (!userId || (!nick && !email && !targetId)) return res.status(400).json({ error: 'userId_and_target_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const target = await findUser({ nick, email, targetId })
  if (!target) return res.status(404).json({ error: 'user_not_found' })
  if (target === userId) return res.status(400).json({ error: 'cannot_invite_self' })
  const { data: existing } = await supabase.from('friendships')
    .select('id, status').or(`and(requester_id.eq.${userId},addressee_id.eq.${target}),and(requester_id.eq.${target},addressee_id.eq.${userId})`).maybeSingle()
  if (existing) return res.status(200).json({ ok: true, already: existing.status })
  const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: target, status: 'pending' })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true, invited: target })
}

async function respond(req, res) {
  const { userId, requestId, accept } = req.body || {}
  if (!userId || !requestId) return res.status(400).json({ error: 'userId_and_requestId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data: row } = await supabase.from('friendships').select('id, addressee_id, status').eq('id', requestId).maybeSingle()
  if (!row || row.addressee_id !== userId) return res.status(403).json({ error: 'not_your_request' })
  if (accept) {
    const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId)
    if (error) return res.status(500).json({ error: error.message })
  } else {
    await supabase.from('friendships').delete().eq('id', requestId)
  }
  return res.status(200).json({ ok: true })
}

async function removeFriend(req, res) {
  const { userId, friendId } = req.body || {}
  if (!userId || !friendId) return res.status(400).json({ error: 'userId_and_friendId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  await supabase.from('friendships').delete()
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${userId})`)
  return res.status(200).json({ ok: true })
}

// ── Grupos ────────────────────────────────────────────────────────────────
async function listGroups(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data: groups } = await supabase.from('friend_groups').select('*').eq('owner_id', userId).order('created_at')
  const ids = (groups || []).map(g => g.id)
  let membersByGroup = {}
  if (ids.length) {
    const { data: mems } = await supabase.from('friend_group_members').select('group_id, user_id').in('group_id', ids)
    const cards = await cardsFor((mems || []).map(m => m.user_id))
    for (const m of (mems || [])) (membersByGroup[m.group_id] = membersByGroup[m.group_id] || []).push(cards[m.user_id])
  }
  return res.status(200).json({ groups: (groups || []).map(g => ({ ...g, members: membersByGroup[g.id] || [] })) })
}

async function groupCreate(req, res) {
  const { userId, name, emoji } = req.body || {}
  if (!userId || !name) return res.status(400).json({ error: 'userId_and_name_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data, error } = await supabase.from('friend_groups').insert({ owner_id: userId, name, emoji: emoji || null }).select('*').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ group: { ...data, members: [] } })
}

async function groupDelete(req, res) {
  const { userId, groupId } = req.body || {}
  if (!userId || !groupId) return res.status(400).json({ error: 'userId_and_groupId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  await supabase.from('friend_groups').delete().eq('id', groupId).eq('owner_id', userId)
  return res.status(200).json({ ok: true })
}

async function ownsGroup(userId, groupId) {
  const { data } = await supabase.from('friend_groups').select('id').eq('id', groupId).eq('owner_id', userId).maybeSingle()
  return !!data
}

async function groupAdd(req, res) {
  const { userId, groupId, memberId } = req.body || {}
  if (!userId || !groupId || !memberId) return res.status(400).json({ error: 'missing_fields' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  if (!(await ownsGroup(userId, groupId))) return res.status(403).json({ error: 'not_your_group' })
  const { error } = await supabase.from('friend_group_members').upsert({ group_id: groupId, user_id: memberId }, { onConflict: 'group_id,user_id' })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}

async function groupRemove(req, res) {
  const { userId, groupId, memberId } = req.body || {}
  if (!userId || !groupId || !memberId) return res.status(400).json({ error: 'missing_fields' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  if (!(await ownsGroup(userId, groupId))) return res.status(403).json({ error: 'not_your_group' })
  await supabase.from('friend_group_members').delete().eq('group_id', groupId).eq('user_id', memberId)
  return res.status(200).json({ ok: true })
}

// ── Equipos de cliente ──────────────────────────────────────────────────────
// Un equipo trabaja UNA cuenta (client_key). A cada miembro se le comparten las
// métricas del dueño FILTRADAS a ese cliente. El marcador y el aporte de cada
// closer se calculan con computeUserMetrics(memberId, client_key) → ventas
// verificadas de ese cliente. (Las métricas de llamadas no se filtran por cliente.)
async function listTeams(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data: teams } = await supabase.from('teams').select('*').eq('owner_id', userId).order('created_at')
  const tids = (teams || []).map(t => t.id)
  const memsByTeam = {}
  let cards = {}
  if (tids.length) {
    const { data: mems } = await supabase.from('team_members').select('team_id, user_id').in('team_id', tids)
    cards = await cardsFor((mems || []).map(m => m.user_id))
    for (const m of (mems || [])) (memsByTeam[m.team_id] = memsByTeam[m.team_id] || []).push(m.user_id)
  }
  const out = []
  for (const t of (teams || [])) {
    const memberIds = memsByTeam[t.id] || []
    const members = []
    const totals = { revenue: 0, cash: 0, deals: 0, calls: 0, close_rate: null }
    for (const mid of memberIds) {
      const m = await computeUserMetrics(mid, t.client_key).catch(() => null)
      const stats = { revenue: m?.revenue || 0, deals: m?.deals || 0, cash: m?.cash_collected || 0 }
      totals.revenue += stats.revenue; totals.cash += stats.cash; totals.deals += stats.deals
      members.push({ ...(cards[mid] || { user_id: mid, display_name: 'Closer' }), stats })
    }
    out.push({ id: t.id, name: t.name, emoji: t.emoji, client_id: t.client_key, members, totals })
  }
  return res.status(200).json({ teams: out })
}

async function ownsTeam(userId, teamId) {
  const { data } = await supabase.from('teams').select('id').eq('id', teamId).eq('owner_id', userId).maybeSingle()
  return !!data
}

async function teamCreate(req, res) {
  const { userId, name, emoji, clientId } = req.body || {}
  if (!userId || !name || !clientId) return res.status(400).json({ error: 'userId_name_client_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  // Solo las CUENTAS DE CLIENTE pueden crear equipos: así queda verificado que el
  // cliente es real (se las damos nosotros) y que el closer trabaja para él.
  const { data: u } = await supabase.from('users').select('account_type').eq('id', userId).maybeSingle()
  if (u?.account_type !== 'client') return res.status(403).json({ error: 'only_clients_can_create_teams' })
  const { data, error } = await supabase.from('teams').insert({ owner_id: userId, name, emoji: emoji || null, client_key: clientId }).select('*').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ team: { id: data.id, name: data.name, emoji: data.emoji, client_id: data.client_key, members: [], totals: { revenue: 0, cash: 0, deals: 0, calls: 0, close_rate: null } } })
}

async function teamDelete(req, res) {
  const { userId, teamId } = req.body || {}
  if (!userId || !teamId) return res.status(400).json({ error: 'userId_and_teamId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  await supabase.from('teams').delete().eq('id', teamId).eq('owner_id', userId)
  return res.status(200).json({ ok: true })
}

async function teamAdd(req, res) {
  const { userId, teamId, memberId } = req.body || {}
  if (!userId || !teamId || !memberId) return res.status(400).json({ error: 'missing_fields' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  if (!(await ownsTeam(userId, teamId))) return res.status(403).json({ error: 'not_your_team' })
  const { error } = await supabase.from('team_members').upsert({ team_id: teamId, user_id: memberId }, { onConflict: 'team_id,user_id' })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}

async function teamRemove(req, res) {
  const { userId, teamId, memberId } = req.body || {}
  if (!userId || !teamId || !memberId) return res.status(400).json({ error: 'missing_fields' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  if (!(await ownsTeam(userId, teamId))) return res.status(403).json({ error: 'not_your_team' })
  await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', memberId)
  return res.status(200).json({ ok: true })
}
