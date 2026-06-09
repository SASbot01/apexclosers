// Cliente del embudo / reportes (/api/reports). El backend combina lo derivado
// de las llamadas reales con lo registrado a mano. Lanza si no hay backend.
import { API_BASE, getUserId } from './config'

async function req(action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, userId: getUserId(), ...query })
  const res = await fetch(`${API_BASE}/api/reports?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `api ${res.status}`)
  return data
}

export const listReports = (client) => req('list', { query: { client: client || 'all' } }).then(d => d.rows || [])
export const addReportEntry = (entry) => req('add-entry', { method: 'POST', body: { userId: getUserId(), entry } }).then(d => d.row)
