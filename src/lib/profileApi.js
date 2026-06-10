// Cliente de Perfil (/api/profile) y Amigos/Grupos (/api/friends).
import { API_BASE, getUserId } from './config'
import { mockResponse } from '../data/mock/demo'

// Llama al backend; si NO hay backend (red caída o el proxy responde algo que no
// es JSON), cae a datos de demo. Un error JSON del backend real SÍ se propaga.
async function req(base, action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, ...query })
  let res
  try {
    res = await fetch(`${API_BASE}${base}?${params.toString()}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    return mockOrThrow(base, action, { query, body })
  }
  let data, ok = true
  try { data = await res.json() } catch { ok = false }
  if (!ok) return mockOrThrow(base, action, { query, body })   // proxy sin backend (no-JSON)
  if (!res.ok) throw new Error(data.error || `api ${res.status}`)
  return data
}

function mockOrThrow(base, action, ctx) {
  const m = mockResponse(base, action, ctx)
  if (m !== undefined) return m
  throw new Error('backend_unavailable')
}

// ── Perfil ──
export const getProfile    = (client) => req('/api/profile', 'get', { query: { userId: getUserId(), ...(client ? { client } : {}) } })
export const getProfileById = (userId, client) => req('/api/profile', 'get', { query: { userId, viewerId: getUserId(), ...(client ? { client } : {}) } })
export const updateProfile = (profile)  => req('/api/profile', 'update', { method: 'POST', body: { userId: getUserId(), profile } })
export const uploadPhoto   = (photo, filename) => req('/api/profile', 'upload-photo', { method: 'POST', body: { userId: getUserId(), photo, filename } })
export const setProfileStatus = (status) => req('/api/profile', 'set-status', { method: 'POST', body: { userId: getUserId(), status } })
export const searchProfiles = (q)       => req('/api/profile', 'search', { query: { q, viewerId: getUserId() } }).then(d => d.results || [])
export const getCV         = (userId)   => req('/api/profile', 'cv', { query: { userId: userId || getUserId(), viewerId: getUserId() } }).then(d => d.cv)

// ── Amigos / grupos ──
export const listFriends   = () => req('/api/friends', 'list', { query: { userId: getUserId() } })
export const invite        = ({ nick, email, targetId }) => req('/api/friends', 'invite', { method: 'POST', body: { userId: getUserId(), nick, email, targetId } })
export const respondInvite = (requestId, accept) => req('/api/friends', 'respond', { method: 'POST', body: { userId: getUserId(), requestId, accept } })
export const removeFriend  = (friendId) => req('/api/friends', 'remove', { method: 'POST', body: { userId: getUserId(), friendId } })
export const listGroups    = () => req('/api/friends', 'groups', { query: { userId: getUserId() } }).then(d => d.groups || [])
export const createGroup   = (name, emoji) => req('/api/friends', 'group-create', { method: 'POST', body: { userId: getUserId(), name, emoji } }).then(d => d.group)
export const deleteGroup   = (groupId) => req('/api/friends', 'group-delete', { method: 'POST', body: { userId: getUserId(), groupId } })
export const groupAdd      = (groupId, memberId) => req('/api/friends', 'group-add', { method: 'POST', body: { userId: getUserId(), groupId, memberId } })
export const groupRemove   = (groupId, memberId) => req('/api/friends', 'group-remove', { method: 'POST', body: { userId: getUserId(), groupId, memberId } })

// ── Equipos de cliente (closers que trabajan una misma cuenta; datos filtrados al cliente) ──
export const listTeams   = () => req('/api/friends', 'teams', { query: { userId: getUserId() } }).then(d => d.teams || [])
export const createTeam  = (name, emoji, clientId) => req('/api/friends', 'team-create', { method: 'POST', body: { userId: getUserId(), name, emoji, clientId } }).then(d => d.team)
export const deleteTeam  = (teamId) => req('/api/friends', 'team-delete', { method: 'POST', body: { userId: getUserId(), teamId } })
export const teamAdd     = (teamId, memberId) => req('/api/friends', 'team-invite', { method: 'POST', body: { userId: getUserId(), teamId, memberId } })
export const teamRemove  = (teamId, memberId) => req('/api/friends', 'team-remove', { method: 'POST', body: { userId: getUserId(), teamId, memberId } })
// Invitaciones de equipo del closer (recuadro en su perfil) + equipos donde está.
export const teamInvites = () => req('/api/friends', 'team-invites', { query: { userId: getUserId() } }).then(d => d.invites || [])
export const teamRespond = (teamId, accept) => req('/api/friends', 'team-respond', { method: 'POST', body: { userId: getUserId(), teamId, accept } })
export const myTeams     = () => req('/api/friends', 'my-teams', { query: { userId: getUserId() } }).then(d => d.teams || [])

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file)
})
