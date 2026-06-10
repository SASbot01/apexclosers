// /api/offers — ofertas de trabajo que publican las CUENTAS DE CLIENTE. Son
// públicas para que los closers las vean; los closers NO se registran a ellas —
// el cliente contacta al closer (agenda del CV / chat / invitación). Solo las
// cuentas de cliente pueden crear/borrar ofertas.
//
//   GET  list    [&ownerId=]            → ofertas abiertas (o las de un cliente)
//   POST create  Body { userId, offer }  → crea (solo cuenta cliente)
//   POST delete  ?id=  Body { userId }    → borra (dueño)
import { supabase, supabaseReady } from './_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'POST' ? 'create' : 'list')
  try {
    if (action === 'list')   return listOffers(req, res)
    if (action === 'create') return createOffer(req, res)
    if (action === 'delete') return deleteOffer(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[offers]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function listOffers(req, res) {
  if (!supabaseReady()) return res.status(200).json({ offers: [] })
  const ownerId = req.query.ownerId
  let q = supabase.from('offers').select('*')
  q = ownerId ? q.eq('owner_id', ownerId) : q.eq('status', 'open')
  const { data: offers } = await q.order('created_at', { ascending: false }).limit(500)
  const ids = [...new Set((offers || []).map(o => o.owner_id))]
  const company = {}
  if (ids.length) {
    const [{ data: profs }, { data: users }] = await Promise.all([
      supabase.from('profiles').select('user_id, display_name, photo_url, headline').in('user_id', ids),
      supabase.from('users').select('id, name, email').in('id', ids),
    ])
    const byU = new Map((users || []).map(u => [u.id, u]))
    for (const id of ids) {
      const p = (profs || []).find(x => x.user_id === id); const u = byU.get(id)
      company[id] = { name: p?.display_name || u?.name || 'Empresa', photo_url: p?.photo_url || null, headline: p?.headline || null }
    }
  }
  return res.status(200).json({ offers: (offers || []).map(o => ({ ...o, company: company[o.owner_id] || null })) })
}

async function isClient(userId) {
  const { data } = await supabase.from('users').select('account_type').eq('id', userId).maybeSingle()
  return data?.account_type === 'client'
}

async function createOffer(req, res) {
  const { userId, offer } = req.body || {}
  if (!userId || !offer?.title) return res.status(400).json({ error: 'userId_and_title_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  if (!(await isClient(userId))) return res.status(403).json({ error: 'only_clients_can_post_offers' })
  const row = {
    owner_id: userId,
    title: String(offer.title).slice(0, 140),
    description: offer.description ? String(offer.description).slice(0, 4000) : null,
    comp: offer.comp ? String(offer.comp).slice(0, 200) : null,
    product: offer.product ? String(offer.product).slice(0, 200) : null,
    location: offer.location ? String(offer.location).slice(0, 120) : null,
    link: offer.link ? String(offer.link).slice(0, 400) : null,
    status: offer.status === 'closed' ? 'closed' : 'open',
  }
  if (offer.id) { // update
    const { data, error } = await supabase.from('offers').update(row).eq('id', offer.id).eq('owner_id', userId).select('*').single()
    if (error) throw new Error(error.message)
    return res.status(200).json({ offer: data })
  }
  const { data, error } = await supabase.from('offers').insert(row).select('*').single()
  if (error) throw new Error(error.message)
  return res.status(200).json({ offer: data })
}

async function deleteOffer(req, res) {
  const { userId } = req.body || {}
  const id = req.query.id
  if (!userId || !id) return res.status(400).json({ error: 'userId_and_id_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { error } = await supabase.from('offers').delete().eq('id', id).eq('owner_id', userId)
  if (error) throw new Error(error.message)
  return res.status(200).json({ ok: true })
}
