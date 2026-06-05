import { useState, useEffect, createContext, useContext } from 'react'
import { API_BASE } from './config'

// Sesión de usuario. Login real con Google (vía /api/auth) + fallback "modo
// demo" para poder usar la app en local sin backend ni claves.
const TOKEN_KEY = 'apex_closer_session'
const DEMO_KEY = 'apex_closer_demo_user'

export function getToken() { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
function getDemo() { try { const r = localStorage.getItem(DEMO_KEY); return r ? JSON.parse(r) : null } catch { return null } }

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

export function signInWithGoogle() {
  window.location.href = `${API_BASE}/api/auth?action=google-start`
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
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(DEMO_KEY) } catch { /* off */ }
  window.location.href = '/'
}

// Hook de sesión: valida el token contra /api/auth?action=me; si no hay backend
// pero existe sesión demo, entra en modo demo.
export function useSession() {
  const [state, setState] = useState({ loading: true, user: null })
  useEffect(() => {
    captureSessionFromUrl()
    let alive = true
    const token = getToken()
    const demo = getDemo()
    if (token) {
      fetch(`${API_BASE}/api/auth?action=me&token=${encodeURIComponent(token)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => { if (alive) setState({ loading: false, user: d.user || demo }) })
        .catch(() => { if (alive) setState({ loading: false, user: demo }) })
    } else {
      setState({ loading: false, user: demo })
    }
    return () => { alive = false }
  }, [])
  return state
}

// Contexto para que cualquier componente lea el usuario actual.
export const AuthContext = createContext({ user: null })
export const useCurrentUser = () => useContext(AuthContext).user
