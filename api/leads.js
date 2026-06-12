// /api/leads — CRM persistido (tabla leads), POR USUARIO (owner_id).
//
// Acciones (?action=):
//   GET  list     ?userId=                       → leads del usuario
//   POST upsert   Body { userId, lead }          → crea/actualiza un lead → { lead }
//   POST delete   ?id=  Body { userId } | ?userId=→ borra un lead
//
// Aislamiento por owner_id en cada query. El CRM del front cae a datos mock si
// este endpoint no está disponible (vite dev sin backend).

import { supabase, supabaseReady } from './_lib/supabase.js'
import { detectProject } from './_lib/projectDetector.js'
import { toNum } from './_lib/num.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'GET' ? 'list' : 'upsert')
  try {
    if (action === 'list')   return await listLeads(req, res)
    if (action === 'upsert') return await upsertLead(req, res)
    if (action === 'delete') return await deleteLead(req, res)
    if (action === 'detect-project') return await detectLeadProject(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[leads]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

// Solo escribimos columnas reales de la tabla. client_id debe ser uuid o null
// (FK a clients) — los ids "de ciclo" del mock no son uuid → null.
function toRow(lead, userId) {
  const row = {
    owner_id:  userId,
    name:      lead.name ?? null,
    email:     lead.email ?? null,
    phone:     lead.phone ?? null,
    company:   lead.company ?? null,
    value:     lead.value === '' || lead.value == null ? null : toNum(lead.value, null),
    stage:     lead.stage ?? 'nuevo',
    source:    lead.source ?? null,
    tags:      Array.isArray(lead.tags) ? lead.tags : [],
    assignee:  lead.assignee ?? null,
    meeting_url: lead.meeting_url ?? null,
    platform:  lead.platform ?? null,
    next_step: lead.next_step ?? null,
    next_at:   lead.next_at || null,
    last_at:   lead.last_at || new Date().toISOString(),
  }
  if (lead.client_id && UUID_RE.test(String(lead.client_id))) row.client_id = lead.client_id
  if (lead.id && UUID_RE.test(String(lead.id))) row.id = lead.id
  return row
}

async function listLeads(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data, error } = await supabase
    .from('leads').select('*').eq('owner_id', userId)
    .order('last_at', { ascending: false, nullsFirst: false }).limit(1000)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ leads: data || [] })
}

async function upsertLead(req, res) {
  const { userId, lead } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!lead)   return res.status(400).json({ error: 'lead_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const row = toRow(lead, userId)
  const { data, error } = await supabase.from('leads').upsert(row).select('*').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ lead: data })
}

async function deleteLead(req, res) {
  const id = req.query.id || req.body?.id
  const userId = req.query.userId || req.body?.userId
  if (!id || !userId) return res.status(400).json({ error: 'id_and_userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { error } = await supabase.from('leads').delete().eq('id', id).eq('owner_id', userId)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}

// Detecta (IA) a qué proyecto pertenece un lead y lo guarda. Usa el contexto del
// lead (nombre, empresa, fuente, llamada asociada si la hay).
async function detectLeadProject(req, res) {
  const { userId, leadId } = req.body || {}
  if (!userId || !leadId) return res.status(400).json({ error: 'userId_and_leadId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).eq('owner_id', userId).maybeSingle()
  if (!lead) return res.status(404).json({ error: 'not_found' })
  // Si el lead salió de una llamada, sumamos su título/resumen al contexto.
  let title = lead.name, summary = [lead.company, lead.source, lead.next_step].filter(Boolean).join(' · ')
  if (lead.calendar_event_id) {
    const { data: call } = await supabase.from('calls').select('title, summary').eq('user_id', userId).eq('calendar_event_id', lead.calendar_event_id).maybeSingle()
    if (call) { title = call.title || title; summary = call.summary || summary }
  }
  const det = await detectProject({ closerId: userId, title, summary, attendees: [lead.email].filter(Boolean) })
  if (det.key) await supabase.from('leads').update({ project: det.key }).eq('id', leadId)
  return res.status(200).json({ ok: true, project: det.key, project_name: det.name, confidence: det.confidence, method: det.method })
}
