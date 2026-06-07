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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'GET' ? 'list' : 'upsert')
  try {
    if (action === 'list')   return listLeads(req, res)
    if (action === 'upsert') return upsertLead(req, res)
    if (action === 'delete') return deleteLead(req, res)
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
    value:     lead.value === '' || lead.value == null ? null : Number(lead.value),
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
