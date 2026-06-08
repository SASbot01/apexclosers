// Datos de DEMO para ver la app "llena" sin backend (perfil, métricas, ranking,
// amigos/grupos, ventas verificadas, secuencias, tareas y notificaciones).
//
// Se usan SOLO cuando el backend no está disponible (vite dev sin server/local-api):
// las libs de API (profileApi, salesApi, workflowApi) llaman a `mockResponse()`
// como fallback únicamente si la red falla o el proxy responde algo que NO es
// JSON (backend caído). Con un backend real, las respuestas son JSON y estos
// datos no se usan nunca.
import { MOCK_SALES } from './sales'
import { MOCK_LEADS } from './leads'
import { CLIENTS } from './clients'
import { MOCK_CALLS, mockListShape } from './calls'

export const MY_ID = '00000000-0000-0000-0000-000000000001'

// ── Justificante de venta (imagen inline, sin depender de la red) ────────────
const PROOF_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="560" viewBox="0 0 420 560">
      <rect width="420" height="560" fill="#0d0f15"/>
      <rect x="40" y="40" width="340" height="480" rx="8" fill="#fff"/>
      <text x="64" y="92" font-family="Arial" font-size="20" font-weight="700" fill="#111">Comprobante de pago</text>
      <line x1="64" y1="112" x2="356" y2="112" stroke="#ddd"/>
      <text x="64" y="156" font-family="Arial" font-size="14" fill="#444">Concepto: Programa High Ticket</text>
      <text x="64" y="186" font-family="Arial" font-size="14" fill="#444">Método: Stripe</text>
      <text x="64" y="216" font-family="Arial" font-size="14" fill="#444">Estado: Completado</text>
      <text x="64" y="300" font-family="Arial" font-size="40" font-weight="700" fill="#16a34a">1.800,00 €</text>
      <text x="64" y="492" font-family="Arial" font-size="12" fill="#999">Ref. TXN-9F3A21 · Apex Closers</text>
    </svg>`,
  )

// ── Ventas con estado de verificación (para la tabla "Ventas" y las métricas) ─
export const MOCK_SALES_FULL = MOCK_SALES.map((s, i) => {
  const status = i % 6 === 5 ? 'pending' : i % 17 === 16 ? 'rejected' : 'verified'
  const verified = status === 'verified'
  return {
    ...s,
    owner_id: MY_ID,
    status,
    source: i % 5 === 0 ? 'transcription' : 'manual',
    proof_url: verified ? PROOF_IMG : null,
    proof_name: verified ? 'comprobante.svg' : null,
  }
})

const VERIFIED = MOCK_SALES_FULL.filter((s) => s.status === 'verified')
const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0)

// ── Catálogo canónico de métricas (espejo de api/metrics.js METRIC_DEFS) ─────
export const METRIC_DEFS = [
  { key: 'revenue',        label: 'Revenue',          fmt: 'money' },
  { key: 'cash_collected', label: 'Cash collected',   fmt: 'money' },
  { key: 'recollected',    label: '% Recollected',    fmt: 'pct' },
  { key: 'deals',          label: 'Cierres',          fmt: 'int' },
  { key: 'avg_ticket',     label: 'Ticket medio',     fmt: 'money' },
  { key: 'calls',          label: 'Llamadas',         fmt: 'int' },
  { key: 'held',           label: 'Realizadas',       fmt: 'int' },
  { key: 'show_rate',      label: 'Show rate',        fmt: 'pct' },
  { key: 'offers',         label: 'Ofertas',          fmt: 'int' },
  { key: 'deposits',       label: 'Depósitos',        fmt: 'int' },
  { key: 'close_rate',     label: 'Close rate',       fmt: 'pct' },
  { key: 'pipeline_value', label: 'Pipeline abierto', fmt: 'money' },
]

// Embudo coherente con los estándares (show ~80%, close ~28%).
const REVENUE = sum(VERIFIED, (s) => s.revenue)
const CASH = sum(VERIFIED, (s) => s.cash_collected)
const DEALS = VERIFIED.length
const OFFERS = Math.round(DEALS / 0.28)            // close_rate ≈ 28%
const HELD = Math.round(OFFERS / 0.62)             // ofertas sobre realizadas
const NO_SHOW = Math.round(HELD * 0.22)            // show_rate ≈ 82%
const CALLS = HELD + NO_SHOW
const PIPELINE = sum(MOCK_LEADS.filter((l) => l.stage !== 'cerrado'), (l) => l.value)

export const DEMO_METRIC_VALUES = {
  revenue: REVENUE,
  cash_collected: CASH,
  recollected: REVENUE ? CASH / REVENUE : null,
  deals: DEALS,
  avg_ticket: DEALS ? REVENUE / DEALS : 0,
  calls: CALLS,
  held: HELD,
  show_rate: HELD + NO_SHOW ? HELD / (HELD + NO_SHOW) : null,
  offers: OFFERS,
  deposits: Math.round(DEALS * 0.65),
  close_rate: OFFERS ? DEALS / OFFERS : null,
  pipeline_value: PIPELINE,
}

// Qué métricas son públicas en el perfil (las demás se ven solo el dueño).
export const DEMO_VISIBILITY = {
  revenue: true,
  deals: true,
  close_rate: true,
  avg_ticket: true,
  show_rate: true,
  recollected: true,
  cash_collected: false,
  calls: false,
  held: false,
  offers: false,
  pipeline_value: false,
}

export function metricsList(values, { isOwner = true, visibility = DEMO_VISIBILITY } = {}) {
  return METRIC_DEFS
    .filter((d) => isOwner || visibility[d.key] === true)
    .map((d) => ({ ...d, value: values[d.key] ?? null, public: visibility[d.key] === true }))
}

// ── Perfil propio ────────────────────────────────────────────────────────────
export const MY_PROFILE = {
  user_id: MY_ID,
  nickname: 'alex_closer',
  display_name: 'Alex Moreno',
  headline: 'Closer high-ticket · 7 años cerrando',
  bio: 'Especialista en ventas high-ticket para infoproductos y agencias. +1,2M€ cerrados en los últimos 3 años. Sistema propio de seguimiento y cierre por teléfono. Formo a closers que quieren vivir de cerrar.',
  photo_url: 'https://i.pravatar.cc/300?img=12',
  location: 'Madrid, España',
  email: 'alex@apexclosers.com',
  links: [
    { label: 'Instagram', url: 'https://instagram.com/alex_closer' },
    { label: 'LinkedIn', url: 'https://linkedin.com/in/alexmoreno' },
    { label: 'Agenda', url: 'https://calendly.com/alex-closer' },
  ],
}

// ── Otros closers (ranking · ver perfil · buscar) ────────────────────────────
const OTHERS_RAW = [
  { id: 'u-laura',  nick: 'laura_sales',   name: 'Laura Giménez',   head: 'Closer & sales coach · fitness',     loc: 'Barcelona',          img: 5,  revenue: 92400, deals: 47, close: 0.31, show: 0.85, friend: true,  group: true },
  { id: 'u-diego',  nick: 'diego_high',    name: 'Diego Navarro',   head: 'High-ticket closer · agencias',      loc: 'Valencia',           img: 13, revenue: 71800, deals: 38, close: 0.27, show: 0.80, friend: true,  group: true },
  { id: 'u-marta',  nick: 'marta.cierra',  name: 'Marta Ibáñez',    head: 'Closer SaaS B2B',                    loc: 'Madrid',             img: 25, revenue: 64200, deals: 33, close: 0.29, show: 0.83, friend: true,  group: false },
  { id: 'u-carlos', nick: 'carlos_setter', name: 'Carlos Ruano',    head: 'Setter → closer · infoproductos',    loc: 'Sevilla',            img: 33, revenue: 51500, deals: 41, close: 0.24, show: 0.78, friend: true,  group: false },
  { id: 'u-nuria',  nick: 'nuria_closes',  name: 'Nuria Pol',       head: 'Closer · coaching y mentorías',      loc: 'Bilbao',             img: 47, revenue: 38900, deals: 26, close: 0.26, show: 0.81, friend: false, group: false },
  { id: 'u-pablo',  nick: 'pablo_ht',      name: 'Pablo Serra',     head: 'Closer high-ticket · e-commerce',    loc: 'Ciudad de México',   img: 51, revenue: 33400, deals: 22, close: 0.25, show: 0.79, friend: false, group: false },
  { id: 'u-elena',  nick: 'elena_remote',  name: 'Elena Vázquez',   head: 'Remote closer · real estate',        loc: 'Buenos Aires',       img: 9,  revenue: 27600, deals: 19, close: 0.23, show: 0.77, friend: false, group: false },
]

function otherValues(o) {
  const cash = Math.round(o.revenue * 0.9)
  const offers = Math.round(o.deals / o.close)
  const held = Math.round(offers / 0.6)
  return {
    revenue: o.revenue,
    cash_collected: cash,
    recollected: 0.9,
    deals: o.deals,
    avg_ticket: o.deals ? Math.round(o.revenue / o.deals) : 0,
    calls: Math.round(held / o.show),
    held,
    show_rate: o.show,
    offers,
    close_rate: o.close,
    pipeline_value: 12000 + o.deals * 700,
  }
}

const OTHERS = OTHERS_RAW.map((o) => ({
  raw: o,
  profile: {
    user_id: o.id,
    nickname: o.nick,
    display_name: o.name,
    headline: o.head,
    bio: `${o.head}. Cerrando alto valor con foco en seguimiento y prueba social. Resultados verificados en el ranking de Apex.`,
    photo_url: `https://i.pravatar.cc/300?img=${o.img}`,
    location: o.loc,
    email: `${o.nick.replace(/[^a-z0-9]/gi, '')}@apexclosers.com`,
    links: [{ label: 'Instagram', url: `https://instagram.com/${o.nick}` }],
  },
  values: otherValues(o),
  // Para un tercero, todas las que devuelve el perfil ya son públicas.
  visibility: METRIC_DEFS.reduce((m, d) => ((m[d.key] = ['revenue', 'deals', 'close_rate', 'avg_ticket', 'show_rate', 'recollected'].includes(d.key)), m), {}),
}))

const findOther = (id) => OTHERS.find((o) => o.profile.user_id === id)
const card = (p) => ({ user_id: p.user_id, nickname: p.nickname, display_name: p.display_name, headline: p.headline, photo_url: p.photo_url })

// ── Amigos / solicitudes / grupos ────────────────────────────────────────────
const FRIENDS = OTHERS.filter((o) => o.raw.friend).map((o, i) => ({ ...card(o.profile), friendshipId: `fr-${i}` }))
const INCOMING = [
  { ...card(findOther('u-nuria').profile), requestId: 'rq-in-1' },
  { ...card(findOther('u-pablo').profile), requestId: 'rq-in-2' },
]
const OUTGOING = [{ ...card(findOther('u-elena').profile), requestId: 'rq-out-1' }]

const GROUPS = [
  {
    id: 'g-elite',
    name: 'Closers Élite',
    emoji: '🐺',
    members: OTHERS.filter((o) => o.raw.group).map((o) => card(o.profile)),
  },
  {
    id: 'g-mexico',
    name: 'Squad LATAM',
    emoji: '🌎',
    members: [card(findOther('u-pablo').profile)],
  },
]

// ── Equipos de cliente ────────────────────────────────────────────────────────
// Un equipo agrupa a closers que trabajan UNA misma cuenta de cliente; todos sus
// datos quedan FILTRADOS a ese cliente. Persisten en localStorage para que crear
// equipos / añadir miembros sobreviva al recargar (demo sin backend).
const clamp01 = (v) => Math.max(0, Math.min(1, v))
function hashStr01(str) {
  let h = 2166136261
  for (let i = 0; i < (str || '').length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 100000) / 100000
}
// Valores de métricas de un closer FILTRADOS a UN cliente (deterministas, sin
// random). Devuelve el mismo shape que `values` → sirve para `metricsList` y para
// el marcador del equipo, así el perfil filtrado y el marcador SIEMPRE coinciden.
export function clientScopedValues(memberId, clientId) {
  const o = findOther(memberId)
  const base = o ? o.values : DEMO_METRIC_VALUES
  const f = 0.16 + hashStr01(memberId + '|' + clientId) * 0.34   // cuota que aporta a este cliente
  const deals = Math.max(1, Math.round((base.deals || DEALS) * f))
  const revenue = Math.round((base.revenue || REVENUE) * f)
  const cash = Math.round((base.cash_collected || base.revenue * 0.9 || CASH) * f)
  const close_rate = clamp01((base.close_rate || 0.26) + (hashStr01(memberId + clientId + 'cr') - 0.5) * 0.08)
  const offers = Math.max(deals, Math.round(deals / Math.max(0.12, close_rate)))
  const show = clamp01((base.show_rate || 0.8) + (hashStr01(memberId + clientId + 'sh') - 0.5) * 0.06)
  const held = Math.max(offers, Math.round(offers / 0.6))
  const calls = Math.max(held, Math.round(held / Math.max(0.5, show)))
  return {
    revenue,
    cash_collected: cash,
    recollected: revenue ? cash / revenue : null,
    deals,
    avg_ticket: deals ? Math.round(revenue / deals) : 0,
    calls,
    held,
    show_rate: show,
    offers,
    deposits: Math.round(deals * 0.65),
    close_rate,
    pipeline_value: 4000 + deals * 600,
  }
}
// Resumen para el marcador del equipo (subset de los valores por-cliente).
function memberClientStats(memberId, clientId) {
  const v = clientScopedValues(memberId, clientId)
  return { revenue: v.revenue, cash: v.cash_collected, deals: v.deals, calls: v.calls, close_rate: v.close_rate, avg_ticket: v.avg_ticket }
}
// Actividad de un closer FILTRADA a un cliente: sus llamadas (clicables → detalle)
// y sus ventas verificadas en esa cuenta. Datos demo (reusa MOCK_CALLS/ventas del
// cliente; rotación determinista por miembro para que cada uno muestre su set).
export function clientScopedActivity(memberId, clientId, memberName) {
  const allCalls = MOCK_CALLS.filter((c) => c.client_id === clientId)
  const off = allCalls.length ? Math.floor(hashStr01(memberId + clientId) * allCalls.length) : 0
  const calls = allCalls
    .map((_, i) => allCalls[(i + off) % allCalls.length])
    .filter((c, i, arr) => arr.indexOf(c) === i)   // sin duplicados
    .slice(0, 5)
    .map(mockListShape)
  const sales = MOCK_SALES_FULL
    .filter((s) => s.client_id === clientId && s.status === 'verified')
    .slice(0, 5)
    .map((s) => ({ id: s.id, date: s.date, product: s.product, revenue: s.revenue, cash_collected: s.cash_collected, payment_method: s.payment_method, payment_type: s.payment_type, closer: memberName || s.closer }))
  return { calls, sales }
}
// Enriquece un equipo con miembros (stats por-cliente) + agregado del equipo.
function buildTeam(t) {
  const members = (t.member_ids || []).map((id) => {
    const o = findOther(id)
    const base = o ? card(o.profile) : { user_id: id, display_name: 'Closer', nickname: null, photo_url: null }
    return { ...base, stats: memberClientStats(id, t.client_id) }
  })
  const totals = members.reduce((a, m) => ({
    revenue: a.revenue + m.stats.revenue,
    cash: a.cash + m.stats.cash,
    deals: a.deals + m.stats.deals,
    calls: a.calls + m.stats.calls,
  }), { revenue: 0, cash: 0, deals: 0, calls: 0 })
  totals.close_rate = members.length ? members.reduce((a, m) => a + m.stats.close_rate, 0) / members.length : 0
  totals.avg_ticket = totals.deals ? Math.round(totals.revenue / totals.deals) : 0
  return { id: t.id, name: t.name, emoji: t.emoji, client_id: t.client_id, members, totals }
}

const TEAMS_KEY = 'apex_closer_demo_teams'
const TEAM_SEED = [
  { id: 'tm-hugo', name: 'Escuadrón Hugo', emoji: '🔥', client_id: 'cl_hugo', member_ids: ['u-laura', 'u-carlos'] },
  { id: 'tm-yc',   name: 'YC Closers',     emoji: '📦', client_id: 'cl_yc',   member_ids: ['u-diego'] },
]
function loadTeams() {
  try { const s = JSON.parse(localStorage.getItem(TEAMS_KEY)); if (Array.isArray(s)) return s } catch { /* sin storage */ }
  saveTeams(TEAM_SEED)
  return TEAM_SEED.map((t) => ({ ...t, member_ids: [...t.member_ids] }))
}
function saveTeams(t) { try { localStorage.setItem(TEAMS_KEY, JSON.stringify(t)) } catch { /* sin storage */ } }
const TEAMS = loadTeams()

// ── Ranking ──────────────────────────────────────────────────────────────────
function buildRanking(scope) {
  const meRow = { user_id: MY_ID, revenue: DEMO_METRIC_VALUES.revenue, cash: DEMO_METRIC_VALUES.cash_collected, deals: DEMO_METRIC_VALUES.deals, name: MY_PROFILE.display_name, nickname: MY_PROFILE.nickname, photo_url: MY_PROFILE.photo_url }
  let pool = OTHERS
  if (scope === 'friends') pool = OTHERS.filter((o) => o.raw.friend)
  const others = pool.map((o) => ({ user_id: o.profile.user_id, revenue: o.values.revenue, cash: o.values.cash_collected, deals: o.values.deals, name: o.profile.display_name, nickname: o.profile.nickname, photo_url: o.profile.photo_url }))
  const rows = [meRow, ...others].sort((a, b) => b.revenue - a.revenue).map((r, i) => ({ ...r, rank: i + 1 }))
  return { ranking: rows, me: rows.find((r) => r.user_id === MY_ID) || null }
}

// ── Notificaciones ────────────────────────────────────────────────────────────
const NOTIFICATIONS = [
  { id: 'n1', title: 'Venta verificada', body: 'Tu venta de 1.800 € (Mentoría) se ha verificado y ya cuenta en métricas.', link: '/finanzas', read: false },
  { id: 'n2', title: 'Seguimiento pendiente', body: 'Toca enviar el follow-up a Julián Ramos (propuesta).', link: '/pipeline', read: false },
  { id: 'n3', title: 'Nueva solicitud de amistad', body: 'Nuria Pol quiere conectar contigo.', link: '/perfil', read: false },
  { id: 'n4', title: 'Llamada transcrita', body: 'El resumen de “Admisión — María” ya está listo.', link: '/llamadas', read: true },
  { id: 'n5', title: 'Subiste al ranking', body: 'Vas #1 entre tus amigos esta semana. 🐺', link: '/ranking', read: true },
]

// ── Secuencias + tareas ────────────────────────────────────────────────────────
const SEQUENCES = [
  {
    id: 'seq-hot',
    name: 'Follow-up HOT (caliente)',
    trigger_state: 'follow_up_hot',
    active: true,
    steps: [
      { delay_hours: 1, channel: 'whatsapp', type: 'seguimiento', message: 'Gracias por la llamada, te paso la propuesta resumida 👇' },
      { delay_hours: 24, channel: 'email', type: 'seguimiento', message: 'Te dejo el caso de éxito que comentamos + ROI de un solo cierre.' },
      { delay_hours: 72, channel: 'whatsapp', type: 'seguimiento', message: '¿Lo viste? Te reservo hueco mañana para cerrar dudas.' },
    ],
  },
  {
    id: 'seq-noshow',
    name: 'No-show → reagendar',
    trigger_state: 'no_show',
    active: true,
    steps: [
      { delay_hours: 0, channel: 'whatsapp', type: 'confirmacion', message: 'Te esperaba en la llamada, ¿todo bien? Te paso link para reagendar.' },
      { delay_hours: 24, channel: 'email', type: 'seguimiento', message: 'Segundo intento: elige nuevo horario aquí.' },
    ],
  },
  {
    id: 'seq-nurture',
    name: 'Nurture (templado)',
    trigger_state: 'follow_up_nurture',
    active: false,
    steps: [{ delay_hours: 48, channel: 'email', type: 'seguimiento', message: 'Contenido de valor + recordatorio de la oferta.' }],
  },
]

const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString()
const TASKS = [
  { id: 't1', run_at: hoursFromNow(-2), channel: 'whatsapp', type: 'seguimiento', message: 'Gracias por la llamada, te paso la propuesta 👇', status: 'sent' },
  { id: 't2', run_at: hoursFromNow(3), channel: 'email', type: 'seguimiento', message: 'Caso de éxito + ROI de un cierre.', status: 'pending' },
  { id: 't3', run_at: hoursFromNow(20), channel: 'whatsapp', type: 'confirmacion', message: 'Confirma tu llamada de mañana a las 17:00.', status: 'pending' },
  { id: 't4', run_at: hoursFromNow(48), channel: 'whatsapp', type: 'seguimiento', message: '¿Lo viste? Te reservo hueco para cerrar dudas.', status: 'pending' },
]

// ── CV ──
function buildCV(profile, values, isOwner) {
  const eur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
  const fmt = (m) => (m.fmt === 'money' ? eur(m.value) : m.fmt === 'pct' ? (m.value == null ? '—' : `${Math.round(m.value * 100)}%`) : new Intl.NumberFormat('es-ES').format(Math.round(m.value || 0)))
  const ml = metricsList(values, { isOwner, visibility: isOwner ? DEMO_VISIBILITY : (findOther(profile.user_id)?.visibility || DEMO_VISIBILITY) })
  const highlights = ml.filter((m) => m.value != null && m.value !== 0).map((m) => ({ label: m.label, value: fmt(m) }))
  return {
    name: profile.display_name || profile.nickname || 'Closer',
    nickname: profile.nickname,
    headline: profile.headline,
    location: profile.location,
    bio: profile.bio,
    photo_url: profile.photo_url,
    links: profile.links,
    highlights,
    summary: `${profile.display_name} es ${(profile.headline || 'closer').toLowerCase()} con ${highlights.find((h) => h.label === 'Cierres')?.value || '—'} cierres verificados y ${highlights.find((h) => h.label === 'Revenue')?.value || '—'} en ventas. Enfoque en seguimiento sistemático y cierre consultivo.`,
    generated_at: new Date().toISOString(),
  }
}

function searchResults(q) {
  const s = (q || '').toLowerCase().trim()
  const pool = OTHERS.map((o) => card(o.profile))
  if (!s) return pool
  return pool.filter((r) => `${r.display_name} ${r.nickname || ''}`.toLowerCase().includes(s))
}

const findSale = (id) => MOCK_SALES_FULL.find((s) => s.id === id)

// ── Resolver: (base, action) → respuesta con la MISMA forma que el backend ─────
// Devuelve `undefined` si no hay mock para esa ruta (la lib propagará el error).
export function mockResponse(base, action, { query = {}, body = {} } = {}) {
  // /api/profile
  if (base === '/api/profile') {
    if (action === 'get') {
      const uid = query.userId
      const isOwner = uid === MY_ID
      // Vista FILTRADA a un cliente (acceso vía equipo): solo se ven los datos de
      // ESE cliente, con el embudo completo (los compañeros de cuenta lo ven todo).
      if (query.client) {
        const o = isOwner ? null : findOther(uid)
        const profile = isOwner ? MY_PROFILE : (o?.profile || { user_id: uid, display_name: 'Closer', nickname: null, links: [] })
        const values = clientScopedValues(uid, query.client)
        const visAll = METRIC_DEFS.reduce((m, d) => ((m[d.key] = true), m), {})
        return { profile, metrics: metricsList(values, { isOwner: true, visibility: visAll }), isOwner, friendship: isOwner ? null : { id: 'fr', requester_id: MY_ID, addressee_id: uid, status: 'accepted' }, scopedClient: query.client, activity: clientScopedActivity(uid, query.client, profile.display_name) }
      }
      if (isOwner) return { profile: MY_PROFILE, metrics: metricsList(DEMO_METRIC_VALUES, { isOwner: true }), isOwner: true, friendship: null }
      const o = findOther(uid)
      if (!o) return { profile: { user_id: uid, display_name: 'Closer', nickname: null, links: [] }, metrics: [], isOwner: false, friendship: null }
      const friendship = o.raw.friend ? { id: 'fr', requester_id: MY_ID, addressee_id: uid, status: 'accepted' } : null
      return { profile: o.profile, metrics: metricsList(o.values, { isOwner: false, visibility: o.visibility }), isOwner: false, friendship }
    }
    if (action === 'search') return { results: searchResults(query.q) }
    if (action === 'cv') {
      const uid = query.userId || MY_ID
      const isOwner = uid === MY_ID
      const o = isOwner ? null : findOther(uid)
      return { cv: buildCV(isOwner ? MY_PROFILE : (o?.profile || MY_PROFILE), isOwner ? DEMO_METRIC_VALUES : (o?.values || {}), isOwner) }
    }
    if (action === 'update') return { ok: true, profile: { ...MY_PROFILE, ...(body.profile || {}) } }
    if (action === 'upload-photo') return { ok: true, photo_url: body.photo }
    return undefined
  }

  // /api/friends
  if (base === '/api/friends') {
    if (action === 'list') return { friends: FRIENDS, incoming: INCOMING, outgoing: OUTGOING }
    if (action === 'groups') return { groups: GROUPS }
    if (action === 'invite') return { ok: true, invited: true }
    if (action === 'group-create') return { group: { id: `g-${Date.now()}`, name: body.name, emoji: body.emoji || '🔥', members: [] } }
    // Equipos de cliente (persisten en localStorage vía TEAMS).
    if (action === 'teams') return { teams: TEAMS.map(buildTeam) }
    if (action === 'team-create') {
      const nt = { id: `tm-${Date.now()}`, name: body.name, emoji: body.emoji || '🎯', client_id: body.clientId || CLIENTS[0].id, member_ids: [] }
      TEAMS.push(nt); saveTeams(TEAMS); return { team: buildTeam(nt) }
    }
    if (action === 'team-delete') {
      const i = TEAMS.findIndex((t) => t.id === body.teamId); if (i >= 0) TEAMS.splice(i, 1); saveTeams(TEAMS); return { ok: true }
    }
    if (action === 'team-add') {
      const t = TEAMS.find((t) => t.id === body.teamId)
      if (t && !t.member_ids.includes(body.memberId)) { t.member_ids.push(body.memberId); saveTeams(TEAMS) }
      return { ok: true }
    }
    if (action === 'team-remove') {
      const t = TEAMS.find((t) => t.id === body.teamId)
      if (t) { t.member_ids = t.member_ids.filter((id) => id !== body.memberId); saveTeams(TEAMS) }
      return { ok: true }
    }
    if (['respond', 'remove', 'group-delete', 'group-add', 'group-remove'].includes(action)) return { ok: true }
    return undefined
  }

  // /api/sales
  if (base === '/api/sales') {
    if (action === 'list') {
      const rows = query.status ? MOCK_SALES_FULL.filter((s) => s.status === query.status) : MOCK_SALES_FULL
      return { sales: rows }
    }
    if (action === 'upsert') {
      const sale = body.sale || {}
      return { sale: { ...sale, id: sale.id || `s-${Date.now()}`, status: sale.status || 'pending' } }
    }
    if (action === 'delete') return { ok: true }
    if (action === 'verify') return { sale: { ...(findSale(query.id) || { id: query.id }), status: 'verified' } }
    if (action === 'upload-proof') return { sale: { ...(findSale(body.id) || { id: body.id }), proof_url: body.proof, proof_name: body.filename, status: 'pending' } }
    return undefined
  }

  // /api/metrics
  if (base === '/api/metrics') {
    if (action === 'metrics') return { metrics: DEMO_METRIC_VALUES, list: metricsList(DEMO_METRIC_VALUES, { isOwner: true }), visibility: DEMO_VISIBILITY, isOwner: true }
    if (action === 'visibility') return body && body.visible ? { ok: true, visibility: body.visible } : { visibility: DEMO_VISIBILITY }
    return undefined
  }

  // /api/sequences
  if (base === '/api/sequences') {
    if (action === 'list') return { sequences: SEQUENCES, pendingTasks: TASKS.filter((t) => t.status !== 'sent').length }
    if (action === 'tasks') return { tasks: TASKS }
    if (action === 'upsert') return { sequence: { ...(body.sequence || {}), id: (body.sequence && body.sequence.id) || `seq-${Date.now()}` } }
    if (action === 'delete') return { ok: true }
    return undefined
  }

  // /api/notifications
  if (base === '/api/notifications') {
    if (action === 'list') return { notifications: NOTIFICATIONS, unread: NOTIFICATIONS.filter((n) => !n.read).length }
    if (['read', 'read-all'].includes(action)) return { ok: true }
    return undefined
  }

  // /api/ranking
  if (base === '/api/ranking') {
    if (action === 'global') return buildRanking(query.scope || 'global')
    return undefined
  }

  return undefined
}
