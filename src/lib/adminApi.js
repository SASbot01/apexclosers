// Cliente del panel /admin. Usa un token de sesión propio (separado del de la
// app de closer) para que el admin no entre nunca a la app normal.
import { API_BASE } from './config'

const KEY = 'apex_admin_token'
export const getAdminToken = () => { try { return localStorage.getItem(KEY) } catch { return null } }
export function adminLogout() { try { localStorage.removeItem(KEY) } catch { /* off */ } }

export async function adminLogin(email, password) {
  const res = await fetch(`${API_BASE}/api/auth?action=admin-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || !d.token) throw new Error(d.error || 'invalid_credentials')
  if (d.user?.account_type !== 'admin') throw new Error('not_admin')
  try { localStorage.setItem(KEY, d.token) } catch { /* off */ }
  return d.user
}

async function req(action, body) {
  const token = getAdminToken()
  const res = await fetch(`${API_BASE}/api/admin?action=${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...(body || {}) }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `api ${res.status}`)
  return d
}

export const adminListUsers  = () => req('list-users').then(d => d.users || [])
export const adminSetAccess  = (userId, access) => req('set-access', { userId, access })
export const adminSetType    = (userId, account_type) => req('set-type', { userId, account_type })
export const adminDeleteUser = (userId) => req('delete-user', { userId })
