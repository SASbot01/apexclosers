// /api/profile — perfil público del closer (estilo red social): nick, descripción,
// foto, links, info + métricas PÚBLICAS + botón currículum (CV).
//
// Acciones (?action=):
//   GET  get          ?userId= [&viewerId=]      → { profile, metrics, isOwner, friendship }
//   GET  by-nick      ?nick=  [&viewerId=]        → idem buscando por nickname
//   POST update       Body { userId, profile }    → upsert perfil (nick único)
//   POST upload-photo Body { userId, photo(dataURL), filename } → foto de perfil
//   GET  search       ?q= [&viewerId=]            → perfiles por nickname
//   GET  cv           ?userId= [&viewerId=]        → datos del currículum (+ resumen IA)

import { supabase, supabaseReady } from './_lib/supabase.js'
import { computeUserMetrics, METRIC_DEFS } from './metrics.js'
import { localChat, localLLMReady } from './_lib/localLLM.js'

const AVATAR_BUCKET = 'avatars'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'POST' ? 'update' : 'get')
  try {
    if (action === 'get')          return getProfile(req, res)
    if (action === 'by-nick')      return getByNick(req, res)
    if (action === 'update')       return updateProfile(req, res)
    if (action === 'upload-photo') return uploadPhoto(req, res)
    if (action === 'search')       return search(req, res)
    if (action === 'cv')           return cv(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[profile]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function loadProfile(userId) {
  const { data: prof } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle()
  const { data: user } = await supabase.from('users').select('email, name, picture').eq('id', userId).maybeSingle()
  return {
    user_id: userId,
    nickname: prof?.nickname || null,
    display_name: prof?.display_name || user?.name || null,
    headline: prof?.headline || null,
    bio: prof?.bio || null,
    photo_url: prof?.photo_url || user?.picture || null,
    links: Array.isArray(prof?.links) ? prof.links : [],
    location: prof?.location || null,
    email: user?.email || null,
  }
}

// Métricas visibles para quien mira (públicas si es un tercero).
async function publicMetricsFor(userId, viewerId) {
  const isOwner = viewerId === userId
  const { data: vis } = await supabase.from('metric_visibility').select('visible').eq('user_id', userId).maybeSingle()
  const visible = (vis && vis.visible) || {}
  const metrics = await computeUserMetrics(userId)
  return METRIC_DEFS
    .filter(d => isOwner || visible[d.key] === true)
    .map(d => ({ ...d, value: metrics ? metrics[d.key] : null, public: visible[d.key] === true }))
}

async function friendshipBetween(a, b) {
  if (!a || !b || a === b) return null
  const { data } = await supabase.from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
    .maybeSingle()
  return data || null
}

async function respondProfile(res, userId, viewerId) {
  const isOwner = (viewerId || userId) === userId
  const [profile, metrics, friendship] = await Promise.all([
    loadProfile(userId),
    publicMetricsFor(userId, viewerId || userId),
    isOwner ? Promise.resolve(null) : friendshipBetween(userId, viewerId),
  ])
  return res.status(200).json({ profile, metrics, isOwner, friendship })
}

async function getProfile(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  return respondProfile(res, userId, req.query.viewerId)
}

async function getByNick(req, res) {
  const nick = req.query.nick
  if (!nick) return res.status(400).json({ error: 'nick_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data } = await supabase.from('profiles').select('user_id').ilike('nickname', nick).maybeSingle()
  if (!data) return res.status(404).json({ error: 'not_found' })
  return respondProfile(res, data.user_id, req.query.viewerId)
}

async function updateProfile(req, res) {
  const { userId, profile } = req.body || {}
  if (!userId || !profile) return res.status(400).json({ error: 'userId_and_profile_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })

  const nickname = profile.nickname ? String(profile.nickname).trim().toLowerCase().replace(/[^a-z0-9_.]/g, '') : null
  if (nickname) {
    const { data: taken } = await supabase.from('profiles').select('user_id').ilike('nickname', nickname).maybeSingle()
    if (taken && taken.user_id !== userId) return res.status(409).json({ error: 'nickname_taken' })
  }
  const row = {
    user_id: userId,
    nickname,
    display_name: profile.display_name ?? null,
    headline: profile.headline ?? null,
    bio: profile.bio ?? null,
    location: profile.location ?? null,
    links: Array.isArray(profile.links) ? profile.links.filter(l => l && l.url).map(l => ({ label: String(l.label || l.url), url: String(l.url) })) : [],
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'user_id' })
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true, profile: await loadProfile(userId) })
}

async function uploadPhoto(req, res) {
  const { userId, photo, filename } = req.body || {}
  if (!userId || !photo) return res.status(400).json({ error: 'userId_and_photo_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const m = String(photo).match(/^data:([^;]+);base64,(.+)$/)
  if (!m) return res.status(400).json({ error: 'photo_must_be_data_url' })
  const contentType = m[1]
  const buffer = Buffer.from(m[2], 'base64')
  const ext = (contentType.split('/')[1] || 'png').replace('jpeg', 'jpg')
  const path = `${userId}.${ext}`
  let url = null
  try {
    await supabase.storage.createBucket(AVATAR_BUCKET, { public: true }).catch(() => null)
    const up = await supabase.storage.from(AVATAR_BUCKET).upload(path, buffer, { contentType, upsert: true })
    if (up.error) throw up.error
    url = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`
  } catch (e) {
    console.error('[profile] avatar upload failed, fallback data-url', e.message)
    url = String(photo).slice(0, 5_000_000)
  }
  await supabase.from('profiles').upsert({ user_id: userId, photo_url: url, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  return res.status(200).json({ ok: true, photo_url: url })
}

// Busca entre TODOS los usuarios que han entrado a la plataforma (tabla users,
// por nombre o email) + los que tienen perfil (por nickname). Tengan perfil o no.
async function search(req, res) {
  const q = (req.query.q || '').trim()
  const viewerId = req.query.viewerId || null
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  if (!q) return res.status(200).json({ results: [] })
  const like = `%${q}%`
  const [{ data: profs }, { data: users }] = await Promise.all([
    supabase.from('profiles').select('user_id, nickname, display_name, headline, photo_url')
      .or(`nickname.ilike.${like},display_name.ilike.${like}`).limit(25),
    supabase.from('users').select('id, name, email, picture')
      .or(`name.ilike.${like},email.ilike.${like}`).limit(25),
  ])
  const byId = new Map()
  for (const p of (profs || [])) byId.set(p.user_id, { user_id: p.user_id, nickname: p.nickname, display_name: p.display_name, headline: p.headline, photo_url: p.photo_url })
  for (const u of (users || [])) {
    const ex = byId.get(u.id) || { user_id: u.id, nickname: null, headline: null }
    ex.display_name = ex.display_name || u.name || (u.email ? u.email.split('@')[0] : 'Closer')
    ex.photo_url = ex.photo_url || u.picture || null
    byId.set(u.id, ex)
  }
  let results = [...byId.values()]
  if (viewerId) results = results.filter(r => r.user_id !== viewerId)   // no te listes a ti
  return res.status(200).json({ results: results.slice(0, 25) })
}

// Currículum: estructura el perfil + métricas públicas en un CV y, si hay LLM
// local, redacta un resumen profesional. El front lo muestra y permite descargar.
async function cv(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const viewerId = req.query.viewerId || userId
  const [profile, metrics] = await Promise.all([loadProfile(userId), publicMetricsFor(userId, viewerId)])

  const eur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
  const fmt = (m) => m.fmt === 'money' ? eur(m.value) : m.fmt === 'pct' ? (m.value == null ? '—' : `${Math.round(m.value * 100)}%`) : new Intl.NumberFormat('es-ES').format(Math.round(m.value || 0))
  const highlights = metrics.filter(m => m.value != null && m.value !== 0).map(m => ({ label: m.label, value: fmt(m) }))

  let summary = null
  if (localLLMReady()) {
    try {
      const sys = 'Eres un redactor de perfiles profesionales de ventas. Escribe en español un resumen de 2-3 frases, en tercera persona, sobrio y creíble, para el CV de un closer. Sin emojis, sin exclamaciones, sin inventar cifras: usa solo las que te den.'
      const usr = `Nombre: ${profile.display_name || profile.nickname || 'Closer'}\nTitular: ${profile.headline || '—'}\nBio: ${profile.bio || '—'}\nMétricas públicas: ${highlights.map(h => `${h.label} ${h.value}`).join(', ') || '—'}`
      summary = (await localChat({ system: sys, user: usr, maxTokens: 220 })).trim() || null
    } catch { /* sin resumen IA */ }
  }

  return res.status(200).json({
    cv: {
      name: profile.display_name || profile.nickname || 'Closer',
      nickname: profile.nickname,
      headline: profile.headline,
      location: profile.location,
      bio: profile.bio,
      photo_url: profile.photo_url,
      links: profile.links,
      highlights,
      summary,
      generated_at: new Date().toISOString(),
    },
  })
}
