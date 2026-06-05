// Badge de estado de llamada. Color direccional (pos/neg/live/neutral),
// según las convenciones del tema (docs: "status colors are direction-based").

export function callMeta(call) {
  const { status, outcome } = call || {}
  if (status === 'done') {
    if (outcome === 'won')       return { label: 'Cerrada',     tone: 'pos' }
    if (outcome === 'lost')      return { label: 'Perdida',     tone: 'neg' }
    if (outcome === 'no_show')   return { label: 'No-show',     tone: 'neg' }
    if (outcome === 'follow_up') return { label: 'Seguimiento', tone: 'neutral' }
    return { label: 'Finalizada', tone: 'neutral' }
  }
  if (status === 'in_call_recording')     return { label: 'Grabando',  tone: 'live' }
  if (status === 'in_call_not_recording') return { label: 'En llamada', tone: 'live' }
  if (status === 'joining')               return { label: 'Entrando',  tone: 'live' }
  if (status === 'scheduled')             return { label: 'Agendada',  tone: 'neutral' }
  if (status === 'cancelled')             return { label: 'Cancelada', tone: 'neutral' }
  if (status === 'fatal')                 return { label: 'Error',     tone: 'neg' }
  return { label: status || '—', tone: 'neutral' }
}

export default function StatusBadge({ call }) {
  const { label, tone } = callMeta(call)
  return (
    <span className="badge" data-tone={tone}>
      <span className="badge-dot" />
      {label}
    </span>
  )
}
