export function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '—' }
}

export const PLATFORM_LABEL = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  microsoft_teams: 'Teams',
}
