// Call classifier — decide a qué eventos de calendario se une el Notetaker.
// Portado de Apex Operations. POLÍTICA: SOLO reuniones de VENTA.
//
// El bot NO entra a dailies, internas, recaps, personales ni sin clasificar.
// Ante la duda, NO entra (mejor perder una venta puntual que colgar bots en
// reuniones internas). Señal de venta = asistente EXTERNO o keyword de venta.
// "Solo si la reunión se realiza" lo resuelve automatic_leave en createBot.

const INTERNAL_KEYWORDS = [
  'daily', 'weekly', 'standup', 'stand-up', 'stand up',
  'sprint', 'retro', 'retrospective', '1:1', '1 on 1', 'one on one',
  'uno a uno', 'team sync', 'sync interno', 'all hands', 'all-hands',
  'kickoff interno', 'review interna', 'team meeting', 'internal', 'interno',
  'internal review', 'operativa', 'ops', 'colab', 'recap', 'wake up', 'wake-up',
]

const SALES_KEYWORDS = [
  'llamada con', 'llamada de admisión', 'llamada de admision',
  'proceso de admisión', 'proceso de admision', 'admisión', 'admision',
  'discovery', 'demo', 'venta', 'sales', 'call con',
  'presentación', 'presentacion', 'propuesta', 'cierre', 'follow-up con',
  'intro call', 'calificación', 'qualification', 'kickoff cliente',
  'onboarding cliente', 'consultoría', 'consultoria',
]

const BLOCK_KEYWORDS = ['focus', 'deep work', 'lunch', 'comida', 'gym', 'bloqueo', 'off']

export function classifyCall(input) {
  const title = (input.title || '').toLowerCase()
  const desc  = (input.description || '').toLowerCase()
  const text  = `${title} ${desc}`

  const closerDomain = (input.closerEmail || '').split('@')[1]?.toLowerCase() || ''
  const attendees = Array.isArray(input.attendees) ? input.attendees : []
  const externalAttendees = attendees.filter(
    a => a.email && (!closerDomain || !a.email.toLowerCase().endsWith(`@${closerDomain}`)) && a.email !== input.closerEmail
  )
  const internalAttendees = attendees.filter(
    a => a.email && closerDomain && a.email.toLowerCase().endsWith(`@${closerDomain}`)
  )
  const isRecurring = Boolean(input.recurringEventId)
  const hasSalesKeyword = SALES_KEYWORDS.some(k => text.includes(k))

  if (BLOCK_KEYWORDS.some(k => text.includes(k))) {
    return { kind: 'BLOQUEO', confidence: 0.9, reason: 'Bloqueo personal por palabra clave', shouldAttachBot: false, label: 'Bloqueo' }
  }
  if (externalAttendees.length === 0 && internalAttendees.length === 0) {
    return { kind: 'PERSONAL', confidence: 0.85, reason: 'Sin asistentes', shouldAttachBot: false, label: 'Personal' }
  }
  if (isRecurring && INTERNAL_KEYWORDS.some(k => text.includes(k))) {
    const isDaily = ['daily', 'standup', 'stand-up', 'stand up'].some(k => text.includes(k))
    return {
      kind: isDaily ? 'DAILY' : 'WEEKLY',
      confidence: 0.92,
      reason: 'Recurrente interna — el Notetaker no entra a reuniones de equipo',
      shouldAttachBot: false,
      label: isDaily ? 'Daily de equipo' : 'Weekly de equipo',
    }
  }
  if (externalAttendees.length === 0 && !hasSalesKeyword) {
    return { kind: 'INTERNA', confidence: 0.8, reason: 'Solo asistentes internos, sin señal de venta', shouldAttachBot: false, label: 'Interna' }
  }
  if (hasSalesKeyword) {
    return { kind: 'VENTA', confidence: 0.9, reason: 'Keyword de venta en el título', shouldAttachBot: true, label: 'Venta' }
  }
  if (externalAttendees.length > 0 && !isRecurring) {
    return { kind: 'VENTA', confidence: 0.8, reason: 'Asistente externo, no recurrente', shouldAttachBot: true, label: 'Venta' }
  }
  if (externalAttendees.length > 0 && isRecurring) {
    return { kind: 'VENTA', confidence: 0.6, reason: 'Recurrente con externo — probable seguimiento de venta', shouldAttachBot: true, label: 'Venta · seguimiento' }
  }
  return { kind: 'SIN_CLASIFICAR', confidence: 0.4, reason: 'Sin señales de venta — no entra automáticamente', shouldAttachBot: false, label: 'Sin clasificar' }
}
