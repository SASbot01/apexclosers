// Cliente de Workflow: secuencias de seguimiento, notificaciones y ranking.
import { API_BASE, getUserId } from './config'

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

// ── Secuencias ──
export const listSequences = () => req('/api/sequences', 'list', { query: { userId: getUserId() } })
export const saveSequence  = (sequence) => req('/api/sequences', 'upsert', { method: 'POST', body: { userId: getUserId(), sequence } }).then(d => d.sequence)
export const deleteSequence = (id) => req('/api/sequences', 'delete', { method: 'POST', query: { id }, body: { userId: getUserId() } })
export const listTasks = () => req('/api/sequences', 'tasks', { query: { userId: getUserId() } }).then(d => d.tasks || [])

// ── Notificaciones ──
export const listNotifications = () => req('/api/notifications', 'list', { query: { userId: getUserId() } })
export const markNotifRead = (id) => req('/api/notifications', 'read', { method: 'POST', body: { userId: getUserId(), id } })
export const markAllNotifRead = () => req('/api/notifications', 'read-all', { method: 'POST', body: { userId: getUserId() } })

// ── Ranking ──
export const getRanking = () => req('/api/ranking', 'global', { query: { userId: getUserId() } })
