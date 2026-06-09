// Cliente de objetivos (/api/goals). Objetivos mensuales del usuario; el Home
// los escala al periodo. Si no hay backend, cae a los valores por defecto.
import { API_BASE, getUserId } from './config'

const DEFAULTS = { calls: 12, closes: 4, cash: 6000, extra: {} }

// Metadatos de presentación (label + formato) — el "base" sale del backend.
export const GOAL_META = [
  { key: 'calls',  label: 'Llamadas', fmt: 'int' },
  { key: 'closes', label: 'Cierres',  fmt: 'int' },
  { key: 'cash',   label: 'Cash',     fmt: 'money' },
]

async function req(action, { method = 'GET', body } = {}) {
  const params = new URLSearchParams({ action, userId: getUserId() })
  try {
    const res = await fetch(`${API_BASE}/api/goals?${params.toString()}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `api ${res.status}`)
    return data
  } catch {
    return { goals: DEFAULTS }   // sin backend → defaults
  }
}

export const getGoals = () => req('get').then(d => d.goals || DEFAULTS)
export const setGoals = (goals) => req('set', { method: 'POST', body: { userId: getUserId(), goals } }).then(d => d.goals)

// Devuelve los objetivos como el array que pinta el Home (base por métrica).
export const goalsAsList = (goals) => GOAL_META.map(m => ({ ...m, base: Number(goals?.[m.key]) || DEFAULTS[m.key] }))
