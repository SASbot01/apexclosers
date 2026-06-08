// Workshop (IA) — habilidades del closer derivadas de sus llamadas. En producción
// las calcula la IA a partir de las transcripciones; aquí, datos demo creíbles.

// Hexagrama = 6 habilidades (esto es lo que pinta el hexágono).
export const SKILLS = [
  { key: 'apertura',      label: 'Apertura',     value: 0.82 },
  { key: 'descubrimiento',label: 'Descubrim.',   value: 0.67 },
  { key: 'propuesta',     label: 'Propuesta',    value: 0.90 },
  { key: 'objeciones',    label: 'Objeciones',   value: 0.55 },
  { key: 'cierre',        label: 'Cierre',       value: 0.93 },
  { key: 'seguimiento',   label: 'Seguim.',      value: 0.72 },
]
export const strongest = () => SKILLS.reduce((a, s) => s.value > a.value ? s : a, SKILLS[0])
export const weakest = () => SKILLS.reduce((a, s) => s.value < a.value ? s : a, SKILLS[0])

// Perfil de estilo (cabecera).
export const CLOSER_TYPE = 'Consultivo'
export const CLOSER_TYPE_DESC = 'Escuchas más de lo que hablas y cierras por valor.'
export const TALK_PCT = 0.41
export const LISTEN_PCT = 0.59
export const TALK_TIME = '7:48'      // media por llamada
export const LISTEN_TIME = '11:12'
export const FREQUENT_OBJECTION = 'Precio'
export const CALLS_ANALYZED = 42

// Evolución (histograma con reflejo) — métricas seleccionables, distintas de las
// habilidades del hexágono. La serie se GENERA por granularidad (día/semana/mes)
// con una tendencia from→to + ondulación determinista (sin Math.random).
export const EVOLUTION = {
  close_rate: { label: 'Close rate',             fmt: 'pct',   from: 0.18, to: 0.31 },
  listen:     { label: 'Ratio de escucha',       fmt: 'pct',   from: 0.47, to: 0.59 },
  revenue:    { label: 'Revenue',                fmt: 'money', from: 4800, to: 9200 },
  objeciones: { label: 'Habilidad · Objeciones', fmt: 'pct',   from: 0.40, to: 0.55 },
  cierre:     { label: 'Habilidad · Cierre',     fmt: 'pct',   from: 0.80, to: 0.93 },
}
export const METRIC_OPTIONS = Object.entries(EVOLUTION).map(([key, v]) => ({ key, label: v.label }))

export const GRANS = [
  { key: 'dia',    label: 'Día' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes',    label: 'Mes' },
]
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun']
const GRAN_CFG = {
  dia:    { n: 14, label: (i) => `${i + 1}` },
  semana: { n: 8,  label: (i) => `S${i + 1}` },
  mes:    { n: 6,  label: (i) => MONTHS[i] || `${i + 1}` },
}
// Genera la serie [ [label, value], ... ] para una métrica, granularidad y seed
// (el seed viene de los filtros cliente/periodo → al cambiarlos, cambia la serie).
export function evoSeries(key, gran = 'mes', seed = 0) {
  const m = EVOLUTION[key]; const g = GRAN_CFG[gran] || GRAN_CFG.mes; const n = g.n
  const span = m.to - m.from
  const lvl = 1 + (seed - 0.5) * 0.30   // ±15% de nivel según filtros
  const out = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1)
    const wobble = Math.sin(i * 1.6 + key.length + seed * 6) * Math.abs(span) * 0.10
    let v = (m.from + span * t + wobble) * lvl
    v = m.fmt === 'pct' ? Math.max(0, Math.min(1, v)) : Math.max(0, Math.round(v))
    out.push([g.label(i), v])
  }
  return out
}

// ── Datos derivados de los filtros (cliente + periodo) ───────────────────────
// Demo determinista: al cambiar de cliente o periodo, todo el Workshop se
// recalcula (habilidades, estilo, volumen) como si fueran sus llamadas reales.
const clamp01 = (v) => Math.max(0.05, Math.min(0.99, v))
function hash01(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 100000) / 100000
}
const OBJECTIONS = ['Precio', 'Tiempo', 'Confianza', 'Autoridad', 'Necesidad']
const PERIOD_CALLS = { this_month: 14, this_quarter: 41, this_year: 156, all: 233 }

export function deriveWorkshop(client = 'all', period = 'this_year') {
  const tag = `${client}|${period}`
  const seed = hash01(tag)
  const jit = (v, amt, k) => clamp01(v + (hash01(tag + '|' + k) - 0.5) * 2 * amt)
  const skills = SKILLS.map(s => ({ ...s, value: jit(s.value, 0.09, s.key) }))
  const talk = clamp01(jit(0.41, 0.07, 'talk'))
  const listen = clamp01(1 - talk)
  const clientFactor = client === 'all' ? 1 : 0.22 + hash01(client + 'cf') * 0.4
  const calls = Math.max(3, Math.round((PERIOD_CALLS[period] || 156) * clientFactor))
  const hours = Math.round(calls * (0.38 + seed * 0.08))
  const words = Math.round(calls * (2900 + Math.round(seed * 900)))
  const questions = Math.round((6 + hash01(tag + 'q') * 5) * 10) / 10
  const objection = OBJECTIONS[Math.floor(hash01(tag + 'obj') * OBJECTIONS.length)]
  const byKey = Object.fromEntries(skills.map(s => [s.key, s.value]))
  const closer = listen >= 0.58 ? { name: 'Consultivo', desc: 'Escucha > habla' }
    : byKey.cierre >= 0.9 ? { name: 'Cerrador', desc: 'Fuerte en el cierre' }
      : byKey.objeciones >= 0.7 ? { name: 'Negociador', desc: 'Domina objeciones' }
        : { name: 'Directo', desc: 'Va al grano' }
  const strong = skills.reduce((a, s) => s.value > a.value ? s : a, skills[0])
  const weak = skills.reduce((a, s) => s.value < a.value ? s : a, skills[0])

  // Desglose de resultados (suma = calls).
  const owon = Math.round(calls * (0.22 + hash01(tag + 'w') * 0.12))
  const ono = Math.round(calls * (0.10 + hash01(tag + 'ns') * 0.07))
  const olost = Math.round(calls * (0.18 + hash01(tag + 'l') * 0.10))
  const ofollow = Math.max(0, calls - owon - ono - olost)
  const outcomes = [
    { key: 'won', label: 'Cerradas', value: owon },
    { key: 'follow', label: 'Seguimiento', value: ofollow },
    { key: 'lost', label: 'Perdidas', value: olost },
    { key: 'noshow', label: 'No-show', value: ono },
  ]
  // Tono / sentimiento (suma 100) + ritmo de habla.
  const tSeguro = Math.round(42 + hash01(tag + 'ts') * 26)
  const tEmpatico = Math.round(18 + hash01(tag + 'te') * 22)
  const tDudas = Math.max(0, 100 - tSeguro - tEmpatico)
  const tones = [
    { label: 'Seguridad', value: tSeguro },
    { label: 'Empatía', value: tEmpatico },
    { label: 'Dudas', value: tDudas },
  ]
  const dominantTone = tones.reduce((a, t) => t.value > a.value ? t : a, tones[0]).label
  const wpm = Math.round(122 + hash01(tag + 'wpm') * 38)

  return { seed, skills, talk, listen, calls, hours, words, questions, objection, closer, strong, weak, outcomes, tones, dominantTone, wpm }
}

// Cuello de botella (teoría de restricciones): la habilidad MÁS DÉBIL es la que
// limita toda la cadena; corregirla es la acción de mayor palanca. Devuelve el
// diagnóstico, la acción y el impacto proyectado (lo que se desbloquea).
const BOTTLENECK_ACTIONS = {
  apertura: {
    headline: 'Apertura de la llamada',
    diagnosis: 'Arrancas sin fijar agenda ni autoridad, así que el resto de la llamada va a remolque.',
    action: 'Usa un marco de 30 s al empezar: contexto → permiso → agenda. Aplícalo en cada primera llamada esta semana.',
    why: 'Una apertura que toma el control arrastra al alza descubrimiento, propuesta y cierre.',
  },
  descubrimiento: {
    headline: 'Profundidad del descubrimiento',
    diagnosis: 'Cierras las preguntas demasiado pronto; sin dolor cuantificado, propuesta y cierre se caen.',
    action: 'Añade 2 preguntas de dolor + 1 de impacto económico antes de presentar. Practícalo hoy en roleplay.',
    why: 'Es la restricción raíz: sin dolor claro, todo lo que viene después convierte peor.',
  },
  propuesta: {
    headline: 'Construcción de la propuesta',
    diagnosis: 'Presentas características antes de anclar valor, y eso dispara la objeción de precio.',
    action: 'Reordena tu propuesta tipo: ROI de un solo cierre → prueba social → precio. Reescríbela esta semana.',
    why: 'Una propuesta anclada en valor desactiva las objeciones antes de que aparezcan.',
  },
  objeciones: {
    headline: 'Manejo de objeciones',
    diagnosis: 'Cuando aparece “precio” sueltas la cifra antes de re-anclar valor, y ahí se te caen las llamadas calientes.',
    action: 'Memoriza 3 rebatidas de precio (validar → re-anclar ROI → cifra) y haz 3 roleplays esta semana.',
    why: 'Es donde más llamadas calientes se pierden: corregirlo sube directo tu close rate.',
  },
  cierre: {
    headline: 'Pedir el cierre',
    diagnosis: 'Llegas con el valor construido pero no pides el sí con claridad y dejas que la llamada se enfríe.',
    action: 'Cierre asumido + silencio: tras la oferta propón el siguiente paso y calla 3 segundos. Cada llamada.',
    why: 'Convierte en ventas el trabajo que ya haces bien antes; es la palanca más inmediata.',
  },
  seguimiento: {
    headline: 'Sistema de seguimiento',
    diagnosis: 'Las llamadas en “seguimiento” se enfrían porque no hay un follow-up sistemático.',
    action: 'Activa una secuencia de 3 toques en 72 h para cada “seguimiento” y agéndalos al colgar.',
    why: 'Recuperas pipeline que ya generaste: el revenue está, solo falta no dejarlo escapar.',
  },
  _default: {
    headline: 'Tu habilidad más débil',
    diagnosis: 'Es la fase que más frena tu conversión global ahora mismo.',
    action: 'Concentra toda tu práctica de esta semana en esta fase.',
    why: 'Mejorar la restricción principal arrastra al alza todo lo demás.',
  },
}

const TICKET = 1600
export function deriveBottleneck(d) {
  const weak = d.weak
  const w = weak.value
  const gap = Math.min(0.40, Math.max(0.05, 0.80 - w))         // recorrido hasta nivel sano
  const liftPts = Math.max(3, Math.round(gap * 34))            // +pts de close rate proyectados
  const won = d.outcomes.find(o => o.key === 'won')?.value || Math.round(d.calls * 0.27)
  const extraDeals = Math.max(1, Math.round(won * gap * 1.05)) // cierres extra al levantar la restricción
  const revLift = extraDeals * TICKET
  const meta = BOTTLENECK_ACTIONS[weak.key] || BOTTLENECK_ACTIONS._default
  return {
    area: weak.label,
    key: weak.key,
    value: w,
    headline: meta.headline,
    diagnosis: meta.diagnosis,
    action: meta.action,
    why: meta.why,
    liftPts,
    revLift,
    extraDeals,
    confidence: Math.round(74 + d.seed * 20),                  // % de confianza de la IA
  }
}

// Lecturas de la IA (puntos fuertes / a mejorar / plan).
export const AI_READOUT = {
  strengths: [
    'Cierre asumido natural: pides el sí sin titubear.',
    'Prueba social muy bien colocada en la propuesta.',
    'Buen anclaje de valor antes de soltar el precio.',
  ],
  weaknesses: [
    'Manejo de objeciones: te adelantas al precio antes de cerrar valor.',
    'Descubrimiento corto: cierras preguntas demasiado pronto.',
    'Pocos silencios estratégicos tras la oferta.',
  ],
  next: [
    'Practica 3 rebatidas de “precio” con caso de éxito (roleplay).',
    'Alarga el descubrimiento: 2 preguntas de dolor más por llamada.',
    'Tras la oferta, cuenta 3 segundos antes de hablar.',
  ],
}

// Conversaciones de ejemplo para el chat.
export const SEED_CHATS = [
  {
    id: 'w-seed-1',
    title: '¿Por qué pierdo en objeciones?',
    created_at: new Date('2026-06-06T10:00:00').toISOString(),
    messages: [
      { role: 'user', body: '¿Por qué se me caen las llamadas en la fase de objeciones?', ts: 1 },
      { role: 'assistant', body: 'En tus últimas 42 llamadas, tu fase más débil es Objeciones (55%). El patrón: cuando aparece “precio”, sueltas la cifra antes de re-anclar valor. Prueba: valida → re-ancla con ROI de un cierre → cifra. ¿Te preparo 3 rebatidas listas?', ts: 2 },
    ],
  },
  {
    id: 'w-seed-2',
    title: 'Plan para subir mi cierre',
    created_at: new Date('2026-06-05T16:30:00').toISOString(),
    messages: [
      { role: 'user', body: 'Dame un plan de 7 días para subir mi close rate.', ts: 1 },
      { role: 'assistant', body: 'Tu cierre ya es tu punto fuerte (93%); la palanca está en Objeciones y Descubrimiento. Días 1-2 roleplay de objeción precio; 3-4 alarga descubrimiento; 5-7 graba 3 llamadas y revisamos. Proyección: +8-12% de close rate.', ts: 2 },
    ],
  },
]
