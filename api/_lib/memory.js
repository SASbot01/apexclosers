// Memoria persistente del cerebro (Orbe). Por usuario, se gana con el uso.
// Escritura determinista desde la extracción de llamadas + captura explícita
// ("recuerda que…"); recall semántico para inyectar en el prompt. Todo defensivo:
// si falta la tabla 0020 o el embedding local, degrada a no-op sin romper.
import { supabase } from './supabase.js'
import { embed, embedReady, vecLiteral } from './embeddings.js'

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

// Guarda un hecho (dedupe por contenido normalizado: si ya existe uno igual para
// el usuario, sube salience/recencia en vez de duplicar). Embebe si hay embeddings.
export async function writeMemory(userId, { type = 'semantic', content, structured = null, salience = 0.5, confidence = 0.8, source = null, source_ref = null } = {}) {
  try {
    if (!userId || !content || !String(content).trim()) return
    const text = String(content).trim().slice(0, 500)
    // dedupe
    const { data: existing } = await supabase.from('memories').select('id, salience')
      .eq('user_id', userId).ilike('content', text).limit(1)
    if (existing && existing.length) {
      await supabase.from('memories').update({ salience: Math.min(1, (existing[0].salience || 0.5) + 0.05) }).eq('id', existing[0].id).then(() => {}, () => {})
      return
    }
    let embedding = null
    if (embedReady()) { try { const v = await embed(text); if (v) embedding = vecLiteral(v) } catch { /* sin embedding */ } }
    await supabase.from('memories').insert({
      user_id: userId, type, content: text, structured, salience, confidence, source, source_ref, embedding,
    }).then(() => {}, () => {})
  } catch (e) { /* nunca rompe */ }
}

// Deriva hechos DETERMINISTAS (sin LLM) desde la extracción de una llamada y los
// guarda: el negocio del closer (semantic) y el resultado (episodic).
export async function writeCallMemories(userId, call, extraction) {
  try {
    if (!userId || !extraction) return
    const cur = (extraction.currency || 'EUR')
    // Negocio (semantic): qué/ a cuánto vende, cuando hay cierre con producto y precio.
    if (extraction.deal_closed && extraction.product) {
      const price = extraction.deal_amount != null ? ` (~${extraction.deal_amount} ${cur}${extraction.payment_type ? ', ' + extraction.payment_type : ''})` : ''
      await writeMemory(userId, { type: 'semantic', content: `Vende ${extraction.product}${price}.`, structured: { product: extraction.product, amount: extraction.deal_amount ?? null, currency: cur }, salience: 0.7, source: 'call', source_ref: call?.id ? `call:${call.id}` : null })
    }
    // Resultado (episodic): estado de la llamada con su evidencia.
    if (extraction.state && extraction.state !== 'unknown') {
      const d = call?.started_at ? new Date(call.started_at).toLocaleDateString('es-ES') : null
      const ev = extraction.evidence ? ` — ${String(extraction.evidence).slice(0, 120)}` : ''
      await writeMemory(userId, { type: 'episodic', content: `${d ? d + ': ' : ''}${extraction.state}${ev}`, structured: { state: extraction.state }, salience: 0.5, source: 'call', source_ref: call?.id ? `call:${call.id}` : null })
    }
  } catch (e) { /* nunca rompe */ }
}

// Detecta "recuerda que…" / "apunta que…" / "no olvides que…" en el mensaje del
// usuario y lo guarda como hecho semántico de alta importancia. Devuelve true si capturó.
export async function captureExplicit(userId, text) {
  try {
    if (!userId || !text) return false
    const m = String(text).match(/\b(?:recuerda|apunta|no olvides|ten en cuenta)\s+(?:que\s+)?(.{4,400})/i)
    if (!m) return false
    await writeMemory(userId, { type: 'semantic', content: m[1].trim(), salience: 0.9, confidence: 0.95, source: 'chat' })
    return true
  } catch { return false }
}

// Recupera las memorias más relevantes y devuelve un bloque listo para el prompt
// (o '' si no hay). Con embeddings usa match_memories; sin ellos, las más salientes.
export async function recallMemories(userId, query, k = 5) {
  try {
    if (!userId) return ''
    let rows = []
    if (embedReady() && query) {
      try {
        const v = await embed(query)
        if (v) {
          const { data } = await supabase.rpc('match_memories', { uid: userId, query_embedding: vecLiteral(v), match_count: k })
          rows = (data || []).filter(r => (r.score ?? 0) > 0.25)
        }
      } catch { /* cae a fallback */ }
    }
    if (!rows.length) {
      const { data } = await supabase.from('memories').select('id, type, content, salience')
        .eq('user_id', userId).order('salience', { ascending: false }).order('created_at', { ascending: false }).limit(k)
      rows = data || []
    }
    if (!rows.length) return ''
    // best-effort: marca recordadas (no bloquea)
    const ids = rows.map(r => r.id).filter(Boolean)
    if (ids.length) supabase.from('memories').update({ last_recalled_at: new Date().toISOString() }).in('id', ids).then(() => {}, () => {})
    const lines = rows.map(r => `- [${r.type || 'memoria'}] ${String(r.content || '').slice(0, 200)}`)
    return `\n\n=== LO QUE SÉ DE TI (memoria del closer, gánala con el uso) ===\n${lines.join('\n')}\n=== FIN MEMORIA ===`
  } catch { return '' }
}
