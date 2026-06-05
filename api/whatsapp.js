// /api/whatsapp — puente entre la app y el worker de WhatsApp (Baileys, QR).
// La app nunca habla con WhatsApp directamente: pasa por el worker (siempre
// encendido). Aquí: pedir QR/estado, enviar, y recibir entrantes (webhook).
//
// Env: WHATSAPP_WORKER_URL · WHATSAPP_WORKER_SECRET
import { supabase, supabaseReady } from './_lib/supabase.js'

const WORKER = process.env.WHATSAPP_WORKER_URL
const SECRET = process.env.WHATSAPP_WORKER_SECRET || ''
const H = { 'Content-Type': 'application/json', 'x-worker-secret': SECRET }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action
  try {
    if (action !== 'webhook' && !WORKER) return res.status(500).json({ error: 'whatsapp_worker_not_configured' })

    if (action === 'connect') {
      const { userId } = req.body || {}
      const r = await fetch(`${WORKER}/connect`, { method: 'POST', headers: H, body: JSON.stringify({ userId }) })
      return res.status(200).json(await r.json())
    }
    if (action === 'qr') {
      const r = await fetch(`${WORKER}/qr?userId=${encodeURIComponent(req.query.userId)}`, { headers: H })
      return res.status(200).json(await r.json())
    }
    if (action === 'status') {
      const r = await fetch(`${WORKER}/status?userId=${encodeURIComponent(req.query.userId)}`, { headers: H })
      return res.status(200).json(await r.json())
    }
    if (action === 'send') {
      const { userId, to, text, leadId } = req.body || {}
      const r = await fetch(`${WORKER}/send`, { method: 'POST', headers: H, body: JSON.stringify({ userId, to, text }) })
      if (supabaseReady() && leadId) {
        await supabase.from('lead_messages').insert({ owner_id: userId, lead_id: leadId, phone: to, direction: 'out', body: text })
      }
      return res.status(200).json(await r.json())
    }
    if (action === 'webhook') {
      // entrantes desde el worker
      if (SECRET && req.headers['x-worker-secret'] !== SECRET) return res.status(401).json({ error: 'unauthorized' })
      const { userId, phone, body, wa_id } = req.body || {}
      if (supabaseReady()) {
        const { data: lead } = await supabase.from('leads').select('id').eq('owner_id', userId).ilike('phone', `%${(phone || '').slice(-9)}%`).maybeSingle()
        await supabase.from('lead_messages').insert({ owner_id: userId, lead_id: lead?.id || null, phone, direction: 'in', body, wa_id })
      }
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[whatsapp]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}
