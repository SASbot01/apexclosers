import { useState, useCallback } from 'react'
import { DEFAULT_SCRIPT } from '../data/mock/scriptTemplate'

/*
 * Scripts (guiones) y resultados de llamada por cliente. Persistido en
 * localStorage (demo); en producción tablas `scripts` y `call_results`.
 * El guion se edita por cliente y, más adelante, el Orbe lo afina con los
 * datos y transcripciones (esa automatización se deja para después).
 */
const SKEY = 'apex_closer_scripts'
const RKEY = 'apex_closer_call_results'
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {} } catch { return {} } }
const write = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)) } catch { /* off */ } }
const clone = (o) => JSON.parse(JSON.stringify(o))

export function getScript(clientId) {
  const all = read(SKEY)
  return all[clientId] || clone(DEFAULT_SCRIPT)
}
export function saveScript(clientId, script) {
  const all = read(SKEY); all[clientId] = script; write(SKEY, all)
}
export function listCallResults(clientId) { return read(RKEY)[clientId] || [] }
export function saveCallResult(clientId, result) {
  const all = read(RKEY); const list = all[clientId] || []
  all[clientId] = [{ id: 'res' + Date.now(), created_at: new Date().toISOString(), ...result }, ...list]
  write(RKEY, all)
}

export function useScript(clientId) {
  const [, force] = useState(0)
  const script = getScript(clientId)
  const save = useCallback((s) => { saveScript(clientId, s); force(x => x + 1) }, [clientId])
  return { script, save }
}
