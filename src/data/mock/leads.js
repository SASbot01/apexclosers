// Leads (CRM) — modelo enriquecido (recreación fiel del CRM de Apex, scoped por
// cliente). El "próximo paso" (seguimiento) vive en el propio lead.
import { CLIENT_CYCLE } from './clients'

export const STAGES = [
  { key: 'nuevo',     label: 'Nuevo' },
  { key: 'contactado',label: 'Contactado' },
  { key: 'agendada',  label: 'Llamada agendada' },
  { key: 'propuesta', label: 'Propuesta' },
  { key: 'cerrado',   label: 'Cerrado' },
]
export const SOURCES = ['Instagram', 'YouTube', 'Referido', 'Webinar', 'Cold Email', 'Orgánico']
export const TAGS = ['caliente', 'templado', 'frío', 'alto valor', 'decisor']
export const ASSIGNEES = ['Alex', 'Laurent', 'María', 'Diego']

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString() }

const RAW_LEADS = [
  { id: 'l1', name: 'Julián Ramos', company: 'Agencia de captación', email: 'julian@agencia.com', phone: '+34600111222', value: 2000, stage: 'propuesta',  channel: 'WhatsApp', source: 'Instagram', tags: ['caliente', 'alto valor'], assignee: 'Alex',    next_step: 'Enviar propuesta y reagendar cierre', next_at: '2026-06-04', meeting_url: 'https://meet.google.com/abc-defg-hij', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', last_at: daysAgo(1) },
  { id: 'l2', name: 'María León',   company: 'Mentoría fitness',      email: 'maria@fit.com',     phone: '+34600333444', value: 1800, stage: 'cerrado',    channel: 'Email',    source: 'YouTube',   tags: ['decisor'],               assignee: 'María',   next_step: 'Enviar contrato + link 2ª cuota',     next_at: '2026-06-02', meeting_url: 'https://us02web.zoom.us/j/123456789', last_at: daysAgo(2) },
  { id: 'l3', name: 'Roger Vidal',  company: 'E-commerce',            email: 'roger@ecom.com',    phone: '+34600555666', value: 3000, stage: 'agendada',   channel: 'Meet',     source: 'Referido',  tags: ['caliente', 'alto valor'], assignee: 'Laurent', next_step: 'Llamada de admisión hoy 17:00',       next_at: '2026-06-02', meeting_url: 'https://meet.google.com/xyz-1234-abc', video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', last_at: daysAgo(0) },
  { id: 'l4', name: 'Carla Ortiz',  company: 'Infoproducto',          email: 'carla@info.com',    phone: '+34600777888', value: 1200, stage: 'contactado', channel: 'WhatsApp', source: 'Webinar',   tags: ['templado'],              assignee: 'Diego',   next_step: 'Confirmar asistencia a la llamada',   next_at: '2026-06-03', meeting_url: '', last_at: daysAgo(3) },
  { id: 'l5', name: 'Diego Sanz',   company: 'Coaching',              email: 'diego@coach.com',   phone: '+34600999000', value: null, stage: 'nuevo',      channel: 'Instagram',source: 'Instagram', tags: ['frío'],                  assignee: 'Alex',    next_step: 'Primer contacto',                     next_at: '2026-06-02', meeting_url: '', last_at: daysAgo(9) },
  { id: 'l6', name: 'Nuria Gil',    company: 'Agencia SEO',           email: 'nuria@seo.com',     phone: '+34600121212', value: 2500, stage: 'propuesta',  channel: 'WhatsApp', source: 'Cold Email',tags: ['alto valor'],            assignee: 'Laurent', next_step: 'Mandar caso de éxito',                next_at: '2026-06-05', meeting_url: 'https://meet.google.com/qwe-5678-rty', last_at: daysAgo(4) },
  { id: 'l7', name: 'Pablo Ferrer', company: 'SaaS B2B',              email: 'pablo@saas.io',     phone: '+34600343434', value: 4000, stage: 'agendada',   channel: 'Meet',     source: 'Orgánico',  tags: ['caliente', 'decisor'],   assignee: 'María',   next_step: 'Demo técnica martes',                 next_at: '2026-06-06', meeting_url: 'https://us02web.zoom.us/j/987654321', last_at: daysAgo(1) },
]

// Resúmenes "semilla" (como si la IA ya los hubiera generado tras la llamada).
const SEED_SUMMARIES = {
  l1: {
    objetivos: 'Sistematizar su closing y dejar de perder seguimientos; subir cierres sin meter más llamadas.',
    bloqueos: 'Lo lleva todo en Excel y se le caen los follow-ups; sin visibilidad de pipeline.',
    compromiso: 'Alto: pidió propuesta y reagendó cierre para el jueves.',
    cualificacion: 'Encaja — agencia de captación facturando ~25k/mes.',
    financiera: 'Capacidad alta; presupuesto disponible y decisión propia.',
    prioridad: 'Alta — actuar esta semana antes de que se enfríe.',
    decision: 'Es el decisor; puede cerrar él solo.',
  },
  l3: {
    objetivos: 'Escalar su e-commerce con un proceso de ventas que no dependa solo de él.',
    bloqueos: 'No tiene equipo comercial estructurado; todo depende de su tiempo.',
    compromiso: 'Medio-alto: llamada de admisión agendada para hoy.',
    cualificacion: 'Encaja; viene de referido, contexto sólido.',
    financiera: 'Capacidad alta (ticket ~3.000€).',
    prioridad: 'Alta — está en fase de admisión.',
    decision: 'Confirmar si decide solo o con un socio.',
  },
}

export const MOCK_LEADS = RAW_LEADS.map((l, i) => ({
  ...l,
  client_id: l.client_id || CLIENT_CYCLE[i % CLIENT_CYCLE.length],
  summary: SEED_SUMMARIES[l.id] || null,
}))

// Smart Views de fábrica (como en Apex). filter = subconjunto de dimensiones.
export const SMART_VIEWS = [
  { id: 'all',       name: 'Todos',        system: true, filter: {} },
  { id: 'hot',       name: 'Calientes',    system: true, filter: { tag: 'caliente' } },
  { id: 'proposal',  name: 'En propuesta', system: true, filter: { stage: 'propuesta' } },
  { id: 'highvalue', name: 'Alto valor',   system: true, filter: { minValue: 2000 } },
  { id: 'stale',     name: 'Sin tocar 7d+',system: true, filter: { staleDays: 7 } },
]

export function leadMatches(lead, f) {
  if (!f) return true
  if (f.client && lead.client_id !== f.client) return false
  if (f.stage && lead.stage !== f.stage) return false
  if (f.source && lead.source !== f.source) return false
  if (f.tag && !(lead.tags || []).includes(f.tag)) return false
  if (f.assignee && lead.assignee !== f.assignee) return false
  if (f.minValue && !(Number(lead.value) >= f.minValue)) return false
  if (f.staleDays) {
    const days = lead.last_at ? (Date.now() - new Date(lead.last_at).getTime()) / 86400000 : 999
    if (days < f.staleDays) return false
  }
  if (f.q) {
    const hay = `${lead.name} ${lead.company} ${lead.email}`.toLowerCase()
    if (!hay.includes(f.q.toLowerCase())) return false
  }
  return true
}

// Campos del resumen del lead (generado por IA al terminar la llamada).
export const SUMMARY_FIELDS = [
  { key: 'objetivos',    label: 'Objetivos' },
  { key: 'bloqueos',     label: 'Bloqueos' },
  { key: 'compromiso',   label: 'Compromiso' },
  { key: 'cualificacion',label: 'Cualificación' },
  { key: 'financiera',   label: 'Financiera' },
  { key: 'prioridad',    label: 'Prioridad' },
  { key: 'decision',     label: 'Decisión' },
]

// Generación demo (lead-aware) — en vivo lo produce la IA desde la transcripción.
export function genLeadSummary(lead) {
  const tags = lead.tags || []
  const hot = tags.includes('caliente')
  return {
    objetivos: `Quiere escalar ${lead.company || 'su negocio'} y resolver lo que le frena; busca resultados en 3-6 meses.`,
    bloqueos: `Le frena ${lead.stage === 'propuesta' ? 'cerrar la decisión' : 'la falta de sistema y seguimiento'}; pierde oportunidades por no tener proceso.`,
    compromiso: `Compromiso ${hot || tags.includes('alto valor') ? 'alto' : 'medio'} — ${lead.next_step || 'pendiente de próximo paso'}.`,
    cualificacion: `Encaja con el perfil${lead.source ? `; viene de ${lead.source}` : ''}.`,
    financiera: `Capacidad ${Number(lead.value) >= 2000 ? 'alta' : 'media'}${lead.value ? ` (${lead.value}€)` : ''}; ${lead.value ? 'presupuesto acorde' : 'confirmar presupuesto'}.`,
    prioridad: `Prioridad ${hot ? 'alta — actuar esta semana' : 'media'}.`,
    decision: tags.includes('decisor') ? 'Es el decisor; puede cerrar solo.' : 'Confirmar si es el decisor o hay terceros.',
  }
}
