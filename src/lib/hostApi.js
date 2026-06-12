// Cliente del sistema HOST (/api/host): la página de reserva editable del closer
// y la página pública de reserva (sin sesión).
import { API_BASE, getUserId } from './config'

async function req(action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, ...query })
  const res = await fetch(`${API_BASE}/api/host?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try { data = await res.json() } catch { /* no-json */ }
  if (!res.ok) throw new Error(data.error || `api ${res.status}`)
  return data
}

// ── Dueño (editar su agenda) ──
export const getHostPage  = () => req('page', { query: { userId: getUserId() } })
export const saveHostPage = (page) => req('save', { method: 'POST', body: { userId: getUserId(), page } })

// ── Público (página de reserva) ──
export const getPublicHost = (slug) => req('public', { query: { slug } })
export const getHostSlots  = (slug, date, duration) => req('slots', { query: { slug, date, duration } }).then(d => d.slots || [])
export const bookHost      = (slug, payload) => req('book', { method: 'POST', query: { slug }, body: payload })
