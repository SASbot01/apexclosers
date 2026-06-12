// /api/host — sistema HOST (enlace de agenda tipo Calendly, nativo de Apex
// Closers). El closer edita su página de reserva (slug, disponibilidad, duración,
// formulario de intake) y comparte el enlace público apex-closers.com/agenda/<slug>.
// Quien entra ve los huecos LIBRES reales (disponibilidad − ocupado en Google) y
// al reservar se crea el evento con Meet en el calendario del host + un lead.
//
// Acciones (?action=):
//   GET  page    ?userId=                       → config para EDITAR (dueño)
//   POST save     Body { userId, page }          → guarda la página (slug único)
//   GET  public  ?slug=                          → config PÚBLICA (sin tokens)
//   GET  slots   ?slug=&date=YYYY-MM-DD&duration=→ huecos libres de ese día
//   POST book    ?slug=  Body { startISO, duration, name, email, phone, answers }

import { supabase, supabaseReady } from './_lib/supabase.js'
import { freshToken } from './calendar.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const action = req.query.action || (req.method === 'POST' ? 'save' : 'page')
  try {
    if (action === 'page')   return getPage(req, res)
    if (action === 'save')   return savePage(req, res)
    if (action === 'public') return publicPage(req, res)
    if (action === 'slots')  return slots(req, res)
    if (action === 'book')   return book(req, res)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[host]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

// ── Zona horaria: convertir hora de pared (en tz) ↔ UTC ─────────────────────
function tzParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const o = {}
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') o[p.type] = p.value
  let h = parseInt(o.hour, 10); if (h === 24) h = 0
  return { y: +o.year, mo: +o.month, d: +o.day, h, mi: +o.minute }
}
function wallToUtc(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const p = tzParts(new Date(guess), tz)
  const back = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi)
  return new Date(guess - (back - guess))
}
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
function weekdayKey(y, mo, d) { return WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()] }

const DEFAULT_AVAIL = { mon: [['09:00', '18:00']], tue: [['09:00', '18:00']], wed: [['09:00', '18:00']], thu: [['09:00', '18:00']], fri: [['09:00', '18:00']], sat: [], sun: [] }
const DEFAULTS = {
  title: 'Reserva una llamada',
  description: 'Elige el hueco que mejor te venga.',
  color: '#7c5cff',
  timezone: 'Europe/Madrid',
  durations: [30],
  buffer_min: 0,
  availability: DEFAULT_AVAIL,
  min_notice_hours: 4,
  max_days_ahead: 30,
  intake_fields: [
    { key: 'name', label: 'Nombre', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'phone', label: 'Teléfono', type: 'tel', required: false },
    { key: 'notes', label: '¿De qué quieres hablar?', type: 'textarea', required: false },
  ],
  location_type: 'google_meet',
  active: true,
}

const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)

async function profileCard(userId) {
  const [{ data: u }, { data: p }] = await Promise.all([
    supabase.from('users').select('name, email, picture').eq('id', userId).maybeSingle(),
    supabase.from('profiles').select('display_name, nickname, headline, photo_url').eq('user_id', userId).maybeSingle(),
  ])
  return {
    name: p?.display_name || u?.name || u?.email?.split('@')[0] || 'Closer',
    nickname: p?.nickname || null,
    headline: p?.headline || null,
    photo_url: p?.photo_url || u?.picture || null,
    email: u?.email || null,
  }
}

// Config existente o defaults (con slug sugerido a partir del nick/nombre).
async function getPage(req, res) {
  const userId = req.query.userId
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const { data } = await supabase.from('host_pages').select('*').eq('user_id', userId).maybeSingle()
  const card = await profileCard(userId)
  const { data: accounts } = await supabase.from('google_accounts').select('id, email, label, is_primary').eq('user_id', userId)
  if (data) return res.status(200).json({ page: data, exists: true, accounts: accounts || [], host: card })
  const slug = slugify(card.nickname || card.name || userId.slice(0, 8))
  return res.status(200).json({ page: { ...DEFAULTS, slug, title: `Reserva con ${card.name}` }, exists: false, accounts: accounts || [], host: card })
}

async function savePage(req, res) {
  const { userId, page } = req.body || {}
  if (!userId || !page) return res.status(400).json({ error: 'userId_and_page_required' })
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  let slug = slugify(page.slug)
  if (!slug) { const card = await profileCard(userId); slug = slugify(card.nickname || card.name || userId.slice(0, 8)) }
  // Slug único: si lo tiene OTRO usuario, error.
  const { data: clash } = await supabase.from('host_pages').select('user_id').eq('slug', slug).maybeSingle()
  if (clash && clash.user_id !== userId) return res.status(409).json({ error: 'slug_taken' })

  const row = {
    user_id: userId,
    slug,
    title: String(page.title || DEFAULTS.title).slice(0, 120),
    description: String(page.description || '').slice(0, 2000),
    color: page.color || DEFAULTS.color,
    timezone: page.timezone || DEFAULTS.timezone,
    durations: Array.isArray(page.durations) && page.durations.length ? page.durations.map(n => Math.max(5, Math.min(240, Number(n) || 30))) : DEFAULTS.durations,
    buffer_min: Math.max(0, Math.min(120, Number(page.buffer_min) || 0)),
    availability: page.availability && typeof page.availability === 'object' ? page.availability : DEFAULT_AVAIL,
    min_notice_hours: Math.max(0, Math.min(168, Number(page.min_notice_hours) ?? 4)),
    max_days_ahead: Math.max(1, Math.min(120, Number(page.max_days_ahead) || 30)),
    intake_fields: Array.isArray(page.intake_fields) ? page.intake_fields.slice(0, 12) : DEFAULTS.intake_fields,
    location_type: ['google_meet', 'phone', 'custom'].includes(page.location_type) ? page.location_type : 'google_meet',
    location_value: page.location_value ? String(page.location_value).slice(0, 200) : null,
    calendar_account_id: page.calendar_account_id || null,
    project: page.project ? String(page.project).slice(0, 80) : null,
    active: page.active !== false,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase.from('host_pages').upsert(row, { onConflict: 'user_id' }).select('*').single()
  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ ok: true, page: data })
}

async function loadBySlug(slug) {
  if (!slug) return null
  const { data } = await supabase.from('host_pages').select('*').eq('slug', slug).maybeSingle()
  return data || null
}

async function publicPage(req, res) {
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const page = await loadBySlug(req.query.slug)
  if (!page || !page.active) return res.status(404).json({ error: 'not_found' })
  const host = await profileCard(page.user_id)
  return res.status(200).json({
    page: {
      slug: page.slug, title: page.title, description: page.description, color: page.color,
      timezone: page.timezone, durations: page.durations, intake_fields: page.intake_fields,
      min_notice_hours: page.min_notice_hours, max_days_ahead: page.max_days_ahead,
      location_type: page.location_type,
    },
    host: { name: host.name, headline: host.headline, photo_url: host.photo_url },
  })
}

// Cuenta Google que hospeda la agenda (la elegida o la primaria).
async function hostAccount(page) {
  if (page.calendar_account_id) {
    const { data } = await supabase.from('google_accounts').select('*').eq('id', page.calendar_account_id).eq('user_id', page.user_id).maybeSingle()
    if (data) return data
  }
  const { data } = await supabase.from('google_accounts').select('*').eq('user_id', page.user_id).order('is_primary', { ascending: false }).order('created_at').limit(1).maybeSingle()
  return data || null
}

// Intervalos ocupados (Google free/busy) de TODOS los calendarios visibles de la
// cuenta host, en [from,to].
async function busyIntervals(account, fromUtc, toUtc) {
  if (!account) return []
  const token = await freshToken(account)
  const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?fields=items(id)', { headers: { Authorization: `Bearer ${token}` } })
  const cals = (await calRes.json().catch(() => ({}))).items || [{ id: 'primary' }]
  const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: fromUtc.toISOString(), timeMax: toUtc.toISOString(), items: cals.map(c => ({ id: c.id })) }),
  })
  const d = await r.json().catch(() => ({}))
  const out = []
  for (const cal of Object.values(d.calendars || {})) for (const b of (cal.busy || [])) out.push([new Date(b.start).getTime(), new Date(b.end).getTime()])
  return out
}

// Genera los huecos de un día respetando disponibilidad, antelación, ventana,
// duración, buffer y lo ocupado en Google.
async function slots(req, res) {
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const page = await loadBySlug(req.query.slug)
  if (!page || !page.active) return res.status(404).json({ error: 'not_found' })
  const date = String(req.query.date || '')
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return res.status(400).json({ error: 'date_required_YYYY-MM-DD' })
  const y = +m[1], mo = +m[2], d = +m[3]
  const tz = page.timezone || 'Europe/Madrid'
  const duration = Math.max(5, Number(req.query.duration) || (page.durations?.[0] || 30))
  const buffer = page.buffer_min || 0

  const windows = (page.availability || {})[weekdayKey(y, mo, d)] || []
  const now = Date.now()
  const notBefore = now + (page.min_notice_hours || 0) * 3600 * 1000
  const horizon = now + (page.max_days_ahead || 30) * 86400 * 1000

  // Candidatos en hora de pared (tz) → instante UTC.
  const candidates = []
  for (const [from, to] of windows) {
    const [fh, fm] = String(from).split(':').map(Number)
    const [th, tm] = String(to).split(':').map(Number)
    const startMin = fh * 60 + fm, endMin = th * 60 + tm
    for (let t = startMin; t + duration <= endMin; t += duration) {
      const start = wallToUtc(y, mo, d, Math.floor(t / 60), t % 60, tz)
      const ms = start.getTime()
      if (ms < notBefore || ms > horizon) continue
      candidates.push(ms)
    }
  }
  if (!candidates.length) return res.status(200).json({ slots: [], timezone: tz })

  // Ocupado en Google ese día.
  const dayFrom = new Date(Math.min(...candidates))
  const dayTo = new Date(Math.max(...candidates) + duration * 60000)
  let busy = []
  const account = await hostAccount(page)
  try { busy = await busyIntervals(account, dayFrom, dayTo) } catch (e) { console.error('[host] freebusy', e.message) }

  const free = candidates.filter(ms => {
    const s = ms - buffer * 60000, e = ms + (duration + buffer) * 60000
    return !busy.some(([bs, be]) => s < be && e > bs)
  })
  return res.status(200).json({ slots: free.map(ms => new Date(ms).toISOString()), timezone: tz, duration })
}

const newToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

async function book(req, res) {
  if (!supabaseReady()) return res.status(500).json({ error: 'supabase_not_configured' })
  const page = await loadBySlug(req.query.slug)
  if (!page || !page.active) return res.status(404).json({ error: 'not_found' })
  const { startISO, duration: durIn, name, email, phone, answers } = req.body || {}
  if (!startISO || !name || !email) return res.status(400).json({ error: 'start_name_email_required' })
  const start = new Date(startISO)
  if (isNaN(start)) return res.status(400).json({ error: 'bad_start' })
  const duration = Math.max(5, Number(durIn) || (page.durations?.[0] || 30))
  const end = new Date(start.getTime() + duration * 60000)

  // Revalida que el hueco siga libre (carrera entre dos reservas).
  const account = await hostAccount(page)
  if (!account) return res.status(409).json({ error: 'host_calendar_unavailable' })
  const busy = await busyIntervals(account, new Date(start.getTime() - 1), new Date(end.getTime() + 1)).catch(() => [])
  if (busy.some(([bs, be]) => start.getTime() < be && end.getTime() > bs)) return res.status(409).json({ error: 'slot_taken' })

  // Crea el evento en el calendario del host (con Meet si aplica).
  const token = await freshToken(account)
  const summary = `${page.title || 'Llamada'} · ${name}`
  const descLines = [
    answers && answers.notes ? `Notas: ${answers.notes}` : null,
    phone ? `Teléfono: ${phone}` : null,
    `Reservado desde Apex Closers (agenda/${page.slug}).`,
  ].filter(Boolean)
  const body = {
    summary,
    description: descLines.join('\n'),
    start: { dateTime: start.toISOString(), timeZone: page.timezone || 'Europe/Madrid' },
    end: { dateTime: end.toISOString(), timeZone: page.timezone || 'Europe/Madrid' },
    attendees: [{ email }],
    ...(page.location_type === 'google_meet' ? { conferenceData: { createRequest: { requestId: 'apexhost-' + newToken(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
  }
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const ev = await r.json()
  if (!r.ok) return res.status(502).json({ error: 'google_create_failed', detail: ev })
  const meetUrl = ev.hangoutLink || ev.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || (page.location_type === 'phone' ? `tel:${page.location_value || ''}` : null)

  // Guarda la reserva.
  const { data: booking } = await supabase.from('host_bookings').insert({
    host_user_id: page.user_id, name, email, phone: phone || null,
    answers: answers || {}, start_at: start.toISOString(), end_at: end.toISOString(),
    duration_min: duration, event_id: ev.id, meet_url: meetUrl, status: 'confirmed',
  }).select('id').single()

  // Crea/actualiza un lead para el host (dedupe por evento), atribuido al proyecto.
  await supabase.from('leads').upsert({
    owner_id: page.user_id, calendar_event_id: ev.id,
    name, email, phone: phone || null,
    stage: 'agendada', source: 'Agenda Host', project: page.project || null,
    meeting_url: meetUrl, platform: page.location_type === 'google_meet' ? 'google_meet' : null,
    next_step: 'Llamada agendada', next_at: start.toISOString(), last_at: start.toISOString(),
  }, { onConflict: 'owner_id,calendar_event_id' }).then(() => {}, () => {})

  // Notifica al host.
  await supabase.from('notifications').insert({
    user_id: page.user_id, kind: 'system', title: 'Nueva reserva en tu agenda',
    body: `${name} reservó una llamada para el ${new Intl.DateTimeFormat('es-ES', { timeZone: page.timezone || 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' }).format(start)}.`,
    link: '/calendario',
  }).then(() => {}, () => {})

  return res.status(200).json({ ok: true, bookingId: booking?.id || null, meet_url: meetUrl, start: start.toISOString(), end: end.toISOString() })
}
