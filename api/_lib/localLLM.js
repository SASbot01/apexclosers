// LLM local via Ollama — reemplaza Anthropic en resumen/feedback/outcome.
// Se activa si OLLAMA_URL está definido. Mantiene la misma forma de salida que
// el código original esperaba de Claude (texto markdown / JSON).
//
// Env:
//   OLLAMA_URL    p.ej. http://127.0.0.1:11434
//   OLLAMA_MODEL  p.ej. qwen2.5:7b-instruct (default)

const OLLAMA_URL = process.env.OLLAMA_URL || ''
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct'

export function localLLMReady() {
  return Boolean(OLLAMA_URL)
}

/**
 * Una llamada de chat al modelo local. Devuelve el texto de la respuesta.
 * @param {object} o
 * @param {string} o.system   prompt de sistema
 * @param {string} o.user     mensaje de usuario (la transcripción, etc.)
 * @param {number} [o.maxTokens]  tope de tokens de salida (num_predict)
 * @param {boolean} [o.json]  fuerza salida JSON (format: 'json' de Ollama)
 */
export async function localChat({ system, user, maxTokens = 2000, json = false }) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      ...(json ? { format: 'json' } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      options: {
        temperature: 0.3,
        num_predict: maxTokens,
      },
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Ollama ${res.status}: ${t.slice(0, 300)}`)
  }
  const data = await res.json()
  return data?.message?.content || ''
}
