// RAG del coach: indexa las transcripciones (resumen, feedback, ventanas) con
// embeddings locales y recupera los fragmentos relevantes para que el coach CITE
// llamadas concretas. Lo usan recall.finalize (al cerrar una call) y api/orbe
// (al responder) + api/coach (backfill).
import { supabase } from './supabase.js'
import { embed, embedReady, vecLiteral, chunkText } from './embeddings.js'

const refOf = (call) => `${call.title || 'Llamada'}${call.started_at ? ' · ' + new Date(call.started_at).toLocaleDateString('es-ES') : ''}`

// Indexa (o re-indexa) una llamada. Devuelve nº de fragmentos guardados.
export async function indexCall(call) {
  if (!embedReady() || !call?.id || !call?.user_id) return 0
  const items = []
  if (call.summary) items.push({ kind: 'summary', text: call.summary })
  if (call.feedback) items.push({ kind: 'feedback', text: call.feedback })
  const tText = Array.isArray(call.transcript) ? call.transcript.map(s => `${s.speaker}: ${s.text}`).join('\n') : ''
  for (const w of chunkText(tText, 800, 150)) items.push({ kind: 'transcript', text: w })
  if (!items.length) return 0
  const ref = refOf(call)
  await supabase.from('call_chunks').delete().eq('call_id', call.id).then(() => {}, () => {})
  let n = 0
  for (const it of items) {
    try {
      const v = await embed(it.text)
      if (!v) continue
      await supabase.from('call_chunks').insert({
        user_id: call.user_id, call_id: call.id, kind: it.kind, text: it.text,
        ref, call_title: call.title || null, call_date: call.started_at || null,
        embedding: vecLiteral(v),
      })
      n++
    } catch { /* sigue con el resto */ }
  }
  return n
}

// Recupera los fragmentos más relevantes para una consulta del coach.
export async function retrieve(userId, query, k = 6) {
  if (!embedReady() || !userId || !query) return []
  try {
    const v = await embed(query)
    if (!v) return []
    const { data } = await supabase.rpc('match_call_chunks', { uid: userId, query_embedding: vecLiteral(v), match_count: k })
    return (data || []).filter(r => (r.score ?? 0) > 0.3)
  } catch { return [] }
}

// Bloque de contexto con los fragmentos, para inyectar en el prompt del coach.
export function ragBlock(chunks) {
  if (!chunks?.length) return ''
  const lines = chunks.map((c, i) => `[${i + 1}] (${c.ref || 'llamada'} · ${c.kind}) ${String(c.chunk_text || '').replace(/\s+/g, ' ').slice(0, 380)}`)
  return `\n\nFRAGMENTOS REALES DE TUS LLAMADAS (recuperados por relevancia). Úsalos como prueba y CITA la llamada (por su título/fecha) cuando te apoyes en uno. No inventes citas que no estén aquí:\n${lines.join('\n')}`
}
