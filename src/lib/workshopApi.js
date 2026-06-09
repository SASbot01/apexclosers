// Cliente del Workshop (/api/workshop): resumen de habilidades con datos reales
// + hilos guardados del chat-coach. Lanza si no hay backend (la página cae a los
// datos demo para que el preview sin backend siga viéndose lleno).
import { API_BASE, getUserId } from './config'

async function req(action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, ...query })
  const res = await fetch(`${API_BASE}/api/workshop?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()   // lanza si el proxy no devuelve JSON (sin backend)
  if (!res.ok) throw new Error(data.error || `api ${res.status}`)
  return data
}

export const getWorkshop = (period, client) =>
  req('summary', { query: { userId: getUserId(), period: period || 'this_year', client: client || 'all' } })

export const listCoachChats = () =>
  req('chats', { query: { userId: getUserId() } }).then(d => d.chats || [])

export const saveCoachChat = (chat) =>
  req('chat-save', { method: 'POST', body: { userId: getUserId(), id: chat.id, title: chat.title, messages: chat.messages } }).then(d => d.chat)

export const deleteCoachChat = (id) =>
  req('chat-del', { method: 'POST', query: { id }, body: { userId: getUserId() } })
