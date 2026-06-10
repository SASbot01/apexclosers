// Cliente de /api/offers — ofertas de trabajo que publican las cuentas de cliente.
import { API_BASE, getUserId } from './config'

async function req(action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, ...query })
  const res = await fetch(`${API_BASE}/api/offers?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `api ${res.status}`)
  return data
}

// Ofertas abiertas (tablón para closers) o las de un cliente concreto (?ownerId).
export const listOffers = (ownerId) => req('list', { query: ownerId ? { ownerId } : {} }).then(d => d.offers || [])
export const saveOffer  = (offer) => req('create', { method: 'POST', body: { userId: getUserId(), offer } }).then(d => d.offer)
export const deleteOffer = (id) => req('delete', { method: 'POST', query: { id }, body: { userId: getUserId() } })
