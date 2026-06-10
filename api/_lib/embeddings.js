// Embeddings LOCALES con Ollama (nomic-embed-text, 768 dims) para el RAG del
// coach. Gratis y sin salir del equipo.
const OLLAMA_URL = process.env.OLLAMA_URL || ''
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text'

export function embedReady() { return Boolean(OLLAMA_URL) }

export async function embed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: String(text || '').slice(0, 8000) }),
  })
  if (!res.ok) throw new Error(`embeddings ${res.status}`)
  const d = await res.json()
  return Array.isArray(d.embedding) && d.embedding.length ? d.embedding : null
}

// Literal de pgvector: '[0.1,0.2,...]'
export const vecLiteral = (arr) => `[${arr.join(',')}]`

// Trocea texto en ventanas (~size) con solape, para citar momentos concretos.
export function chunkText(text, size = 800, overlap = 150) {
  const t = String(text || '').replace(/\s+\n/g, '\n').trim()
  if (!t) return []
  const out = []
  let i = 0
  while (i < t.length) {
    out.push(t.slice(i, i + size))
    i += (size - overlap)
    if (out.length >= 20) break   // tope por llamada
  }
  return out
}
