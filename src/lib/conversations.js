import { useState, useCallback, useEffect } from 'react'
import { API_BASE, getUserId } from './config'

/*
 * Conversaciones por cliente/proyecto (la "memoria" que el closer construye sobre
 * un cliente). Persistidas en la tabla `conversations` (/api/conversations) por
 * client_key; localStorage actúa como caché para render instantáneo / offline.
 * El chat responde con IA real vía el Orbe (/api/orbe).
 *
 * Forma cache: { [clientId]: [ { id, title, messages:[{role,body,ts}], created_at } ] }
 */
const KEY = 'apex_closer_conversations'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)) } catch { /* off */ } }
const setCache = (clientId, list) => { const all = read(); all[clientId] = list; write(all) }

// ── Backend ──
async function apiList(clientKey) {
  const params = new URLSearchParams({ action: 'list', userId: getUserId(), clientKey })
  const res = await fetch(`${API_BASE}/api/conversations?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'api')
  return data.conversations || []
}
async function apiUpsert(clientKey, conversation) {
  const res = await fetch(`${API_BASE}/api/conversations?action=upsert`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: getUserId(), clientKey, conversation }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'api')
  return data.conversation
}
async function orbeReply(messages) {
  const res = await fetch(`${API_BASE}/api/orbe?action=chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: getUserId(), messages: messages.map(m => ({ role: m.role, body: m.body })) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.reply) throw new Error(data.error || 'no_reply')
  return data.reply
}

export function listConversations(clientId) { return read()[clientId] || [] }

// Guarda un hilo del Orbe dentro de un cliente (botón "Guardar en cliente").
export function addOrbeConversation(clientId, messages, title) {
  const all = read()
  const list = all[clientId] || []
  const conv = {
    id: 'c' + Date.now(),
    title: title || 'Desde el Orbe',
    messages: (messages || []).map(m => ({ role: m.role, body: m.body, ts: m.ts || Date.now() })),
    created_at: new Date().toISOString(),
  }
  all[clientId] = [conv, ...list]
  write(all)
  apiUpsert(clientId, conv).catch(() => { /* offline → solo caché */ })
  return conv
}

// Hook de conversación de un cliente: hilo activo + enviar (IA real) + nuevo hilo.
export function useClientConversations(clientId) {
  const seed = () => {
    const l = read()[clientId] || []
    return l.length ? l : [{ id: 'default', title: 'Conversación', messages: [], created_at: new Date().toISOString() }]
  }
  const [list, setList] = useState(seed)
  const [activeId, setActiveId] = useState(() => seed()[0].id)
  const active = list.find(c => c.id === activeId) || list[0]

  const apply = (updater) => setList(cur => { const upd = updater(cur); setCache(clientId, upd); return upd })

  // Hidrata desde el backend (sustituye a la caché si hay datos).
  useEffect(() => {
    let alive = true
    apiList(clientId).then(rows => {
      if (!alive || !rows.length) return
      const norm = rows.map(c => ({ id: c.id, title: c.title, messages: c.messages || [], created_at: c.created_at }))
      setList(norm); setCache(clientId, norm)
      setActiveId(a => norm.find(c => c.id === a) ? a : norm[0].id)
    }).catch(() => { /* sin backend → caché */ })
    return () => { alive = false }
  }, [clientId])

  const syncThread = (thread) => apiUpsert(clientId, thread).then(saved => {
    if (saved && saved.id !== thread.id) {
      apply(cur => cur.map(c => c.id === thread.id ? { ...c, id: saved.id } : c))
      setActiveId(cur => cur === thread.id ? saved.id : cur)
    }
  }).catch(() => { /* best-effort */ })

  const send = useCallback((text) => {
    const t = text.trim(); if (!t) return
    const userMsg = { role: 'user', body: t, ts: Date.now() }
    const history = [...active.messages, userMsg]
    apply(cur => cur.map(c => c.id === active.id
      ? { ...c, messages: history, title: (!c.title || c.title === 'Conversación') ? t.slice(0, 42) : c.title }
      : c))
    orbeReply(history).then(reply => {
      const aMsg = { role: 'assistant', body: reply, ts: Date.now() }
      apply(cur => {
        const upd = cur.map(c => c.id === active.id ? { ...c, messages: [...history, aMsg] } : c)
        const thread = upd.find(c => c.id === active.id)
        if (thread) syncThread(thread)
        return upd
      })
    }).catch(() => {
      // Sin LLM/backend: deja una nota honesta en vez de inventar.
      const aMsg = { role: 'assistant', body: 'Anotado. Cuando el Orbe (IA local) esté activo te respondo con la memoria de este cliente: resúmenes, feedback y próximos pasos sobre sus llamadas y leads.', ts: Date.now() }
      apply(cur => cur.map(c => c.id === active.id ? { ...c, messages: [...history, aMsg] } : c))
    })
  }, [clientId, active])

  const newConversation = useCallback(() => {
    const conv = { id: 'c' + Date.now(), title: 'Conversación', messages: [], created_at: new Date().toISOString() }
    apply(cur => [conv, ...cur]); setActiveId(conv.id)
  }, [clientId])

  return { conversations: list, active, setActiveId, send, newConversation }
}
