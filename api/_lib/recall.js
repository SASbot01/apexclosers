// Recall.ai helpers — portado de Apex Operations (api/lib/recall.js).
// Docs: https://docs.recall.ai · Region por defecto: EU Central.
//
// Env vars:
//   RECALL_API_KEY        Token de la cuenta Recall
//   RECALL_API_URL        Base URL (default: eu-central-1)
//   APEX_PUBLIC_BASE_URL  Base pública (para finalize en background)

const API_URL = process.env.RECALL_API_URL || 'https://eu-central-1.recall.ai'

export function recallReady() {
  return Boolean(process.env.RECALL_API_KEY)
}

async function recallFetch(path, init = {}) {
  const url = `${API_URL}${path}`
  const headers = {
    Authorization: `Token ${process.env.RECALL_API_KEY}`,
    Accept: 'application/json',
    ...(init.headers || {}),
  }
  if (init.body) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, { ...init, headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`Recall ${res.status}: ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : null
}

/**
 * Crea un bot Recall.ai. Sin joinAt → entra inmediatamente (ad-hoc).
 * automatic_leave evita bots colgados: si no aparece nadie (no-show) o se
 * queda solo, se va en minutos. "Solo graba si la reunión se realiza".
 */
export async function createBot({ meetingUrl, botName = "Apex's Notetaker", joinAt, metadata } = {}) {
  return recallFetch('/api/v1/bot/', {
    method: 'POST',
    body: JSON.stringify({
      meeting_url: meetingUrl,
      bot_name: botName,
      ...(joinAt ? { join_at: joinAt } : {}),
      automatic_leave: {
        waiting_room_timeout: 600,
        noone_joined_timeout: 600,
        everyone_left_timeout: 60,
        in_call_not_recording_timeout: 600,
      },
      recording_config: {
        transcript: {
          provider: {
            recallai_streaming: {
              language_code: 'es',
              mode: 'prioritize_accuracy',
              filter_profanity: false,
            },
          },
        },
        video_mixed_layout: 'speaker_view',
      },
      ...(metadata ? { metadata } : {}),
    }),
  })
}

export async function getBotRaw(botId) {
  return recallFetch(`/api/v1/bot/${botId}/`)
}

/** Fuerza la salida de un bot que sigue en la call (tope de duración / cleanup). */
export async function leaveBot(botId) {
  return recallFetch(`/api/v1/bot/${botId}/leave_call/`, { method: 'POST' })
}

/** Cancela un bot programado que aún no entró. */
export async function deleteScheduledBot(botId) {
  return recallFetch(`/api/v1/bot/${botId}/`, { method: 'DELETE' })
}

/** Transcripción final (post-call). */
export async function getBotTranscript(botId) {
  try {
    const bot = await getBotRaw(botId)
    const recordingId = bot.recordings?.[0]?.id
    if (!recordingId) return []
    const data = await recallFetch(`/api/v1/recording/${recordingId}/`)
    const transcript = data?.media_shortcuts?.transcript
    if (!transcript?.data?.download_url) return []
    const r = await fetch(transcript.data.download_url)
    if (!r.ok) return []
    return r.json()
  } catch {
    return []
  }
}

/** URL del vídeo grabado (post-call). */
export async function getRecordingUrl(botId) {
  try {
    const bot = await getBotRaw(botId)
    const recordingId = bot.recordings?.[0]?.id
    if (!recordingId) return null
    const data = await recallFetch(`/api/v1/recording/${recordingId}/`)
    return data?.media_shortcuts?.video_mixed?.data?.download_url || null
  } catch {
    return null
  }
}

/** Normaliza status_changes de Recall a nuestro enum interno. */
export function deriveStatus(bot) {
  const codes = (bot?.status_changes || []).map(c => c.code)
  if (codes.includes('done')) return 'done'
  if (codes.includes('fatal') || codes.includes('call_ended_by_host')) return 'fatal'
  if (codes.includes('in_call_recording')) return 'in_call_recording'
  if (codes.includes('in_call_not_recording')) return 'in_call_not_recording'
  if (codes.includes('joining_call') || codes.includes('in_waiting_room')) return 'joining'
  return 'scheduled'
}

/** Parsea los segments crudos de Recall a nuestro shape interno. */
export function parseRecallSegments(segments) {
  return (segments || []).map(s => {
    const words = s.words || []
    const text = words.map(w => w.text).join(' ')
    const startMs = (words[0]?.start_timestamp?.relative ?? 0) * 1000
    const endMs   = (words[words.length - 1]?.end_timestamp?.relative ?? 0) * 1000
    return {
      speaker: s.participant?.name || s.speaker || 'Desconocido',
      text,
      startMs,
      endMs,
    }
  })
}
