// Detector de PROYECTO de una llamada. Un closer puede llevar varios clientes/
// proyectos a la vez (= los equipos donde está aceptado). Esta utilidad averigua
// a QUÉ proyecto pertenece una llamada usando lo que casi siempre está en los
// datos: el título, los asistentes, la cuenta de Google/calendario en la que cae
// y la transcripción. Primero heurística (rápida, gratis); si no es clara y hay
// LLM local, deja que la IA elija entre los proyectos del closer.

import { supabase } from './supabase.js'
import { localChat, localLLMReady } from './localLLM.js'

// Proyectos del closer = equipos donde está ACEPTADO (cada uno tiene un
// client_key = proyecto y un nombre; la empresa dueña aporta más contexto).
export async function getCloserProjects(closerId) {
  const { data: mems } = await supabase.from('team_members').select('team_id').eq('user_id', closerId).eq('status', 'accepted')
  const teamIds = [...new Set((mems || []).map(m => m.team_id))]
  if (!teamIds.length) return []
  const { data: teams } = await supabase.from('teams').select('id, name, client_key, owner_id').in('id', teamIds)
  const ownerIds = [...new Set((teams || []).map(t => t.owner_id))]
  const { data: owners } = ownerIds.length ? await supabase.from('users').select('id, name, email').in('id', ownerIds) : { data: [] }
  const ownerName = (id) => { const u = (owners || []).find(o => o.id === id); return u?.name || u?.email?.split('@')[0] || '' }
  const seen = new Set(), out = []
  for (const t of (teams || [])) {
    if (!t.client_key || seen.has(t.client_key)) continue
    seen.add(t.client_key)
    out.push({ key: t.client_key, name: t.name || ownerName(t.owner_id), company: ownerName(t.owner_id) })
  }
  return out
}

const norm = (s) => String(s || '').toLowerCase()
const tokenize = (s) => norm(s).split(/[^a-z0-9áéíóúñü]+/i).filter(w => w.length >= 3)

// Detecta el proyecto. ctx: { closerId, title, summary, transcript, attendees,
// accountLabel, accountEmail }. opts.useLLM=false para rutas baratas (cron).
export async function detectProject(ctx, opts = {}) {
  const { closerId, title, summary, transcript, attendees, accountLabel, accountEmail } = ctx
  const useLLM = opts.useLLM !== false
  const candidates = opts.candidates || await getCloserProjects(closerId)
  if (!candidates.length) return { key: null, name: null, confidence: 0, method: 'no_projects' }
  if (candidates.length === 1) return { key: candidates[0].key, name: candidates[0].name, confidence: 0.9, method: 'single' }

  const ctxParts = [
    title, summary, accountLabel, accountEmail,
    (attendees || []).join(' '),
    Array.isArray(transcript) ? transcript.slice(0, 60).map(s => s.text).join(' ') : '',
  ].filter(Boolean)
  const context = ctxParts.join(' \n ')
  const ctxLow = norm(context)

  // Heurística: coincidencias de los tokens del nombre/empresa del proyecto en el
  // contexto. La cuenta de Google (alias) pesa más: si el closer conectó el Gmail
  // del cliente y lo etiquetó, eso es casi una certeza.
  const scored = candidates.map(c => {
    const nameToks = tokenize(c.name)
    const toks = [...new Set([...nameToks, ...tokenize(c.company)])]
    let score = 0
    for (const t of toks) if (ctxLow.includes(t)) score += 1
    if (accountLabel && nameToks.some(t => norm(accountLabel).includes(t))) score += 3
    return { c, score }
  }).sort((a, b) => b.score - a.score)

  const top = scored[0], second = scored[1]
  if (top.score >= 1 && (!second || top.score > second.score)) {
    return { key: top.c.key, name: top.c.name, confidence: Math.min(0.95, 0.6 + top.score * 0.1), method: 'heuristic' }
  }

  // LLM local: que elija entre los proyectos (devuelve el número).
  if (useLLM && localLLMReady() && context.trim().length > 20) {
    const list = candidates.map((c, i) => `${i + 1}. ${c.name}${c.company && c.company !== c.name ? ` (empresa: ${c.company})` : ''}`).join('\n')
    const system = 'Eres un clasificador. Te doy los PROYECTOS de un closer y el contexto de una llamada de ventas. Devuelve SOLO el número del proyecto al que pertenece la llamada, o 0 si no está claro. Responde con un único número, nada más.'
    const user = `PROYECTOS:\n${list}\n\nCONTEXTO DE LA LLAMADA:\n${context.slice(0, 4000)}\n\nNúmero del proyecto:`
    try {
      const raw = await localChat({ system, user, maxTokens: 8 })
      const m = String(raw).match(/\d+/)
      const idx = m ? parseInt(m[0], 10) : 0
      if (idx >= 1 && idx <= candidates.length) {
        const c = candidates[idx - 1]
        return { key: c.key, name: c.name, confidence: 0.8, method: 'llm' }
      }
    } catch (e) { console.error('[projectDetector] llm failed', e.message) }
  }

  return { key: null, name: null, confidence: 0, method: 'unknown' }
}
