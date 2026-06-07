// Workflow de seguimiento: notificaciones + secuencias (se disparan al clasificar
// la llamada) + ejecución de tareas por cron. El ENVÍO real por Email/WhatsApp/SMS
// requiere integraciones (no configuradas aún): de momento cada tarea "ejecutada"
// genera una notificación accionable para el closer.

import { supabase, supabaseReady } from './supabase.js'

// Crea una notificación para el usuario.
export async function notify(userId, { kind, title, body, link } = {}) {
  if (!supabaseReady() || !userId) return
  try {
    await supabase.from('notifications').insert({ user_id: userId, kind, title, body: body || null, link: link || null })
  } catch (e) { console.error('[workflow] notify failed', e.message) }
}

// Al clasificar una llamada por estado, encola las tareas de la secuencia ACTIVA
// cuyo trigger coincide con ese estado (o una secuencia 'cualquiera'/'any').
export async function enqueueFollowUps({ ownerId, callId, leadId, state, contact }) {
  if (!supabaseReady() || !ownerId || !state) return 0
  try {
    const { data: seqs } = await supabase.from('sequences')
      .select('*').eq('owner_id', ownerId).eq('active', true)
      .in('trigger_state', [state, 'any'])
    const now = Date.now()
    let created = 0
    for (const seq of (seqs || [])) {
      const steps = Array.isArray(seq.steps) ? seq.steps : []
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i] || {}
        const delayH = Number(s.delay_hours) || 0
        const { error } = await supabase.from('follow_up_tasks').insert({
          owner_id: ownerId, call_id: callId || null, lead_id: leadId || null,
          sequence_id: seq.id, step_index: i,
          channel: s.channel || 'email', type: s.type || 'seguimiento',
          message: s.message || null, contact: contact || null,
          run_at: new Date(now + delayH * 3600 * 1000).toISOString(),
          status: 'pending',
        })
        if (!error) created++
      }
    }
    return created
  } catch (e) { console.error('[workflow] enqueue failed', e.message); return 0 }
}

// Cron: ejecuta las tareas vencidas. Sin integración de canal real, marca 'sent'
// y notifica al closer para que haga/confirme el seguimiento.
export async function processDueFollowUps() {
  if (!supabaseReady()) return { processed: 0 }
  try {
    const { data: due } = await supabase.from('follow_up_tasks')
      .select('*').eq('status', 'pending').lte('run_at', new Date().toISOString()).limit(200)
    let processed = 0
    for (const t of (due || [])) {
      const channel = (t.channel || 'email').toUpperCase()
      const tipo = t.type === 'confirmacion' ? 'Confirmación' : 'Seguimiento'
      await notify(t.owner_id, {
        kind: 'follow_up',
        title: `${tipo} por ${channel}`,
        body: `${t.contact ? `Para ${t.contact}: ` : ''}${t.message || 'Toca hacer el seguimiento.'}`,
        link: '/pipeline',
      })
      await supabase.from('follow_up_tasks').update({ status: 'sent' }).eq('id', t.id)
      processed++
    }
    return { processed }
  } catch (e) { console.error('[workflow] processDue failed', e.message); return { processed: 0, error: e.message } }
}
