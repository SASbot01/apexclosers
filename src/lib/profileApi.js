// Cliente de Perfil (/api/profile) y Amigos/Grupos (/api/friends).
import { API_BASE, USER_ID } from './config'

async function req(base, action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, ...query })
  const res = await fetch(`${API_BASE}${base}?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `api ${res.status}`)
  return data
}

// ── Perfil ──
export const getProfile    = (viewerId) => req('/api/profile', 'get', { query: { userId: USER_ID, ...(viewerId ? { viewerId } : {}) } })
export const getProfileById = (userId)  => req('/api/profile', 'get', { query: { userId, viewerId: USER_ID } })
export const updateProfile = (profile)  => req('/api/profile', 'update', { method: 'POST', body: { userId: USER_ID, profile } })
export const uploadPhoto   = (photo, filename) => req('/api/profile', 'upload-photo', { method: 'POST', body: { userId: USER_ID, photo, filename } })
export const searchProfiles = (q)       => req('/api/profile', 'search', { query: { q, viewerId: USER_ID } }).then(d => d.results || [])
export const getCV         = (userId)   => req('/api/profile', 'cv', { query: { userId: userId || USER_ID, viewerId: USER_ID } }).then(d => d.cv)

// ── Amigos / grupos ──
export const listFriends   = () => req('/api/friends', 'list', { query: { userId: USER_ID } })
export const invite        = ({ nick, email }) => req('/api/friends', 'invite', { method: 'POST', body: { userId: USER_ID, nick, email } })
export const respondInvite = (requestId, accept) => req('/api/friends', 'respond', { method: 'POST', body: { userId: USER_ID, requestId, accept } })
export const removeFriend  = (friendId) => req('/api/friends', 'remove', { method: 'POST', body: { userId: USER_ID, friendId } })
export const listGroups    = () => req('/api/friends', 'groups', { query: { userId: USER_ID } }).then(d => d.groups || [])
export const createGroup   = (name, emoji) => req('/api/friends', 'group-create', { method: 'POST', body: { userId: USER_ID, name, emoji } }).then(d => d.group)
export const deleteGroup   = (groupId) => req('/api/friends', 'group-delete', { method: 'POST', body: { userId: USER_ID, groupId } })
export const groupAdd      = (groupId, memberId) => req('/api/friends', 'group-add', { method: 'POST', body: { userId: USER_ID, groupId, memberId } })
export const groupRemove   = (groupId, memberId) => req('/api/friends', 'group-remove', { method: 'POST', body: { userId: USER_ID, groupId, memberId } })

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file)
})
