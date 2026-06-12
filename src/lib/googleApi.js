// Cliente de cuentas de Google (varias por usuario) y del CRM de empresa.
import { API_BASE, getUserId } from './config'
import { getToken } from './auth'

async function call(base, action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, ...query })
  const res = await fetch(`${API_BASE}${base}?${params.toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try { data = await res.json() } catch { /* no-json */ }
  if (!res.ok) throw new Error(data.error || `api ${res.status}`)
  return data
}

// ── Cuentas de Google conectadas ──
export const listGoogleAccounts = () => call('/api/auth', 'google-accounts', { query: { userId: getUserId() } }).then(d => d.accounts || [])
// Conectar OTRA cuenta de Google: redirige al consentimiento llevando el token de
// sesión para ligar la cuenta nueva al usuario actual (sin crear sesión nueva).
export const connectGoogleUrl = () => `${API_BASE}/api/auth?action=google-start&connect=${encodeURIComponent(getToken() || '')}`
export const updateGoogleAccount = (id, patch) => call('/api/auth', 'google-account-update', { method: 'POST', body: { userId: getUserId(), id, ...patch } })
export const removeGoogleAccount = (id) => call('/api/auth', 'google-account-remove', { method: 'POST', body: { userId: getUserId(), id } })
export const getIntegrations = () => call('/api/auth', 'integrations', { query: { userId: getUserId() } })

// ── CRM de empresa ──
export const getCompanyCrm = () => call('/api/friends', 'company-crm', { query: { userId: getUserId() } })
