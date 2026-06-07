// Lógica pura de la invitación automática (sin Google/Supabase/Recall), para
// poder testearla aislada. La usa api/calendar.js → action=schedule-bots.

export const LOOKAHEAD_MS = 15 * 60 * 1000   // programa calls que empiezan en <=15 min
export const STALE_MS     = 30 * 60 * 1000   // ignora calls que empezaron hace >30 min
export const JOIN_LEAD_MS = 60 * 1000        // el bot entra 1 min antes de la hora

// ¿Toca programar bot para este evento ya-formateado (shapeEvent), dado el ahora (ms)?
export function dueForScheduling(e, now) {
  if (!e?.classification?.shouldAttachBot || !e.meeting_url) return false
  const startMs = e.start ? new Date(e.start).getTime() : NaN
  if (!Number.isFinite(startMs)) return false
  return startMs <= now + LOOKAHEAD_MS && startMs >= now - STALE_MS
}

// join_at ISO para entrar JOIN_LEAD_MS antes; undefined si la call ya empezó
// (en ese caso createBot entra de inmediato).
export function computeJoinAt(startMs, now) {
  const joinAtMs = startMs - JOIN_LEAD_MS
  return joinAtMs > now + 10_000 ? new Date(joinAtMs).toISOString() : undefined
}
