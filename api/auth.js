// /api/auth — login con Google (OAuth) → sesión propia. Cualquier persona entra.
//
// Acciones (?action=):
//   google-start     → redirige a Google (consent screen)
//   google-callback  → intercambia el code, crea usuario+sesión, vuelve a la app
//   me?token=        → valida la sesión y devuelve el usuario
//   logout?token=    → cierra la sesión
//
// Env: GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET · APEX_PUBLIC_BASE_URL · SUPABASE_*

import crypto from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { supabase, supabaseReady } from './_lib/supabase.js'
import { hashPassword, verifyPassword } from './_lib/password.js'

const execFileP = promisify(execFile)

// HTTP a Google con fallback robusto: el fetch de Node falla en algunos entornos
// al alcanzar `oauth2.googleapis.com` (resolución/red), mientras que curl -4 sí
// llega. Intentamos fetch con corte rápido y, si falla, caemos a curl. En
// producción (Vercel / arranque normal) el fetch va directo y curl nunca corre.
async function httpJson(url, { method = 'GET', form, headers = {} } = {}) {
  const body = form ? new URLSearchParams(form).toString() : undefined
  const h = { ...headers }
  if (body) h['Content-Type'] = 'application/x-www-form-urlencoded'
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 4000)   // falla rápido para no colgar el login
    const r = await fetch(url, { method, headers: h, body, signal: ctl.signal })
    clearTimeout(t)
    return await r.json()
  } catch {
    const args = ['-4', '-sS', '-m', '15', '-X', method, url]
    for (const [k, v] of Object.entries(h)) args.push('-H', `${k}: ${v}`)
    if (body) args.push('--data', body)
    const { stdout } = await execFileP('curl', args)
    return JSON.parse(stdout)
  }
}

function baseUrl(req) {
  return process.env.APEX_PUBLIC_BASE_URL || `https://${req.headers.host}`
}
function redirectUri(req) {
  return `${baseUrl(req)}/api/auth?action=google-callback`
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action
  try {
    switch (action) {
      case 'google-start':    return googleStart(req, res)
      case 'google-callback': return googleCallback(req, res)
      case 'me':              return me(req, res)
      case 'integrations':    return integrations(req, res)
      case 'client-login':    return clientLogin(req, res)
      case 'create-client':   return createClientAccount(req, res)
      case 'logout':          return logout(req, res)
      default:                return res.status(400).json({ error: `unknown_action: ${action}` })
    }
  } catch (e) {
    console.error('[auth]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

function googleStart(req, res) {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'google_not_configured' })
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
    ...(req.query.ref ? { state: String(req.query.ref).slice(0, 64) } : {}),   // afiliado que lo trajo
  })
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
  res.end()
}

async function googleCallback(req, res) {
  const code = req.query.code
  if (!code) return res.status(400).json({ error: 'code_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })

  // 1) code → tokens (con fallback a curl si el fetch de Node no alcanza Google)
  const tokens = await httpJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    form: {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    },
  })
  if (!tokens.access_token) return res.status(401).json({ error: 'token_exchange_failed', detail: tokens })

  // 2) userinfo
  const ui = await httpJson('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!ui.email) return res.status(401).json({ error: 'userinfo_failed' })

  // 3) upsert user (¿es nuevo? para el tracking de afiliados)
  const { data: existingUser } = await supabase.from('users').select('id').eq('email', ui.email).maybeSingle()
  const isNew = !existingUser
  const { data: user } = await supabase
    .from('users')
    .upsert({ google_sub: ui.sub, email: ui.email, name: ui.name || null, picture: ui.picture || null }, { onConflict: 'email' })
    .select('id, email, name, picture')
    .single()

  // 3b) AFILIADOS: si vino con ?ref= (en el OAuth state) y es un registro NUEVO,
  // anota que ese afiliado lo trajo (unique(referred_id) evita duplicados).
  const ref = req.query.state
  if (isNew && ref && /^[0-9a-f-]{36}$/i.test(ref) && ref !== user.id) {
    try {
      const { data: referrer } = await supabase.from('users').select('id, account_type').eq('id', ref).maybeSingle()
      if (referrer) {
        const commission = referrer.account_type === 'community' ? 25 : 20
        await supabase.from('referrals').insert({ referrer_id: ref, referred_id: user.id, commission, status: 'active' })
      }
    } catch (e) { console.error('[auth] referral record failed', e.message) }
  }

  // 4) crear sesión
  const token = crypto.randomBytes(24).toString('hex')
  await supabase.from('sessions').insert({
    token,
    user_id: user.id,
    expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  })

  // 4b) guardar tokens de Google (para leer calendario + compartidos, crear leads)
  await supabase.from('google_tokens').upsert({
    user_id: user.id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
    expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  // 5) volver a la app con el token
  res.writeHead(302, { Location: `${baseUrl(req)}/?session=${token}` })
  res.end()
}

function getToken(req) {
  return req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null
}

async function me(req, res) {
  const token = getToken(req)
  if (!token) return res.status(401).json({ error: 'no_token' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data: sess } = await supabase.from('sessions').select('user_id, expires_at').eq('token', token).maybeSingle()
  if (!sess) return res.status(401).json({ error: 'invalid_session' })
  if (sess.expires_at && new Date(sess.expires_at) < new Date()) return res.status(401).json({ error: 'expired' })
  const { data: user } = await supabase.from('users').select('id, email, name, picture, account_type').eq('id', sess.user_id).maybeSingle()
  if (!user) return res.status(401).json({ error: 'user_not_found' })
  return res.status(200).json({ user })
}

// Login de cuenta de CLIENTE (email + contraseña). Solo cuentas account_type=client.
async function clientLogin(req, res) {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data: u } = await supabase.from('users').select('id, email, name, picture, account_type, password_hash').ilike('email', String(email).trim()).maybeSingle()
  if (!u || u.account_type !== 'client' || !verifyPassword(password, u.password_hash)) return res.status(401).json({ error: 'invalid_credentials' })
  const token = crypto.randomBytes(24).toString('hex')
  await supabase.from('sessions').insert({ token, user_id: u.id, expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString() })
  return res.status(200).json({ token, user: { id: u.id, email: u.email, name: u.name, picture: u.picture, account_type: u.account_type } })
}

// Provisión de una cuenta de CLIENTE (la creamos NOSOTROS). Protegida por un
// secreto admin (env APEX_ADMIN_SECRET). El email debe ser real (es el login).
async function createClientAccount(req, res) {
  const { secret, email, password, name } = req.body || {}
  if (!process.env.APEX_ADMIN_SECRET || secret !== process.env.APEX_ADMIN_SECRET) return res.status(403).json({ error: 'forbidden' })
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const password_hash = hashPassword(password)
  const { data: existing } = await supabase.from('users').select('id').ilike('email', String(email).trim()).maybeSingle()
  let id
  if (existing) {
    await supabase.from('users').update({ account_type: 'client', password_hash, ...(name ? { name } : {}) }).eq('id', existing.id)
    id = existing.id
  } else {
    const { data: u, error } = await supabase.from('users').insert({ email: String(email).trim(), name: name || null, account_type: 'client', password_hash }).select('id').single()
    if (error) return res.status(500).json({ error: error.message })
    id = u.id
  }
  await supabase.from('profiles').upsert({ user_id: id, display_name: name || String(email).split('@')[0], updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  return res.status(200).json({ ok: true, id })
}

// Estado real de las integraciones del usuario (para Ajustes → Integraciones).
// Google Calendar = conectado si el usuario tiene tokens de Google guardados
// (es decir, hizo login con Google, que ya incluye el scope de Calendar).
async function integrations(req, res) {
  const userId = req.query.userId
  let google = false
  if (userId && supabaseReady()) {
    const { data } = await supabase.from('google_tokens').select('user_id').eq('user_id', userId).maybeSingle()
    google = !!data
  }
  return res.status(200).json({ google, recall: !!process.env.RECALL_API_KEY })
}

async function logout(req, res) {
  const token = getToken(req)
  if (token && supabaseReady()) await supabase.from('sessions').delete().eq('token', token)
  return res.status(200).json({ ok: true })
}
