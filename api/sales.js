// /api/sales — tabla de ventas persistida + verificación por justificante.
//
// Flujo de la verificación (lo que pidió el producto):
//   1) Una venta entra (manual, CSV o AUTOMÁTICA desde la transcripción) con
//      status='pending'. Aparece en la tabla como "venta cerrada (pendiente)".
//   2) Subes un justificante (proof) → upload-proof.
//   3) Confirmas que es real → verify → status='verified'.
//   Solo las ventas 'verified' cuentan en las métricas (ver api/metrics.js).
//
// Acciones (?action=):
//   GET  list         ?userId= [&status=]            → ventas del usuario
//   POST upsert       Body { userId, sale }          → crea/edita (tabla editable)
//   POST delete       ?id= Body { userId }           → borra
//   POST upload-proof Body { userId, id, proof(dataURL), filename } → guarda justificante
//   POST verify       ?id= Body { userId }           → marca verificada (exige justificante)

import { supabase, supabaseReady } from './_lib/supabase.js'
import { notify } from './_lib/workflow.js'
import { toNum } from './_lib/num.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROOF_BUCKET = 'proofs'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'GET' ? 'list' : 'upsert')
  try {
    if (action === 'list')         return await listSales(req, res)
    if (action === 'upsert')       return await upsertSale(req, res)
    if (action === 'delete')       return await deleteSale(req, res)
    if (action === 'upload-proof') return await uploadProof(req, res)
    if (action === 'verify')       return await verifySale(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[sales]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

function toRow(sale, userId) {
  const row = {
    owner_id:       userId,
    client_id:      sale.client_id ?? null,
    call_id:        sale.call_id && UUID_RE.test(String(sale.call_id)) ? sale.call_id : null,
    date:           sale.date || new Date().toISOString(),
    closer:         sale.closer ?? null,
    product:        sale.product ?? null,
    revenue:        toNum(sale.revenue, 0),
    cash_collected: toNum(sale.cash_collected, 0),
    payment_method: sale.payment_method ?? null,
    payment_type:   sale.payment_type || 'Pago único',
    source:         sale.source || 'manual',
    notes:          sale.notes ?? null,
  }
  if (sale.status && ['pending', 'verified', 'rejected'].includes(sale.status)) row.status = sale.status
  if (sale.id && UUID_RE.test(String(sale.id))) row.id = sale.id
  return row
}

async function listSales(req, res) {
  const { userId, status } = req.query
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  let q = supabase.from('sales').select('*').eq('owner_id', userId)
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('date', { ascending: false }).limit(2000)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ sales: data || [] })
}

async function upsertSale(req, res) {
  const { userId, sale } = req.body || {}
  if (!userId || !sale) return res.status(400).json({ error: 'userId_and_sale_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data, error } = await supabase.from('sales').upsert(toRow(sale, userId)).select('*').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ sale: data })
}

async function deleteSale(req, res) {
  const id = req.query.id || req.body?.id
  const userId = req.query.userId || req.body?.userId
  if (!id || !userId) return res.status(400).json({ error: 'id_and_userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { error } = await supabase.from('sales').delete().eq('id', id).eq('owner_id', userId)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true })
}

// Sube el justificante a Supabase Storage (bucket 'proofs', creado si falta) y
// guarda su URL en la venta. La venta sigue 'pending' hasta que se verifique.
async function uploadProof(req, res) {
  const { userId, id, proof, filename } = req.body || {}
  if (!userId || !id) return res.status(400).json({ error: 'userId_and_id_required' })
  if (!proof) return res.status(400).json({ error: 'proof_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })

  // proof = data URL "data:<mime>;base64,<...>"
  const m = String(proof).match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return res.status(400).json({ error: 'proof_must_be_data_url' })
  const contentType = m[1]
  const buffer = Buffer.from(m[2], 'base64')
  const ext = (filename && filename.includes('.')) ? filename.split('.').pop() : (contentType.split('/')[1] || 'bin')
  const path = `${userId}/${id}.${ext}`

  let proofUrl = null
  try {
    await supabase.storage.createBucket(PROOF_BUCKET, { public: true }).catch(() => null)
    const up = await supabase.storage.from(PROOF_BUCKET).upload(path, buffer, { contentType, upsert: true })
    if (up.error) throw up.error
    proofUrl = supabase.storage.from(PROOF_BUCKET).getPublicUrl(path).data.publicUrl
  } catch (e) {
    // Fallback: si Storage no está disponible, guardamos el data-url directamente.
    console.error('[sales] storage upload failed, fallback to data-url', e.message)
    proofUrl = String(proof).slice(0, 5_000_000)
  }

  const { data, error } = await supabase.from('sales')
    .update({ proof_url: proofUrl, proof_name: filename || `justificante.${ext}`, status: 'pending' })
    .eq('id', id).eq('owner_id', userId).select('*').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ sale: data })
}

// Confirma que la venta es real → cuenta en métricas. Exige justificante subido.
async function verifySale(req, res) {
  const id = req.query.id || req.body?.id
  const userId = req.query.userId || req.body?.userId
  if (!id || !userId) return res.status(400).json({ error: 'id_and_userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data: row } = await supabase.from('sales').select('proof_url').eq('id', id).eq('owner_id', userId).maybeSingle()
  if (!row) return res.status(404).json({ error: 'sale_not_found' })
  if (!row.proof_url) return res.status(400).json({ error: 'proof_required_before_verify' })
  const { data, error } = await supabase.from('sales').update({ status: 'verified' }).eq('id', id).eq('owner_id', userId).select('*').single()
  if (error) return res.status(500).json({ error: error.message })
  await notify(userId, { kind: 'sale_verified', title: 'Venta verificada', body: `${data.product || 'Venta'} · ${data.revenue || 0} € añadida a tus métricas.`, link: '/finanzas' })
  return res.status(200).json({ sale: data })
}
