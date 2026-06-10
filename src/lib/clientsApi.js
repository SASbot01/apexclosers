// Cliente de /api/clients — los clientes/cuentas que el closer añade a mano.
import { API_BASE, getUserId } from './config'

async function req(action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, userId: getUserId(), ...query })
  const res = await fetch(`${API_BASE}/api/clients?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `api ${res.status}`)
  return data
}

// Lista los clientes de un owner (por defecto el usuario actual). Los nombres de
// cliente son datos de escaparate (se ven en perfil/CV), así que se pueden listar
// los de otro usuario para pintar su "Cerrando para".
export const listClients  = (ownerId) => req('list', { query: ownerId ? { userId: ownerId } : {} }).then(d => d.clients || [])
export const createClient = (name, sector) => req('create', { method: 'POST', body: { userId: getUserId(), name, sector } }).then(d => d.client)
export const deleteClient = (id) => req('delete', { method: 'POST', query: { id }, body: { userId: getUserId() } })

// Opciones para selects: [{key,label}] con un "Todos" delante (como CLIENT_OPTIONS).
export const clientOptions = (clients) => [{ key: 'all', label: 'Todos' }, ...clients.map(c => ({ key: c.id, label: c.name }))]
