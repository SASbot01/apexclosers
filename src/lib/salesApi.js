// Cliente de la tabla de ventas (/api/sales) y de las métricas (/api/metrics).
import { API_BASE, getUserId } from './config'
import { mockResponse } from '../data/mock/demo'

// Backend con fallback a demo si no hay backend (ver profileApi para el detalle).
async function call(base, action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, ...query })
  let res
  try {
    res = await fetch(`${API_BASE}${base}?${params.toString()}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    return mockOrThrow(base, action, { query, body }, method)
  }
  let data, ok = true
  try { data = await res.json() } catch { ok = false }
  if (!ok) return mockOrThrow(base, action, { query, body }, method)
  if (!res.ok) throw new Error(data.error || `api ${res.status}`)
  return data
}

// Demo SOLO en lecturas (GET). En escrituras nunca fingimos éxito: si no hay
// backend, propagamos el error para que la UI no diga "guardado" en falso.
function mockOrThrow(base, action, ctx, method = 'GET') {
  if (method === 'GET') {
    const m = mockResponse(base, action, ctx)
    if (m !== undefined) return m
  }
  throw new Error('backend_unavailable')
}

// ── Ventas ──
export const listSales   = (status) => call('/api/sales', 'list', { query: { userId: getUserId(), ...(status ? { status } : {}) } }).then(d => d.sales || [])
export const saveSale    = (sale)   => call('/api/sales', 'upsert', { method: 'POST', body: { userId: getUserId(), sale } }).then(d => d.sale)
export const deleteSale  = (id)     => call('/api/sales', 'delete', { method: 'POST', query: { id }, body: { userId: getUserId() } })
export const verifySale  = (id)     => call('/api/sales', 'verify', { method: 'POST', query: { id }, body: { userId: getUserId() } }).then(d => d.sale)
export const uploadProof = (id, proof, filename) => call('/api/sales', 'upload-proof', { method: 'POST', body: { userId: getUserId(), id, proof, filename } }).then(d => d.sale)

// ── Métricas ──
export const getMetrics    = (viewerId) => call('/api/metrics', 'metrics', { query: { userId: getUserId(), viewerId: viewerId || getUserId() } })
export const getVisibility  = () => call('/api/metrics', 'visibility', { query: { userId: getUserId() } }).then(d => d.visibility || {})
export const setVisibility  = (visible) => call('/api/metrics', 'visibility', { method: 'POST', body: { userId: getUserId(), visible } })

// Lee un File como data URL (para subir el justificante).
export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = reject
  r.readAsDataURL(file)
})
