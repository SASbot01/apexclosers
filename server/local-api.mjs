// Backend LOCAL para APEX-CLOSERS (Opción A: todo corre en este equipo).
// Ejecuta los handlers de api/*.js (estilo Vercel) sin modificarlos, para que
// /api/auth, /api/calendar, /api/recall, /api/whatsapp funcionen en local.
// Incluye el "cron" local (schedule-bots + reconcile-stuck) que en Vercel haría
// vercel.json. Cuando pasemos a Vercel, este fichero no se usa.
//
//   node server/local-api.mjs          (lo arranca local-ai/start-local-ai.sh)
//
// Carga .env, shimea WebSocket (Supabase realtime lo exige en Node < 22) y
// adapta req/res de Node http al contrato Vercel (req.query/body, res.status().json()).
import 'dotenv/config'
import http from 'node:http'
import ws from 'ws'
if (!globalThis.WebSocket) globalThis.WebSocket = ws   // Supabase realtime en Node 20

const PORT = Number(process.env.LOCAL_API_PORT || 5181)

// Import dinámico DESPUÉS del shim/env: los handlers importan supabase.js, que
// construye el cliente al cargar (necesita env + WebSocket ya presentes).
const ROUTES = {
  '/api/auth':     (await import('../api/auth.js')).default,
  '/api/calendar': (await import('../api/calendar.js')).default,
  '/api/recall':   (await import('../api/recall.js')).default,
  '/api/whatsapp': (await import('../api/whatsapp.js')).default,
  '/api/orbe':     (await import('../api/orbe.js')).default,
  '/api/leads':    (await import('../api/leads.js')).default,
  '/api/sales':    (await import('../api/sales.js')).default,
  '/api/metrics':  (await import('../api/metrics.js')).default,
  '/api/profile':  (await import('../api/profile.js')).default,
  '/api/friends':  (await import('../api/friends.js')).default,
  '/api/sequences':     (await import('../api/sequences.js')).default,
  '/api/notifications': (await import('../api/notifications.js')).default,
  '/api/ranking':       (await import('../api/ranking.js')).default,
  '/api/workshop':      (await import('../api/workshop.js')).default,
  '/api/goals':         (await import('../api/goals.js')).default,
  '/api/reports':       (await import('../api/reports.js')).default,
  '/api/conversations': (await import('../api/conversations.js')).default,
  '/api/scripts':       (await import('../api/scripts.js')).default,
  '/api/clients':       (await import('../api/clients.js')).default,
  '/api/affiliates':    (await import('../api/affiliates.js')).default,
  '/api/offers':        (await import('../api/offers.js')).default,
  '/api/admin':         (await import('../api/admin.js')).default,
}

// Adapta el res de Node http al contrato Express/Vercel que usan los handlers.
function adaptRes(res) {
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (obj) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
    return res
  }
  return res
}

function readBody(req) {
  return new Promise((resolve) => {
    const ct = req.headers['content-type'] || ''
    if (!/json/.test(ct)) return resolve(undefined)
    let raw = ''
    req.on('data', (c) => { raw += c; if (raw.length > 15e6) req.destroy() })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : undefined) } catch { resolve(undefined) } })
    req.on('error', () => resolve(undefined))
  })
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`)
  const handler = ROUTES[u.pathname]
  adaptRes(res)
  // CORS abierto (en local; el frontend va por proxy de vite, mismo origen).
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

  if (!handler) { res.status(404).json({ error: 'not_found', path: u.pathname }); return }

  req.query = Object.fromEntries(u.searchParams)
  req.body = await readBody(req)
  try {
    await handler(req, res)
  } catch (e) {
    console.error('[local-api]', u.pathname, e)
    if (!res.headersSent) res.status(500).json({ error: e.message || 'internal_error' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const has = (k) => process.env[k] && !String(process.env[k]).startsWith('<') ? 'OK' : 'FALTA'
  console.log(`[local-api] escuchando en http://127.0.0.1:${PORT}`)
  console.log(`[local-api] rutas: ${Object.keys(ROUTES).join(', ')}`)
  console.log(`[local-api] credenciales → Google:${has('GOOGLE_CLIENT_ID')}  Supabase:${has('SUPABASE_URL')}  Recall:${has('RECALL_API_KEY')}`)
  startLocalCron()
})

// ── Cron local (lo que en Vercel hace vercel.json) ──────────────────────
// Cada 5 min: programa bots de las calls inminentes + destraba colgadas.
function startLocalCron() {
  const base = `http://127.0.0.1:${PORT}`
  const tick = async () => {
    for (const action of ['schedule-bots']) {
      try {
        const r = await fetch(`${base}/api/calendar?action=${action}`, { method: 'GET' })
        const d = await r.json().catch(() => ({}))
        if (d.scheduled) console.log(`[cron] ${action}: ${d.scheduled} bot(s) programados`)
      } catch (e) { /* sin credenciales aún: silencioso */ }
    }
    try { await fetch(`${base}/api/recall?action=reconcile-stuck`, { method: 'POST' }) } catch { /* idem */ }
    // Ejecuta las tareas de seguimiento vencidas (genera notificaciones).
    try {
      const { processDueFollowUps } = await import('../api/_lib/workflow.js')
      const r = await processDueFollowUps()
      if (r.processed) console.log(`[cron] seguimientos ejecutados: ${r.processed}`)
    } catch { /* sin credenciales aún */ }
  }
  // Pasada inmediata al arrancar: si el server se reinició dentro de la ventana
  // de una call inminente, la programa en segundos (no espera al primer tick de
  // 5 min). Pequeño retardo para asegurar que el server ya escucha.
  setTimeout(tick, 2000)
  setInterval(tick, 5 * 60 * 1000)
  console.log('[local-api] cron local activo (pasada inicial + schedule-bots + reconcile-stuck + seguimientos cada 5 min)')
}
