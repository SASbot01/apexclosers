// Apex Elo — rating COMPUESTO de un closer derivado de TODAS sus métricas reales
// (resultado, eficiencia, habilidad del workshop y consistencia). EMPIEZA EN 0 y
// SE GANA: sin llamadas reales el Elo es 0. La forma efectiva (0..1) se lleva a
// puntos con tres palancas:
//   1) FORMA: media ponderada de todas las métricas (pesos abajo).
//   2) FIABILIDAD: pocas llamadas valen poco (1 llamada no puede valer como 50);
//      sube con el volumen real hasta el tope FULL_CONF.
//   3) ACTIVIDAD: decae con la inactividad (a los 7 días empieza a bajar, a los 30
//      es inactivo "duro"), así un activo siempre termina adelantando al parado.
// Para entrar al ranking hace falta un mínimo de llamadas (MIN_CALLS) o un cierre;
// por debajo de eso, Elo = 0.
//
// Es determinista (sin azar): mismas métricas → mismo Elo. La función pura recibe
// las estadísticas crudas por closer y devuelve { ratings, byId }.

const INACTIVE_DAYS = 7      // a partir de aquí empieza a decaer
const DEAD_DAYS = 30         // a partir de aquí se considera inactivo "duro"
const ELO_SCALE = 2500       // forma efectiva (0..1) → puntos Elo (0..2500)
const MIN_CALLS = 3          // mínimo de llamadas para entrar al ranking (si no, 0)
const FULL_CONF = 20         // nº de señales (llamadas + cierres) para fiabilidad plena

// Pesos del rendimiento (suman 1). Cuatro bloques: negocio, eficiencia, habilidad
// y consistencia. Cambiar aquí re-pondera todo el ranking.
export const ELO_WEIGHTS = {
  closeRate:    0.15,   // cierres / ofertas
  revenue:      0.12,   // facturación verificada (normalizada al cohorte)
  deals:        0.10,   // nº de cierres
  recollected:  0.08,   // cash cobrado / revenue
  showRate:     0.08,   // realizadas / agendadas
  offerRate:    0.07,   // ofertas / realizadas
  avgTicket:    0.10,   // ticket medio
  skill:        0.12,   // hexagrama de habilidades (workshop)
  objHandling:  0.08,   // cierres con objeción / llamadas con objeción
  callVol:      0.06,   // volumen de llamadas
  pipeline:     0.04,   // salud del pipeline (leads no estancados)
}

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))
const sum = (a) => a.reduce((x, y) => x + y, 0)
const SKILL_KEYS = ['apertura', 'descubrimiento', 'propuesta', 'objeciones', 'cierre', 'seguimiento']

// Percentil p (0..1) de un array de números (>0 para normalizar volumen sin que
// un único "whale" aplaste al resto). Cae al máximo si no hay dispersión.
function pct(values, p) {
  const v = values.filter(x => x > 0).sort((a, b) => a - b)
  if (!v.length) return 0
  const i = clamp(Math.floor(p * (v.length - 1)), 0, v.length - 1)
  return v[i] || v[v.length - 1]
}

// ── Features crudas por closer ──────────────────────────────────────────────
function rawFeatures(c, now) {
  const sales = c.sales || [], calls = c.calls || [], leads = c.leads || []

  const revenue = sum(sales.map(s => Number(s.revenue) || 0))
  const cash    = sum(sales.map(s => Number(s.cash_collected) || 0))
  const deals   = sales.length
  const avgTicket = deals ? revenue / deals : 0
  const recollected = revenue ? clamp(cash / revenue) : 0

  const held    = calls.filter(c => c.status === 'done' || ['won', 'lost', 'follow_up'].includes(c.outcome) || c.offer_made || c.deal_closed).length
  const noShow  = calls.filter(c => c.state === 'no_show' || c.outcome === 'no_show').length
  const offers  = calls.filter(c => c.offer_made).length
  const won     = calls.filter(c => c.outcome === 'won' || c.deal_closed).length
  const showRate  = (held + noShow) ? held / (held + noShow) : 0
  const offerRate = held ? clamp(offers / held) : 0
  const closeRate = offers ? clamp(won / offers) : 0

  const withSkills = calls.filter(c => c.skills && typeof c.skills === 'object')
  const skill = withSkills.length
    ? clamp(sum(withSkills.map(s => sum(SKILL_KEYS.map(k => Number(s.skills[k]) || 0)) / SKILL_KEYS.length)) / withSkills.length)
    : 0
  const objCalls = calls.filter(c => Array.isArray(c.objections) && c.objections.length)
  const wonObj   = objCalls.filter(c => c.outcome === 'won' || c.deal_closed).length
  const objHandling = objCalls.length ? clamp(wonObj / objCalls.length) : closeRate

  const openLeads  = leads.filter(l => l.stage !== 'cerrado' && l.stage !== 'cerrada')
  const stale = openLeads.filter(l => !l.last_at || (now - new Date(l.last_at).getTime()) > 7 * 86400 * 1000)
  const pipeline = openLeads.length ? clamp((openLeads.length - stale.length) / openLeads.length) : 0

  // Última actividad: la fecha más reciente entre llamadas y ventas.
  const dates = [
    ...calls.map(c => c.started_at && new Date(c.started_at).getTime()),
    ...sales.map(s => s.date && new Date(s.date).getTime()),
  ].filter(Boolean)
  const lastActivity = dates.length ? Math.max(...dates) : null
  const daysSince = lastActivity == null ? Infinity : (now - lastActivity) / 86400000

  return {
    revenue, cash, deals, avgTicket, recollected, held, noShow, offers, won,
    showRate, offerRate, closeRate, skill, objHandling, callVol: calls.length,
    pipeline, lastActivity, daysSince,
  }
}

// Factor de actividad (1 = al día; → 0 conforme se vuelve inactivo). Antes de 7
// días no penaliza; entre 7 y 30 cae linealmente; tras 30, residual.
function activityFactor(daysSince) {
  if (daysSince <= INACTIVE_DAYS) return 1
  if (daysSince >= DEAD_DAYS) return Math.max(0.05, 0.25 - (daysSince - DEAD_DAYS) / 200)
  return clamp((DEAD_DAYS - daysSince) / (DEAD_DAYS - INACTIVE_DAYS), 0.25, 1)
}

// ── Cálculo principal ───────────────────────────────────────────────────────
// closers: [{ userId, sales, calls, leads }]. Devuelve ratings ordenados.
export function computeApexElo(closers, now = Date.now()) {
  const feats = closers.map(c => ({ userId: c.userId, f: rawFeatures(c, now) }))
  if (!feats.length) return { ratings: [], byId: {} }

  // Topes de normalización para los volúmenes (percentil 90 del cohorte).
  const cap = {
    revenue:   pct(feats.map(x => x.f.revenue), 0.9),
    deals:     pct(feats.map(x => x.f.deals), 0.9),
    avgTicket: pct(feats.map(x => x.f.avgTicket), 0.9),
    callVol:   pct(feats.map(x => x.f.callVol), 0.9),
  }
  const normVol = (x, k) => cap[k] > 0 ? clamp(x / cap[k]) : 0

  // Sub-puntuaciones 0..1 + forma compuesta + forma efectiva (con decaimiento).
  for (const x of feats) {
    const f = x.f
    const sub = {
      closeRate:   f.closeRate,
      revenue:     normVol(f.revenue, 'revenue'),
      deals:       normVol(f.deals, 'deals'),
      recollected: f.recollected,
      showRate:    f.showRate,
      offerRate:   f.offerRate,
      avgTicket:   normVol(f.avgTicket, 'avgTicket'),
      skill:       f.skill,
      objHandling: f.objHandling,
      callVol:     normVol(f.callVol, 'callVol'),
      pipeline:    f.pipeline,
    }
    x.sub = sub
    x.form = clamp(sum(Object.keys(ELO_WEIGHTS).map(k => ELO_WEIGHTS[k] * sub[k])))
    x.activity = activityFactor(f.daysSince)
    x.inactive = f.daysSince > INACTIVE_DAYS

    // ¿Entra al ranking? Hace falta un mínimo de llamadas reales o un cierre.
    // Sin eso, Elo = 0 (es lo que pasa ahora: nadie tiene llamadas reales).
    x.ranked = f.callVol >= MIN_CALLS || f.deals >= 1
    // Fiabilidad por muestra: 1 llamada vale poco; sube con el volumen real.
    x.confidence = clamp((f.callVol + f.deals) / FULL_CONF)
    // "Inactivo duro": sin datos o parado >30 días → siempre por debajo y sin sostén.
    x.dead = !x.ranked || f.daysSince >= DEAD_DAYS || !isFinite(f.daysSince)
    // Elo = forma × actividad × fiabilidad, anclado en 0 y escalado a puntos.
    x.eff = clamp(x.form * x.activity * x.confidence)
    x.elo = x.ranked ? Math.round(x.eff * ELO_SCALE) : 0
  }

  const ratings = feats.map((x) => ({
    userId: x.userId,
    elo: x.elo,
    ranked: x.ranked,
    form: Math.round(x.form * 1000) / 1000,
    confidence: Math.round(x.confidence * 100) / 100,
    activity: Math.round(x.activity * 100) / 100,
    inactive: x.inactive,
    dead: x.dead,
    daysSince: isFinite(x.f.daysSince) ? Math.floor(x.f.daysSince) : null,
    breakdown: x.sub,
    revenue: x.f.revenue,
    cash: x.f.cash,
    deals: x.f.deals,
    closeRate: x.f.closeRate,
  }))

  // Orden: primero los que están en el ranking (Elo>0), por Elo desc; los que no
  // han entrado (0) o están inactivos "duros", al final.
  ratings.sort((a, b) => (a.dead === b.dead ? b.elo - a.elo : a.dead ? 1 : -1))
  ratings.forEach((r, i) => { r.rank = i + 1 })

  const byId = Object.fromEntries(ratings.map(r => [r.userId, r]))
  return { ratings, byId }
}
