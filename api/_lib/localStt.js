// STT local via servicio Whisper (local-ai/whisper_server.py) — reemplaza la
// transcripción de Recall.ai. Se activa si LOCAL_STT_URL está definido.
//
// Env:
//   LOCAL_STT_URL  p.ej. http://127.0.0.1:8090

const LOCAL_STT_URL = process.env.LOCAL_STT_URL || ''

export function localSttReady() {
  return Boolean(LOCAL_STT_URL)
}

/**
 * Transcribe un audio/vídeo accesible por URL (la recording_url de Recall).
 * Devuelve segmentos en el MISMO shape que parseRecallSegments:
 *   [{ speaker, text, startMs, endMs }]
 */
export async function transcribeUrl(audioUrl) {
  const res = await fetch(`${LOCAL_STT_URL}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_url: audioUrl }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`whisper ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  return Array.isArray(data?.segments) ? data.segments : []
}
