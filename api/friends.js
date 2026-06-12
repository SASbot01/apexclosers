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
import { notify } from './_lib/workflow.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action
  try {
    if (action === 'list')         return await listFriends(req, res)
    if (action === 'invite')       return await invite(req, res)
    if (action === 'respond')      return await respond(req, res)
    if (action === 'remove')       return await removeFriend(req, res)
    if (action === 'groups')       return await listGroups(req, res)
    if (action === 'group-create') return await groupCreate(req, res)
    if (action === 'group-delete') return await groupDelete(req, res)
    if (action === 'group-add')    return await groupAdd(req, res)
    if (action === 'group-remove') return await groupRemove(req, res)
    if (action === 'teams')        return await listTeams(req, res)
    if (action === 'team-create')  return await teamCreate(req, res)
    if (action === 'team-delete')  return await teamDelete(req, res)
    if (action === 'team-add')     return await teamInvite(req, res)
    if (action === 'team-invite')  return await teamInvite(req, res)
    if (action === 'team-remove')  return await teamRemove(req, res)
    if (action === 'team-invites') return await teamInvites(req, res)   // pendientes del closer
    if (action === 'team-respond') return await teamRespond(req, res)   // closer acepta/rechaza
    if (action === 'my-teams')     return await myTeams(req, res)       // equipos donde está el closer
    if (action === 'team-chat')      return await teamChatList(req, res)
    if (action === 'team-chat-send') return await teamChatSend(req, res)
    if (action === 'company-crm')    return await companyCrm(req, res)     // CRM de empresa
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
    supabase.from('users').select('id, name, email, picture, account_type').in('id', list),
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
      account_type: u?.account_type || 'closer',
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
    const { data: mems } = await supabase.from('team_members').select('team_id, user_id, status').in('team_id', tids)
    cards = await cardsFor((mems || []).map(m => m.user_id))
    for (const m of (mems || [])) (memsByTeam[m.team_id] = memsByTeam[m.team_id] || []).push(m)
  }
  const out = []
  for (const t of (teams || [])) {
    const mem = memsByTeam[t.id] || []
    const members = []
    const totals = { revenue: 0, cash: 0, deals: 0, calls: 0, close_rate: null }
    for (const mm of mem) {
      const mid = mm.user_id
      const accepted = (mm.status || 'accepted') === 'accepted'
      const m = accepted ? await computeUserMetrics(mid, t.client_key).catch(() => null) : null
      const stats = { revenue: m?.revenue || 0, deals: m?.deals || 0, cash: m?.cash_collected || 0 }
      if (accepted) { totals.revenue += stats.revenue; totals.cash += stats.cash; totals.deals += stats.deals }
      members.push({ ...(cards[mid] || { user_id: mid, display_name: 'Closer' }), stats, status: mm.status || 'accepted' })
    }
    out.push({ id: t.id, name: t.name, emoji: t.emoji, client_id: t.client_key, members, totals })
  }
  return res.status(200).json({ teams: out })
}

async function ownsTeam(userId, teamId) {
  const { data } = await supabase.from('teams').select('id').eq('id', teamId).eq('owner_id', userId).maybeSingle()
  return !!data
}

// Equipos donde el CLOSER es miembro ACEPTADO (para verlos en su perfil).
async function myTeams(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ teams: [] })
  const { data: mems } = await supabase.from('team_members').select('team_id').eq('user_id', userId).eq('status', 'accepted')
  const tids = [...new Set((mems || []).map(m => m.team_id))]
  if (!tids.length) return res.status(200).json({ teams: [] })
  const { data: teams } = await supabase.from('teams').select('id, name, emoji, owner_id, client_key').in('id', tids)
  const owners = await cardsFor((teams || []).map(t => t.owner_id))
  return res.status(200).json({ teams: (teams || []).map(t => ({ id: t.id, name: t.name, emoji: t.emoji, client_key: t.client_key, company: owners[t.owner_id] || null })) })
}

// Invitaciones de equipo PENDIENTES del closer (recuadro en su perfil).
async function teamInvites(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(200).json({ invites: [] })
  const { data: mems } = await supabase.from('team_members').select('team_id').eq('user_id', userId).eq('status', 'pending')
  const tids = [...new Set((mems || []).map(m => m.team_id))]
  if (!tids.length) return res.status(200).json({ invites: [] })
  const { data: teams } = await supabase.from('teams').select('id, name, emoji, owner_id').in('id', tids)
  const owners = await cardsFor((teams || []).map(t => t.owner_id))
  return res.status(200).json({ invites: (teams || []).map(t => ({ teamId: t.id, name: t.name, emoji: t.emoji, company: owners[t.owner_id] || null })) })
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

// La empresa INVITA a un closer a su equipo → queda 'pending' y le llega una
// notificación; el closer lo acepta/rechaza desde su perfil (como un amigo).
async function teamInvite(req, res) {
  const { userId, teamId, memberId } = req.body || {}
  if (!userId || !teamId || !memberId) return res.status(400).json({ error: 'missing_fields' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  if (!(await ownsTeam(userId, teamId))) return res.status(403).json({ error: 'not_your_team' })
  const { error } = await supabase.from('team_members').upsert({ team_id: teamId, user_id: memberId, status: 'pending' }, { onConflict: 'team_id,user_id' })
  if (error) return res.status(500).json({ error: error.message })
  // Notifica al closer.
  const { data: team } = await supabase.from('teams').select('name').eq('id', teamId).maybeSingle()
  const company = (await cardsFor([userId]))[userId]
  await notify(memberId, {
    kind: 'team_invite',
    title: 'Invitación a un equipo',
    body: `${company?.display_name || 'Una empresa'} te invita a su equipo${team?.name ? ` "${team.name}"` : ''}. Acéptala desde tu perfil.`,
    link: '/perfil?tab=equipo',
  }).catch(() => {})
  return res.status(200).json({ ok: true })
}

// Acceso al chat: dueño del equipo (empresa) o miembro ACEPTADO.
async function canAccessTeam(userId, teamId) {
  if (await ownsTeam(userId, teamId)) return true
  const { data } = await supabase.from('team_members').select('status').eq('team_id', teamId).eq('user_id', userId).eq('status', 'accepted').maybeSingle()
  return !!data
}

async function teamChatList(req, res) {
  const { userId, teamId } = req.query
  if (!userId || !teamId) return res.status(400).json({ error: 'userId_and_teamId_required' })
  if (!supabaseReady()) return res.status(200).json({ messages: [] })
  if (!(await canAccessTeam(userId, teamId))) return res.status(403).json({ error: 'no_access' })
  const { data: msgs } = await supabase.from('team_messages').select('*').eq('team_id', teamId).order('created_at').limit(500)
  const cards = await cardsFor((msgs || []).map(m => m.user_id))
  return res.status(200).json({ messages: (msgs || []).map(m => ({ id: m.id, user_id: m.user_id, body: m.body, created_at: m.created_at, author: cards[m.user_id]?.display_name || 'Usuario' })) })
}

async function teamChatSend(req, res) {
  const { userId, teamId, body } = req.body || {}
  if (!userId || !teamId || !body?.trim()) return res.status(400).json({ error: 'missing_fields' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  if (!(await canAccessTeam(userId, teamId))) return res.status(403).json({ error: 'no_access' })
  const { data, error } = await supabase.from('team_messages').insert({ team_id: teamId, user_id: userId, body: String(body).slice(0, 2000) }).select('*').single()
  if (error) throw new Error(error.message)
  // Notifica a los demás miembros (empresa + closers aceptados) que hay mensaje.
  try {
    const { data: team } = await supabase.from('teams').select('owner_id, name').eq('id', teamId).maybeSingle()
    const { data: mems } = await supabase.from('team_members').select('user_id').eq('team_id', teamId).eq('status', 'accepted')
    const recipients = new Set([team?.owner_id, ...(mems || []).map(m => m.user_id)].filter(Boolean))
    recipients.delete(userId)
    const author = (await cardsFor([userId]))[userId]?.display_name || 'Alguien'
    for (const r of recipients) await notify(r, { kind: 'team_chat', title: `Mensaje en ${team?.name || 'tu equipo'}`, body: `${author}: ${String(body).slice(0, 80)}`, link: '/perfil?tab=equipo' }).catch(() => {})
  } catch { /* best-effort */ }
  return res.status(200).json({ message: data })
}

// El closer acepta o rechaza la invitación de equipo.
async function teamRespond(req, res) {
  const { userId, teamId, accept } = req.body || {}
  if (!userId || !teamId) return res.status(400).json({ error: 'userId_and_teamId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data: row } = await supabase.from('team_members').select('status').eq('team_id', teamId).eq('user_id', userId).maybeSingle()
  if (!row) return res.status(404).json({ error: 'invite_not_found' })
  if (accept) await supabase.from('team_members').update({ status: 'accepted' }).eq('team_id', teamId).eq('user_id', userId)
  else await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)
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

// ── CRM de EMPRESA ───────────────────────────────────────────────────────────
// Devuelve TODOS los leads de los closers que la empresa tiene en sus equipos
// (membresía aceptada), etiquetados por closer y por proyecto (= teams.client_key),
// para que la empresa filtre por closer y por proyecto. La empresa solo ve a los
// closers que aceptaron entrar en alguno de sus equipos.
async function companyCrm(req, res) {
  const userId = req.query.userId    // la cuenta de empresa (dueña de los equipos)
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })

  // 1) Equipos de la empresa → proyecto (client_key) de cada uno.
  const { data: teams } = await supabase.from('teams').select('id, name, client_key').eq('owner_id', userId)
  const projects = []   // [{ key, name }]
  const teamProject = new Map()   // team_id → { key, name }
  for (const t of (teams || [])) {
    const proj = { key: t.client_key, name: t.name || t.client_key }
    teamProject.set(t.id, proj)
    if (t.client_key && !projects.some(p => p.key === t.client_key)) projects.push(proj)
  }
  const teamIds = (teams || []).map(t => t.id)
  if (!teamIds.length) return res.status(200).json({ leads: [], closers: [], projects: [] })

  // 2) Miembros ACEPTADOS → de qué proyectos (client_keys) es cada closer en ESTA empresa.
  const { data: mems } = await supabase.from('team_members').select('team_id, user_id, status').in('team_id', teamIds).eq('status', 'accepted')
  const closerProjects = new Map()   // closerId → Set(client_key)
  for (const m of (mems || [])) {
    const proj = teamProject.get(m.team_id)
    if (!proj) continue
    if (!closerProjects.has(m.user_id)) closerProjects.set(m.user_id, new Set())
    if (proj.key) closerProjects.get(m.user_id).add(proj.key)
  }
  const closerIds = [...closerProjects.keys()]
  if (!closerIds.length) return res.status(200).json({ leads: [], closers: [], projects })

  // 3) Leads de esos closers + tarjetas de perfil.
  const [{ data: leadsRaw }, cards] = await Promise.all([
    supabase.from('leads').select('*').in('owner_id', closerIds).order('last_at', { ascending: false, nullsFirst: false }).limit(5000),
    cardsFor(closerIds),
  ])

  const projName = (key) => projects.find(p => p.key === key)?.name || key
  const leads = (leadsRaw || []).map(l => {
    const owned = closerProjects.get(l.owner_id) || new Set()
    // Proyecto del lead: el suyo si pertenece a esta empresa; si no, el único del
    // closer en la empresa; si trabaja varios, queda sin asignar.
    let projectKey = l.project && owned.has(l.project) ? l.project : (owned.size === 1 ? [...owned][0] : null)
    return {
      ...l,
      closer_id: l.owner_id,
      closer_name: cards[l.owner_id]?.display_name || 'Closer',
      closer_photo: cards[l.owner_id]?.photo_url || null,
      project: projectKey,
      project_name: projectKey ? projName(projectKey) : null,
    }
  })

  const closers = closerIds.map(id => ({
    id, name: cards[id]?.display_name || 'Closer', photo_url: cards[id]?.photo_url || null,
    projects: [...(closerProjects.get(id) || [])],
  }))

  return res.status(200).json({ leads, closers, projects })
}
