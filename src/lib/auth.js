import { useState, useEffect, createContext, useContext } from 'react'
import { API_BASE, setUserId } from './config'

// Sesión de usuario. Login real con Google (vía /api/auth) + fallback "modo
// demo" para poder usar la app en local sin backend ni claves.
const TOKEN_KEY = 'apex_closer_session'
const DEMO_KEY = 'apex_closer_demo_user'
const USER_CACHE = 'apex_closer_user'   // último usuario validado (para no rebotar a la landing por un fallo de red)

export function getToken() { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
function getDemo() { try { const r = localStorage.getItem(DEMO_KEY); return r ? JSON.parse(r) : null } catch { return null } }
function cacheUser(u) { try { u ? localStorage.setItem(USER_CACHE, JSON.stringify(u)) : localStorage.removeItem(USER_CACHE) } catch { /* off */ } }
function getCachedUser() { try { const r = localStorage.getItem(USER_CACHE); return r ? JSON.parse(r) : null } catch { return null } }

// Valida el token contra /api/auth?action=me con reintentos. Distingue una
// sesión inválida (401 → logout real) de un fallo de red/túnel (reintenta y, si
// no lo consigue, NO cierra sesión: conserva el usuario cacheado).
async function fetchMe(token, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${API_BASE}/api/auth?action=me&token=${encodeURIComponent(token)}`)
      if (r.status === 401) return { invalid: true }
      if (r.ok) { const d = await r.json().catch(() => ({})); return { user: d.user || null } }
      // 5xx / respuesta del túnel: reintenta
    } catch { /* error de red: reintenta */ }
    await new Promise(res => setTimeout(res, 500 * (i + 1)))
  }
  return { network: true }
}

// Captura ?session= que devuelve el callback de Google y limpia la URL.
function captureSessionFromUrl() {
  const p = new URLSearchParams(window.location.search)
  const s = p.get('session')
  if (s) {
    try { localStorage.setItem(TOKEN_KEY, s) } catch { /* off */ }
    p.delete('session')
    const q = p.toString()
    window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : ''))
  }
}

// Captura ?ref= (afiliado que te trajo) y lo guarda hasta que te registres.
function captureRefFromUrl() {
  const ref = new URLSearchParams(window.location.search).get('ref')
  if (ref) { try { localStorage.setItem('apex_ref', ref) } catch { /* off */ } }
}

export function signInWithGoogle() {
  let ref = ''
  try { ref = localStorage.getItem('apex_ref') || '' } catch { /* off */ }
  window.location.href = `${API_BASE}/api/auth?action=google-start${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`
}

export function signInDemo() {
  const demo = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Alex', email: 'alex.ceo@blackwolfsec.io', picture: null, demo: true,
  }
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(demo)) } catch { /* off */ }
  window.location.href = '/'
}

export function signOut() {
  const token = getToken()
  if (token) fetch(`${API_BASE}/api/auth?action=logout&token=${encodeURIComponent(token)}`).catch(() => null)
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(DEMO_KEY); localStorage.removeItem(USER_CACHE); localStorage.removeItem('apex_closer_uid') } catch { /* off */ }
  window.location.href = '/'
}

// Hook de sesión: valida el token contra /api/auth?action=me; si no hay backend
// pero existe sesión demo, entra en modo demo.
export function useSession() {
  const [state, setState] = useState({ loading: true, user: null })
  useEffect(() => {
    captureRefFromUrl()
    captureSessionFromUrl()
    let alive = true
    const token = getToken()
    const demo = getDemo()
    const cached = getCachedUser()
    if (token) {
      // Optimista: si ya validamos antes, entra YA con el usuario cacheado (no
      // se queda en blanco ni rebota a la landing) y revalida en segundo plano.
      if (cached) { setUserId(cached.id); if (alive) setState({ loading: false, user: cached }) }
      fetchMe(token).then(r => {
        if (!alive) return
        if (r.user) { cacheUser(r.user); setUserId(r.user.id); setState({ loading: false, user: r.user }) }
        else if (r.invalid) { cacheUser(null); try { localStorage.removeItem(TOKEN_KEY) } catch { /* off */ } setUserId(demo?.id); setState({ loading: false, user: demo }) }
        else { const u = cached || demo; setUserId(u?.id); setState({ loading: false, user: u }) }  // red caída → conserva sesión
      })
    } else {
      setUserId(demo?.id)
      setState({ loading: false, user: demo })
    }
    return () => { alive = false }
  }, [])
  return state
}

// Contexto para que cualquier componente lea el usuario actual.
export const AuthContext = createContext({ user: null })
export const useCurrentUser = () => useContext(AuthContext).user
