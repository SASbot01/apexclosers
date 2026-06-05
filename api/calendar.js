// /api/calendar — lee Google Calendar (incluyendo calendarios COMPARTIDOS) y
// crea leads automáticamente desde las llamadas agendadas. Sin conectar funnel.
//
// Acciones (?action=):
//   events?userId=    → próximas llamadas (de todos los calendarios visibles), clasificadas
//   sync?userId=      → crea/actualiza leads desde los eventos de venta (cron o manual)
//
// El usuario conecta su correo principal en el login (scope calendar.readonly);
// Google expone también los calendarios compartidos en calendarList → los leemos.

import { supabase, supabaseReady } from './_lib/supabase.js'
import { classifyCall } from './_lib/callClassifier.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action
  try {
    if (action === 'events') return listEvents(req, res)
    if (action === 'sync') return sync(req, res)
    if (action === 'create') return createEvent(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[calendar]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

// Token de Google del usuario, refrescándolo si caducó.
async function getAccessToken(userId) {
  const { data: row } = await supabase.from('google_tokens').select('*').eq('user_id', userId).maybeSingle()
  if (!row) return null
  if (row.expiry && new Date(row.expiry) > new Date(Date.now() + 60000)) return row.access_token
  if (!row.refresh_token) return row.access_token
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const d = await r.json()
  if (!d.access_token) return row.access_token
  await supabase.from('google_tokens').update({
    access_token: d.access_token,
    expiry: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)
  return d.access_token
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

function shapeEvent({ ev, calendar }, ownerEmail) {
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
    calendar,
    classification: cls,
    meeting_url: conf.url, platform: conf.platform,
    lead_name: lead?.displayName || lead?.email || ev.summary || 'Lead',
    lead_email: lead?.email || null,
  }
}

async function listEvents(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  const token = await getAccessToken(userId)
  if (!token) return res.status(200).json({ events: [], reason: 'google_not_connected' })
  const { data: u } = await supabase.from('users').select('email').eq('id', userId).maybeSingle()
  const events = (await fetchEvents(token)).map(e => shapeEvent(e, u?.email)).sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  return res.status(200).json({ events })
}

// Crea/actualiza leads desde las llamadas de venta agendadas (dedupe por calendar_event_id).
async function sync(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const token = await getAccessToken(userId)
  if (!token) return res.status(200).json({ created: 0, reason: 'google_not_connected' })
  const { data: u } = await supabase.from('users').select('email').eq('id', userId).maybeSingle()

  const shaped = (await fetchEvents(token)).map(e => shapeEvent(e, u?.email))
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

// Crea un evento en el calendario del usuario (bidireccional) con Meet, hora España.
async function createEvent(req, res) {
  const { userId, summary, startISO, endISO, attendeeEmail, description } = req.body || {}
  if (!userId || !startISO) return res.status(400).json({ error: 'userId_and_start_required' })
  const token = await getAccessToken(userId)
  if (!token) return res.status(200).json({ error: 'google_not_connected' })
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
