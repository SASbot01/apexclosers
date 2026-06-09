import { useState, useCallback, useEffect } from 'react'
import { DEFAULT_SCRIPT } from '../data/mock/scriptTemplate'
import { API_BASE, getUserId } from './config'

/*
 * Guiones (scripts) y resultados de llamada por cliente. Persistidos en las
 * tablas `scripts` y `call_results` (/api/scripts) por client_key; localStorage
 * actúa como caché para render instantáneo / offline. El Orbe afina el guion con
 * api/orbe?action=optimize-script (desde la página de Scripts).
 */
const SKEY = 'apex_closer_scripts'
const RKEY = 'apex_closer_call_results'
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {} } catch { return {} } }
const write = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)) } catch { /* off */ } }
const clone = (o) => JSON.parse(JSON.stringify(o))

// ── Backend ──
async function apiGetScript(clientKey) {
  const params = new URLSearchParams({ action: 'get', userId: getUserId(), clientKey })
  const res = await fetch(`${API_BASE}/api/scripts?${params.toString()}`)
  const data = await res.json(); if (!res.ok) throw new Error(data.error || 'api')
  return data.script || null
}
async function apiSaveScript(clientKey, script) {
  const res = await fetch(`${API_BASE}/api/scripts?action=save`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: getUserId(), clientKey, script }),
  })
  if (!res.ok) throw new Error('api')
}
async function apiResults(clientKey) {
  const params = new URLSearchParams({ action: 'results', userId: getUserId(), clientKey })
  const res = await fetch(`${API_BASE}/api/scripts?${params.toString()}`)
  const data = await res.json(); if (!res.ok) throw new Error(data.error || 'api')
  return data.results || []
}
async function apiSaveResult(clientKey, result) {
  const res = await fetch(`${API_BASE}/api/scripts?action=save-result`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: getUserId(), clientKey, result }),
  })
  if (!res.ok) throw new Error('api')
}

export function getScript(clientId) {
  const all = read(SKEY)
  return all[clientId] || clone(DEFAULT_SCRIPT)
}
export function saveScript(clientId, script) {
  const all = read(SKEY); all[clientId] = script; write(SKEY, all)
  apiSaveScript(clientId, script).catch(() => { /* offline → solo caché */ })
}
export function listCallResults(clientId) { return read(RKEY)[clientId] || [] }
export function saveCallResult(clientId, result) {
  const all = read(RKEY); const list = all[clientId] || []
  const row = { id: 'res' + Date.now(), created_at: new Date().toISOString(), ...result }
  all[clientId] = [row, ...list]
  write(RKEY, all)
  apiSaveResult(clientId, result).catch(() => { /* offline → solo caché */ })
  return row
}

export function useScript(clientId) {
  const [, force] = useState(0)
  const tick = () => force(x => x + 1)

  // Hidrata guion + resultados desde el backend (sustituyen a la caché).
  useEffect(() => {
    let alive = true
    apiGetScript(clientId).then(s => {
      if (!alive || !s) return
      const all = read(SKEY); all[clientId] = s; write(SKEY, all); tick()
    }).catch(() => {})
    apiResults(clientId).then(rs => {
      if (!alive || !rs.length) return
      const all = read(RKEY); all[clientId] = rs; write(RKEY, all); tick()
    }).catch(() => {})
    return () => { alive = false }
  }, [clientId])

  const script = getScript(clientId)
  const save = useCallback((s) => { saveScript(clientId, s); force(x => x + 1) }, [clientId])
  return { script, save }
}
