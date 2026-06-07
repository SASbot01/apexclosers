// Cliente del API de Recall (/api/recall). Si el backend no está disponible
// (p.ej. `vite dev` local sin funciones), los hooks caen a datos mock.
import { API_BASE, getUserId } from './config'

async function call(action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, ...query })
  const res = await fetch(`${API_BASE}/api/recall?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`api ${res.status}`)
  return res.json()
}

export const listCalls = () => call('list', { query: { userId: getUserId() } }).then(d => d.calls)
export const getCall = (id) => call('get', { query: { id, userId: getUserId() } })
export const startRecording = (meetingUrl, title) =>
  call('start', { method: 'POST', body: { userId: getUserId(), meetingUrl, title } })
