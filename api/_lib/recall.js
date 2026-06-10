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
        // Si el STT local (Whisper) está activo, NO pedimos la transcripción a
        // Recall: el bot solo graba y transcribimos en local desde recording_url.
        // Esto evita el coste de transcripción de Recall.
        ...(process.env.LOCAL_STT_URL ? {} : {
          transcript: {
            provider: {
              recallai_streaming: {
                language_code: 'es',
                mode: 'prioritize_accuracy',
                filter_profanity: false,
              },
            },
          },
        }),
        video_mixed_layout: 'speaker_view',
        // Eventos de participante (speaker timeline): metadato GRATIS (detección
        // de quién habla, sin coste de transcripción). Lo cruzamos con los
        // segmentos de Whisper para poner el nombre del Closer y del Cliente
        // en la transcripción en vez de "Cliente" para todo. Ver assignSpeakers.
        participant_events: {},
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

// ── Atribución de interlocutor (host vs cliente) ─────────────────────────
// El STT local (Whisper) no diariza: marca todo como "Desconocido". Para poner
// el nombre del host (el Gmail conectado) y "Cliente" al otro, cruzamos los
// segmentos con la SPEAKER TIMELINE de Recall — metadato gratis de la grabación,
// sin coste de transcripción.

const isUnknownSpeaker = (s) => !s || /^\s*$/.test(String(s)) || /desconocid|unknown|speaker\s*\d+/i.test(String(s))
const cleanName = (n) => { if (!n) return null; const t = String(n).trim(); return isUnknownSpeaker(t) ? null : t }

/** Nombre legible a partir de un email: "alejandro.cto@x" → "Alejandro". */
export function nameFromEmail(email) {
  if (!email) return null
  const local = String(email).split('@')[0] || ''
  const first = local.split(/[._\-+0-9]+/).filter(Boolean)[0]
  if (!first) return null
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

/** Resuelve el nombre de un participante de Recall: host → hostName, resto → nombre o "Cliente". */
export function participantSpeaker(participant, hostName) {
  if (participant?.is_host === true) return hostName || 'Anfitrión'
  const real = cleanName(participant?.name)
  // Si el nombre coincide con el host (mismo Gmail/nombre), también es el host.
  if (real && hostName && real.toLowerCase().startsWith(String(hostName).toLowerCase())) return hostName
  return real || 'Cliente'
}

/** Parsea los segments crudos de Recall a nuestro shape interno (con atribución). */
export function parseRecallSegments(segments, hostName) {
  return (segments || []).map(s => {
    const words = s.words || []
    const text = words.map(w => w.text).join(' ')
    const startMs = (words[0]?.start_timestamp?.relative ?? 0) * 1000
    const endMs   = (words[words.length - 1]?.end_timestamp?.relative ?? 0) * 1000
    return {
      speaker: participantSpeaker(s.participant, hostName),
      text,
      startMs,
      endMs,
    }
  })
}

/**
 * Speaker timeline de Recall (quién habla y cuándo), metadato gratis de la
 * grabación — NO requiere transcripción de pago. Devuelve ventanas con tiempos
 * relativos: [{ startMs, endMs, name, isHost }]. Tolerante a varias formas de la
 * API (media_shortcuts.speaker_timeline / participant_events). Sin datos → [].
 */
export async function getSpeakerTimeline(botId) {
  try {
    const bot = await getBotRaw(botId)
    const recordingId = bot.recordings?.[0]?.id
    const participants = bot.meeting_participants || bot.participants || []
    const nameById = new Map(participants.map(p => [String(p.id), p.name]))
    const hostIds = new Set(participants.filter(p => p.is_host).map(p => String(p.id)))
    if (!recordingId) return []
    const data = await recallFetch(`/api/v1/recording/${recordingId}/`)
    const ms = data?.media_shortcuts || {}
    const url = ms.speaker_timeline?.data?.download_url || ms.participant_events?.data?.download_url
    if (!url) return []
    const r = await fetch(url)
    if (!r.ok) return []
    const raw = await r.json()
    const events = Array.isArray(raw) ? raw : (raw?.speaker_timeline || raw?.events || raw?.data || [])
    const out = []
    for (const e of events) {
      const p = e.participant || e
      const startRel = e.start_timestamp?.relative ?? e.timestamp?.relative ?? e.start ?? null
      const endRel   = e.end_timestamp?.relative ?? e.end ?? null
      if (startRel == null) continue
      const pid = String(p.id ?? p.participant_id ?? '')
      out.push({
        startMs: startRel * 1000,
        endMs:   (endRel ?? Number(startRel) + 5) * 1000,
        name:    cleanName(p.name) || cleanName(nameById.get(pid)),
        isHost:  p.is_host === true || hostIds.has(pid),
      })
    }
    return out.sort((a, b) => a.startMs - b.startMs)
  } catch {
    return []
  }
}

/**
 * Atribuye interlocutor a cada segmento (texto+tiempos) cruzándolo con la
 * speaker timeline por solape temporal. Host → hostName; resto → nombre o
 * "Cliente". Sin timeline → "Cliente" (nunca "Desconocido").
 */
export function assignSpeakers(segments, timeline, hostName) {
  if (!Array.isArray(segments)) return []
  const tl = Array.isArray(timeline) ? timeline : []
  const speakerAt = (mid) => {
    let best = null
    for (const t of tl) {
      if (mid >= t.startMs && mid <= t.endMs) return t
      if (t.startMs <= mid && (!best || t.startMs > best.startMs)) best = t
    }
    return best
  }
  return segments.map(s => {
    const mid = ((s.startMs ?? 0) + (s.endMs ?? s.startMs ?? 0)) / 2
    const hit = tl.length ? speakerAt(mid) : null
    let speaker
    if (hit) speaker = hit.isHost ? (hostName || 'Anfitrión') : (hit.name || 'Cliente')
    else speaker = isUnknownSpeaker(s.speaker) ? 'Cliente' : s.speaker
    return { ...s, speaker }
  })
}
