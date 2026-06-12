// /api/calendar — lee Google Calendar (incluyendo calendarios COMPARTIDOS) y
// crea leads automáticamente desde las llamadas agendadas. Sin conectar funnel.
//
// Acciones (?action=):
//   events?userId=    → próximas llamadas (de todos los calendarios visibles), clasificadas
//   sync?userId=      → crea/actualiza leads desde los eventos de venta (cron o manual)
//
// El usuario conecta su correo principal en el login (scope calendar.readonly);
// Google expone también los calendarios compartidos en calendarList → los leemos.

import crypto from 'crypto'
import { supabase, supabaseReady } from './_lib/supabase.js'
import { classifyCall } from './_lib/callClassifier.js'
import { createBot, recallReady } from './_lib/recall.js'
import { dueForScheduling, computeJoinAt } from './_lib/schedule.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action
  try {
    if (action === 'events') return listEvents(req, res)
    if (action === 'sync') return sync(req, res)
    if (action === 'create') return createEvent(req, res)
    if (action === 'schedule-bots') return scheduleBots(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[calendar]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

// Cuentas de Google ACTIVAS del usuario (varias: la del login + las de sus
// clientes). El calendario unificado junta los eventos de todas.
async function getActiveAccounts(userId) {
  const { data } = await supabase.from('google_accounts').select('*').eq('user_id', userId).eq('active', true)
  return data || []
}

// Token fresco de UNA cuenta, refrescándolo si caducó (y persistiéndolo).
export async function freshToken(acc) {
  if (acc.expiry && new Date(acc.expiry) > new Date(Date.now() + 60000)) return acc.access_token
  if (!acc.refresh_token) return acc.access_token
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: acc.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const d = await r.json()
  if (!d.access_token) return acc.access_token
  await supabase.from('google_accounts').update({
    access_token: d.access_token,
    expiry: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', acc.id)
  return d.access_token
}

// La cuenta primaria (la del login). Sirve de fallback para crear eventos.
async function getPrimaryAccount(userId) {
  const { data } = await supabase.from('google_accounts').select('*').eq('user_id', userId)
    .order('is_primary', { ascending: false }).order('created_at').limit(1).maybeSingle()
  return data || null
}

// Junta los eventos (ya con forma) de TODAS las cuentas activas del usuario.
async function fetchEventsAllAccounts(userId) {
  const accounts = await getActiveAccounts(userId)
  const out = []
  for (const acc of accounts) {
    const token = await freshToken(acc)
    try {
      const evs = await fetchEvents(token)
      for (const e of evs) out.push(shapeEvent(e, acc.email, acc))
    } catch (err) { console.error('[calendar] account fetch failed', acc.email, err.message) }
  }
  return { accounts, events: out }
}

function meetingUrlFor(ev) {
  const entry = ev.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri
  if (entry) return { url: entry, platform: entry.includes('meet.google.com') ? 'google_meet' : 'unknown' }
  const desc = ev.description || ''
  const zoom = desc.match(/https?:\/\/[^\s]*zoom\.us\/j\/[^\s"']+/)
  if (zoom) return { url: zoom[0], platform: 'zoom' }
  return { url: '', platform: null }
}

// Lee TODOS los calendarios visibles del usuario (propio + compartidos) y junta los eventos.
async function fetchEvents(token) {
  const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers: { Authorization: `Bearer ${token}` } })
  const cals = (await calRes.json()).items || []
  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + 14 * 86400 * 1000).toISOString()
  const out = []
  for (const cal of cals) {
    const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '50' })
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) continue
    const items = (await r.json()).items || []
    for (const ev of items) out.push({ ev, calendar: cal.summary, calendarOwner: cal.id })
  }
  return out
}

function shapeEvent({ ev, calendar }, ownerEmail, account = null) {
  const conf = meetingUrlFor(ev)
  const cls = classifyCall({
    title: ev.summary, description: ev.description,
    attendees: (ev.attendees || []).map(a => ({ email: a.email, name: a.displayName })),
    recurringEventId: ev.recurringEventId, closerEmail: ownerEmail,
  })
  const lead = (ev.attendees || []).find(a => a.email && a.email !== ownerEmail) // el externo = el lead
  return {
    calendar_event_id: ev.id,
    title: ev.summary || 'Llamada',
    start: ev.start?.dateTime || ev.start?.date,
    end: ev.end?.dateTime || ev.end?.date || null,
    all_day: !ev.start?.dateTime,
    calendar,
    // de qué cuenta Google viene (para distinguir clientes en el calendario unificado)
    account_id: account?.id || null,
    account_email: account?.email || ownerEmail || null,
    account_label: account?.label || account?.email || null,
    classification: cls,
    meeting_url: conf.url, platform: conf.platform,
    lead_name: lead?.displayName || lead?.email || ev.summary || 'Lead',
    lead_email: lead?.email || null,
  }
}

async function listEvents(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  const { accounts, events } = await fetchEventsAllAccounts(userId)
  if (!accounts.length) return res.status(200).json({ events: [], reason: 'google_not_connected' })
  events.sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  return res.status(200).json({
    events,
    accounts: accounts.map(a => ({ id: a.id, email: a.email, label: a.label || a.email, is_primary: a.is_primary })),
  })
}

// Crea/actualiza leads desde las llamadas de venta agendadas (dedupe por calendar_event_id).
async function sync(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { accounts, events: shaped } = await fetchEventsAllAccounts(userId)
  if (!accounts.length) return res.status(200).json({ created: 0, reason: 'google_not_connected' })

  const sales = shaped.filter(e => e.classification?.shouldAttachBot) // solo llamadas de venta
  let created = 0
  for (const e of sales) {
    const { error } = await supabase.from('leads').upsert({
      owner_id: userId,
      calendar_event_id: e.calendar_event_id,
      name: e.lead_name, email: e.lead_email,
      stage: 'agendada', source: 'Google Calendar',
      meeting_url: e.meeting_url, platform: e.platform,
      next_step: 'Llamada agendada', next_at: e.start, last_at: e.start,
    }, { onConflict: 'owner_id,calendar_event_id' })
    if (!error) created++
  }
  return res.status(200).json({ ok: true, scanned: shaped.length, salesEvents: sales.length, upserted: created })
}

// ── schedule-bots (invitación automática) ───────────────────────────────
// Programa el Notetaker de Recall para las llamadas de VENTA inminentes de
// cada closer que conectó su Google. Esto es lo que convierte la conexión de
// Google en "el bot entra solo": un cron lo llama cada pocos minutos.
//
//   ?userId=    → solo ese closer (manual/test)
//   (sin userId) → TODOS los closers con Google conectado (modo cron)
//
// Ventana rodante: solo programa calls que empiezan en los próximos
// LOOKAHEAD_MS. Con join_at, el bot se reserva y entra ~1 min antes. El cron
// repite cada 5 min, pero el dedupe por calendar_event_id evita bots dobles,
// y al comprometernos cerca de la hora toleramos reprogramaciones/cancelaciones.
const newShareToken = () => crypto.randomBytes(16).toString('hex')

async function scheduleBotsForUser(userId) {
  const { accounts, events: shaped } = await fetchEventsAllAccounts(userId)
  if (!accounts.length) return { userId, scheduled: 0, reason: 'google_not_connected' }

  const now = Date.now()
  const due = shaped.filter(e => dueForScheduling(e, now))

  let scheduled = 0
  const detail = []
  for (const e of due) {
    // Dedupe: ¿ya hay un bot para este evento de este closer?
    const { data: existing } = await supabase
      .from('calls')
      .select('id, status')
      .eq('user_id', userId)
      .eq('calendar_event_id', e.calendar_event_id)
      .not('status', 'in', '("cancelled","fatal")')
      .maybeSingle()
    if (existing) { detail.push({ event: e.calendar_event_id, skipped: 'already_scheduled' }); continue }

    const joinAt = computeJoinAt(new Date(e.start).getTime(), now)

    try {
      const bot = await createBot({
        meetingUrl: e.meeting_url,
        joinAt,
        metadata: { user_id: userId, source: 'auto_calendar', calendar_event_id: e.calendar_event_id },
      })
      await supabase.from('calls').upsert({
        user_id:           userId,
        bot_id:            bot.id,
        meeting_url:       e.meeting_url,
        platform:          bot.meeting_url?.platform || e.platform || null,
        meeting_id:        bot.meeting_url?.meeting_id || null,
        calendar_event_id: e.calendar_event_id,
        title:             e.title,
        classification:    e.classification,
        status:            joinAt ? 'scheduled' : 'joining',
        scheduled_at:      e.start,
        share_token:       newShareToken(),
      }, { onConflict: 'bot_id' })
      scheduled++
      detail.push({ event: e.calendar_event_id, botId: bot.id, joinAt: joinAt || 'now' })
    } catch (err) {
      detail.push({ event: e.calendar_event_id, error: err.message })
    }
  }
  return { userId, scanned: shaped.length, due: due.length, scheduled, detail }
}

async function scheduleBots(req, res) {
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  if (!recallReady())   return res.status(500).json({ error: 'recall_not_configured' })

  const userId = req.query.userId
  if (userId) {
    return res.status(200).json({ ok: true, ...(await scheduleBotsForUser(userId)) })
  }

  // Modo cron: todos los closers con alguna cuenta de Google conectada.
  const { data: accs } = await supabase.from('google_accounts').select('user_id')
  const userIds = [...new Set((accs || []).map(a => a.user_id))]
  const results = []
  for (const uid of userIds) {
    try { results.push(await scheduleBotsForUser(uid)) }
    catch (e) { results.push({ userId: uid, error: e.message }) }
  }
  const scheduled = results.reduce((n, r) => n + (r.scheduled || 0), 0)
  return res.status(200).json({ ok: true, closers: results.length, scheduled, results })
}

// Crea un evento en el calendario del usuario (bidireccional) con Meet, hora España.
// accountId opcional: en qué cuenta Google crearlo (default = la primaria).
async function createEvent(req, res) {
  const { userId, summary, startISO, endISO, attendeeEmail, description, accountId } = req.body || {}
  if (!userId || !startISO) return res.status(400).json({ error: 'userId_and_start_required' })
  let acc = null
  if (accountId) { const { data } = await supabase.from('google_accounts').select('*').eq('id', accountId).eq('user_id', userId).maybeSingle(); acc = data }
  if (!acc) acc = await getPrimaryAccount(userId)
  if (!acc) return res.status(200).json({ error: 'google_not_connected' })
  const token = await freshToken(acc)
  const body = {
    summary: summary || 'Llamada',
    description: description || '',
    start: { dateTime: startISO, timeZone: 'Europe/Madrid' },
    end: { dateTime: endISO || new Date(new Date(startISO).getTime() + 30 * 60000).toISOString(), timeZone: 'Europe/Madrid' },
    ...(attendeeEmail ? { attendees: [{ email: attendeeEmail }] } : {}),
    conferenceData: { createRequest: { requestId: 'apex-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
  }
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const d = await r.json()
  if (!r.ok) return res.status(502).json({ error: 'google_create_failed', detail: d })
  return res.status(200).json({ ok: true, event: { id: d.id, htmlLink: d.htmlLink, meet: d.hangoutLink || null } })
}
