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
import { supabase, supabaseReady } from './_lib/supabase.js'

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
  })
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
  res.end()
}

async function googleCallback(req, res) {
  const code = req.query.code
  if (!code) return res.status(400).json({ error: 'code_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })

  // 1) code → tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }),
  })
  const tokens = await tokenRes.json()
  if (!tokens.access_token) return res.status(401).json({ error: 'token_exchange_failed', detail: tokens })

  // 2) userinfo
  const uiRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const ui = await uiRes.json()
  if (!ui.email) return res.status(401).json({ error: 'userinfo_failed' })

  // 3) upsert user
  const { data: user } = await supabase
    .from('users')
    .upsert({ google_sub: ui.sub, email: ui.email, name: ui.name || null, picture: ui.picture || null }, { onConflict: 'email' })
    .select('id, email, name, picture')
    .single()

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
  const { data: user } = await supabase.from('users').select('id, email, name, picture').eq('id', sess.user_id).maybeSingle()
  if (!user) return res.status(401).json({ error: 'user_not_found' })
  return res.status(200).json({ user })
}

async function logout(req, res) {
  const token = getToken(req)
  if (token && supabaseReady()) await supabase.from('sessions').delete().eq('token', token)
  return res.status(200).json({ ok: true })
}
