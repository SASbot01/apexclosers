// Apex Elo — rating COMPUESTO de un closer derivado de TODAS sus métricas reales
// (resultado, eficiencia, habilidad del workshop y consistencia), llevado a una
// escala Elo mediante un modelo de "partidos" todos-contra-todos, con
// DECAIMIENTO POR INACTIVIDAD: a partir de 7 días sin actividad el rating cae,
// de modo que cualquier closer activo termina adelantando al inactivo. Un closer
// totalmente inactivo (>30 días o sin datos) nunca se sostiene por encima de uno
// activo.
//
// Es determinista (sin azar): mismas métricas → mismo Elo. La función pura recibe
// las estadísticas crudas por closer y devuelve { ratings, byId }.

const INACTIVE_DAYS = 7      // a partir de aquí empieza a decaer
const DEAD_DAYS = 30         // a partir de aquí se considera inactivo "duro"
const BASE = 1500            // Elo de partida
const SCALE = 6              // cuánto separa el rating una diferencia de forma
const K = 28                 // factor de aprendizaje del round-robin
const PASSES = 16            // iteraciones hasta converger

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
    x.dead = f.daysSince >= DEAD_DAYS || !isFinite(f.daysSince)
    // Forma efectiva: la inactividad debilita; así los activos ganan los "partidos".
    x.eff = clamp(x.form * x.activity)
  }

  // Round-robin Elo: cada closer "juega" contra todos. El resultado esperado de
  // i vs j sale de la diferencia de forma efectiva (logística); el rating se
  // ajusta hacia el resultado real durante varias pasadas hasta converger.
  const n = feats.length
  const R = feats.map(() => BASE)
  if (n > 1) {
    const score = (a, b) => 1 / (1 + Math.exp(-(a - b) * SCALE))         // forma → prob. de ganar
    for (let p = 0; p < PASSES; p++) {
      const delta = new Array(n).fill(0)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const exp_i = 1 / (1 + Math.pow(10, (R[j] - R[i]) / 400))      // esperado por Elo
          const act_i = score(feats[i].eff, feats[j].eff)               // real por forma
          const d = K * (act_i - exp_i)
          delta[i] += d
          delta[j] -= d
        }
      }
      for (let i = 0; i < n; i++) R[i] += delta[i] / (n - 1)
    }
  }

  const ratings = feats.map((x, i) => ({
    userId: x.userId,
    elo: Math.round(R[i]),
    form: Math.round(x.form * 1000) / 1000,
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

  // Orden: los inactivos "duros" SIEMPRE por debajo de cualquier activo (no se
  // sostienen en el ranking); dentro de cada grupo, por Elo.
  ratings.sort((a, b) => (a.dead === b.dead ? b.elo - a.elo : a.dead ? 1 : -1))
  ratings.forEach((r, i) => { r.rank = i + 1 })

  const byId = Object.fromEntries(ratings.map(r => [r.userId, r]))
  return { ratings, byId }
}
