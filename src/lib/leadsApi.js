// Cliente del CRM (/api/leads). Si no hay backend, los hooks/páginas caen a mock.
import { API_BASE, USER_ID } from './config'

async function call(action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, ...query })
  const res = await fetch(`${API_BASE}/api/leads?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`api ${res.status}`)
  return res.json()
}

export const listLeads = () => call('list', { query: { userId: USER_ID } }).then(d => d.leads || [])
export const saveLead = (lead) => call('upsert', { method: 'POST', body: { userId: USER_ID, lead } }).then(d => d.lead)
export const deleteLead = (id) => call('delete', { method: 'POST', query: { id }, body: { userId: USER_ID } })
