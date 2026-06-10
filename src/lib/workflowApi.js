// Cliente de Workflow: secuencias de seguimiento, notificaciones y ranking.
import { API_BASE, getUserId } from './config'
import { mockResponse } from '../data/mock/demo'

// Backend con fallback a demo si no hay backend (ver profileApi para el detalle).
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
    return mockOrThrow(base, action, { query, body }, method)
  }
  let data, ok = true
  try { data = await res.json() } catch { ok = false }
  if (!ok) return mockOrThrow(base, action, { query, body }, method)
  if (!res.ok) throw new Error(data.error || `api ${res.status}`)
  return data
}

// Demo SOLO en lecturas (GET). En escrituras nunca fingimos éxito: si no hay
// backend, propagamos el error para que la UI no diga "guardado" en falso.
function mockOrThrow(base, action, ctx, method = 'GET') {
  if (method === 'GET') {
    const m = mockResponse(base, action, ctx)
    if (m !== undefined) return m
  }
  throw new Error('backend_unavailable')
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

// ── Ranking ── scope: 'global' | 'friends'
export const getRanking = (scope = 'global') => req('/api/ranking', 'global', { query: { userId: getUserId(), scope } })
