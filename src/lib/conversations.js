import { useState, useCallback } from 'react'

/*
 * Conversaciones por cliente. Persistidas (localStorage en demo; en producción
 * tabla `conversations` por client_id + memoria del Orbe). El usuario va hablando
 * y "aprendiendo" sobre el cliente; las conversaciones del Orbe se pueden guardar
 * aquí ("añadir al proyecto").
 *
 * Forma: { [clientId]: [ { id, title, messages:[{role,body,ts}], created_at } ] }
 */
const KEY = 'apex_closer_conversations'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)) } catch { /* off */ } }

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
  return conv
}

// Hook de conversación de un cliente: hilo activo + enviar + nuevo hilo.
export function useClientConversations(clientId) {
  const [, force] = useState(0)
  const tick = useCallback(() => force(x => x + 1), [])

  const all = read()
  let list = all[clientId] || []
  if (list.length === 0) {
    list = [{ id: 'default', title: 'Conversación', messages: [], created_at: new Date().toISOString() }]
    all[clientId] = list; write(all)
  }
  const [activeId, setActiveId] = useState(list[0].id)
  const active = list.find(c => c.id === activeId) || list[0]

  const send = useCallback((text) => {
    const t = text.trim(); if (!t) return
    const a = read(); const l = a[clientId] || []
    const conv = l.find(c => c.id === active.id); if (!conv) return
    conv.messages.push({ role: 'user', body: t, ts: Date.now() })
    conv.messages.push({ role: 'assistant', body: 'Anotado. En vivo te respondo con IA y memoria de este cliente: resúmenes, feedback y próximos pasos en base a sus llamadas y leads.', ts: Date.now() })
    a[clientId] = l; write(a); tick()
  }, [clientId, active, tick])

  const newConversation = useCallback(() => {
    const a = read(); const l = a[clientId] || []
    const conv = { id: 'c' + Date.now(), title: 'Conversación', messages: [], created_at: new Date().toISOString() }
    a[clientId] = [conv, ...l]; write(a); setActiveId(conv.id); tick()
  }, [clientId, tick])

  return { conversations: list, active, setActiveId, send, newConversation }
}
