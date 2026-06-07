// /api/sequences — Workflow / Configuración de Secuencias de seguimiento.
// Una secuencia se dispara por un estado de llamada y tiene pasos
// {delay_hours, channel, type, message}. Las tareas las ejecuta el cron.
//
// Acciones (?action=):
//   GET  list    ?userId=                  → secuencias + nº de tareas pendientes
//   POST upsert  Body { userId, sequence } → crea/edita
//   POST delete  ?id= Body { userId }      → borra
//   GET  tasks   ?userId=                  → tareas de seguimiento pendientes

import { supabase, supabaseReady } from './_lib/supabase.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHANNELS = ['email', 'whatsapp', 'sms']
const TYPES = ['confirmacion', 'seguimiento']

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'GET' ? 'list' : 'upsert')
  try {
    if (action === 'list')   return listSeq(req, res)
    if (action === 'upsert') return upsertSeq(req, res)
    if (action === 'delete') return delSeq(req, res)
    if (action === 'tasks')  return listTasks(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[sequences]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

function cleanSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map(s => ({
    delay_hours: Math.max(0, Number(s.delay_hours) || 0),
    channel: CHANNELS.includes(s.channel) ? s.channel : 'email',
    type: TYPES.includes(s.type) ? s.type : 'seguimiento',
    message: String(s.message || '').slice(0, 1000),
  }))
}

async function listSeq(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data } = await supabase.from('sequences').select('*').eq('owner_id', userId).order('created_at')
  const { count } = await supabase.from('follow_up_tasks').select('id', { count: 'exact', head: true }).eq('owner_id', userId).eq('status', 'pending')
  return res.status(200).json({ sequences: data || [], pendingTasks: count || 0 })
}

async function upsertSeq(req, res) {
  const { userId, sequence } = req.body || {}
  if (!userId || !sequence) return res.status(400).json({ error: 'userId_and_sequence_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const row = {
    owner_id: userId,
    name: String(sequence.name || 'Secuencia'),
    trigger_state: sequence.trigger_state || 'follow_up_hot',
    active: sequence.active !== false,
    steps: cleanSteps(sequence.steps),
  }
  if (sequence.id && UUID_RE.test(String(sequence.id))) row.id = sequence.id
  const { data, error } = await supabase.from('sequences').upsert(row).select('*').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ sequence: data })
}

async function delSeq(req, res) {
  const id = req.query.id || req.body?.id
  const userId = req.query.userId || req.body?.userId
  if (!id || !userId) return res.status(400).json({ error: 'id_and_userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  await supabase.from('sequences').delete().eq('id', id).eq('owner_id', userId)
  return res.status(200).json({ ok: true })
}

async function listTasks(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data } = await supabase.from('follow_up_tasks').select('*').eq('owner_id', userId)
    .order('run_at', { ascending: true }).limit(200)
  return res.status(200).json({ tasks: data || [] })
}
