// Rangos de tiempo + límites de calendario. Base de los filtros de todas las
// secciones (Home, Pipeline, Finanzas, Reports).

export const TIME_RANGES = [
  { key: 'today',        label: 'Hoy' },
  { key: 'this_week',    label: 'Esta semana' },
  { key: 'this_month',   label: 'Este mes' },
  { key: 'this_quarter', label: 'Trimestre' },
  { key: 'this_year',    label: 'Este año' },
]

// Límites de calendario reales + fracción transcurrida del periodo (para
// proyecciones y "expected pace").
export function calendarBounds(key) {
  const now = new Date()
  let from, to
  if (key === 'today') {
    from = new Date(now); from.setHours(0, 0, 0, 0)
    to = new Date(from); to.setDate(to.getDate() + 1)
  } else if (key === 'this_week') {
    const day = (now.getDay() + 6) % 7 // lunes = 0
    from = new Date(now); from.setDate(now.getDate() - day); from.setHours(0, 0, 0, 0)
    to = new Date(from); to.setDate(from.getDate() + 7)
  } else if (key === 'this_quarter') {
    const q = Math.floor(now.getMonth() / 3)
    from = new Date(now.getFullYear(), q * 3, 1)
    to = new Date(now.getFullYear(), q * 3 + 3, 1)
  } else if (key === 'this_year') {
    from = new Date(now.getFullYear(), 0, 1)
    to = new Date(now.getFullYear() + 1, 0, 1)
  } else { // this_month (default)
    from = new Date(now.getFullYear(), now.getMonth(), 1)
    to = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  }
  const total = to - from
  const elapsed = Math.min(Math.max(now - from, 0), total)
  return { from, to, now, elapsedFrac: total > 0 ? elapsed / total : 1, days: Math.max(1, Math.round(total / 86400000)) }
}

// ¿Cae `iso` dentro del periodo hasta ahora?
export function inWindow(iso, key) {
  if (!iso) return false
  const { from, now } = calendarBounds(key)
  const d = new Date(iso)
  return d >= from && d <= now
}
