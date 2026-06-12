// Apex Elo — rating PROFESIONAL tipo Glicko-1 por closer.
//
// Cómo funciona ahora:
//   1) CONTIENDAS: cada llamada con oferta hecha (o cierre/won/lost) es una
//      "partida" contra un rival sintético cuya dificultad sube con las
//      objeciones afrontadas (DIFF_BASE + DIFF_PER_OBJ por objeción, cap 5).
//      El resultado s ∈ [0,1] depende del outcome/state (won=1, depósito=0.8,
//      follow_up caliente=0.45, tibio=0.30, perdido=0) matizado por las
//      habilidades del workshop si existen.
//   2) GLICKO: replay secuencial de las contiendas en orden cronológico,
//      partiendo de R=1000, RD=350. El RD (incertidumbre) baja al jugar y se
//      infla con los días de inactividad entre contiendas (C_DAY), de modo que
//      el rating decae de forma natural si dejas de competir.
//   3) RATING CONSERVADOR: Rc = R - Z*RD. Un novato (R0, RD0) queda en el
//      suelo (RATING_FLOOR) → 0 puntos. Solo lo GANADO sobre el suelo puntúa.
//   4) BONUS DE CALIDAD: 0..QUALITY_MAX puntos por métricas ABSOLUTAS de
//      negocio/eficiencia/habilidad (ELO_WEIGHTS), con normalizaciones fijas
//      (FULL) y close rate con shrinkage bayesiano — NO depende del cohorte.
//   5) PUNTOS APEX: elo = (ganado*PT_PER_RATING + quality*QUALITY_MAX) ×
//      factor de actividad, con tope ELO_CAP. Sin contiendas mínimas ni
//      cierres, elo = 0 (no entras al ranking).
//
// Es ABSOLUTO (el rating de un closer no depende de los demás) y DETERMINISTA
// (mismo input + mismo `now` → mismo resultado). La función pura recibe las
// estadísticas crudas por closer y devuelve { ratings, byId }.

// ── Constantes tuneables ────────────────────────────────────────────────────
const R0 = 1000, RD0 = 350, RD_MIN = 30           // Glicko base/uncertainty
const Q = Math.log(10) / 400                       // constante Glicko
const OPP_RD = 60                                  // incertidumbre de la "dificultad" (calibrada)
const DIFF_BASE = 1000                             // dificultad base de una contienda
const DIFF_PER_OBJ = 70                            // +dificultad por objeción afrontada (cap 5)
const C_DAY = 34                                   // inflación de RD por día inactivo (Glicko)
const Z = 1.5                                      // factor conservador (rating mostrado = R - Z*RD)
const RATING_FLOOR = R0 - Z * RD0                  // 475: suelo => novato ~ 0 puntos
const PT_PER_RATING = 2.2                          // puntos Apex por punto de rating ganado
const QUALITY_MAX = 400                            // bonus máximo de calidad (puntos)
const ELO_CAP = 3000                               // tope de puntos
const MIN_CONTESTS = 3                             // contiendas mínimas para entrar al ranking
const INACTIVE_DAYS = 7, DEAD_DAYS = 30            // para activityFactor / dead
const FULL = { rev: 30000, ticket: 3000, deals: 15, callVol: 40 } // referencias ABSOLUTAS de volumen

// Pesos del BONUS DE CALIDAD (suman 1). Cambiar aquí re-pondera el bonus.
export const ELO_WEIGHTS = {
  closeRate:    0.15,   // cierres / ofertas (con shrinkage bayesiano)
  revenue:      0.12,   // facturación verificada (log, ref FULL.rev)
  deals:        0.10,   // nº de cierres (ref FULL.deals)
  recollected:  0.08,   // cash cobrado / revenue
  showRate:     0.08,   // realizadas / agendadas
  offerRate:    0.07,   // ofertas / realizadas
  avgTicket:    0.10,   // ticket medio (log, ref FULL.ticket)
  skill:        0.12,   // hexagrama de habilidades (workshop)
  objHandling:  0.08,   // cierres con objeción / llamadas con objeción
  callVol:      0.06,   // volumen de llamadas (ref FULL.callVol)
  pipeline:     0.04,   // salud del pipeline (leads no estancados)
}

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))
const sum = (a) => a.reduce((x, y) => x + y, 0)
const SKILL_KEYS = ['apertura', 'descubrimiento', 'propuesta', 'objeciones', 'cierre', 'seguimiento']

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

// ── PASO 1: contiendas + replay Glicko ──────────────────────────────────────
// Una llamada es CONTIENDA si hubo oferta o resolución (won/lost). Devuelve
// [{ s, Rj, t }] con score, dificultad del rival y timestamp.
function extractContests(calls) {
  const contests = []
  for (const call of calls || []) {
    const isContest = call.offer_made === true || call.deal_closed === true ||
      call.outcome === 'won' || call.outcome === 'lost'
    if (!isContest) continue

    const won = (call.outcome === 'won' || call.deal_closed === true)
    let base
    if (won) base = (call.state === 'deposito') ? 0.8 : 1.0
    else if (call.outcome === 'lost' || call.state === 'perdido') base = 0.0
    else if (call.outcome === 'follow_up') base = (call.state === 'follow_up_hot') ? 0.45 : 0.30
    else base = 0.5

    let s = base
    if (call.skills && typeof call.skills === 'object') {
      const sk = clamp(sum(SKILL_KEYS.map(k => Number(call.skills[k]) || 0)) / SKILL_KEYS.length)
      s = clamp(0.85 * base + 0.15 * sk)
    }

    const Rj = DIFF_BASE + DIFF_PER_OBJ * Math.min(5, (call.objections?.length || 0))
    const t = call.started_at ? new Date(call.started_at).getTime() : null
    contests.push({ s, Rj, t })
  }
  // Orden cronológico ascendente; fechas null al principio (sin inflación).
  contests.sort((a, b) => (a.t == null ? -Infinity : a.t) - (b.t == null ? -Infinity : b.t))
  return contests
}

// Replay Glicko-1 secuencial (un juego por update). Devuelve { R, RD, contests }.
function glickoReplay(contests, now) {
  let R = R0, RD = RD0, lastT = null
  const g = 1 / Math.sqrt(1 + 3 * Q * Q * OPP_RD * OPP_RD / (Math.PI * Math.PI))

  for (const { s, Rj, t } of contests) {
    // Inflación de RD por inactividad entre contiendas (decaimiento Glicko).
    if (t != null && lastT != null) {
      const idle = Math.max(0, (t - lastT) / 86400000)
      RD = Math.min(RD0, Math.sqrt(RD * RD + C_DAY * C_DAY * idle))
    }
    if (t != null) lastT = t

    const E = 1 / (1 + Math.pow(10, -g * (R - Rj) / 400))
    const denomE = Math.max(1e-6, g * g * E * (1 - E))
    const dSq = 1 / (Q * Q * denomE)
    const invRD2 = 1 / (RD * RD)
    R = R + (Q / (invRD2 + 1 / dSq)) * g * (s - E)
    RD = Math.max(RD_MIN, Math.sqrt(1 / (invRD2 + 1 / dSq)))
  }

  // Inflación final hasta `now`: si lleva tiempo sin competir, sube la duda.
  if (lastT != null) {
    const idle = Math.max(0, (now - lastT) / 86400000)
    RD = Math.min(RD0, Math.sqrt(RD * RD + C_DAY * C_DAY * idle))
  }
  return { R, RD, contests: contests.length }
}

// ── PASO 2: bonus de calidad (absoluto, 0..1) ───────────────────────────────
function qualityBonus(f) {
  const revN     = clamp(Math.log1p(f.revenue) / Math.log1p(FULL.rev))
  const ticketN  = clamp(Math.log1p(f.avgTicket) / Math.log1p(FULL.ticket))
  const dealsN   = clamp(f.deals / FULL.deals)
  const callVolN = clamp(f.callVol / FULL.callVol)
  // Close rate con shrinkage bayesiano (prior ~25%): evita que 1/1 sea "100%".
  const closeRateShrunk = clamp((f.won + 1) / (f.offers + 3))

  const sub = {
    closeRate:   closeRateShrunk,
    revenue:     revN,
    deals:       dealsN,
    recollected: f.recollected,
    showRate:    f.showRate,
    offerRate:   f.offerRate,
    avgTicket:   ticketN,
    skill:       f.skill,
    objHandling: f.objHandling,
    callVol:     callVolN,
    pipeline:    f.pipeline,
  }
  const quality = clamp(sum(Object.keys(ELO_WEIGHTS).map(k => ELO_WEIGHTS[k] * sub[k])))
  return { quality, sub }
}

// ── Cálculo principal ───────────────────────────────────────────────────────
// closers: [{ userId, sales, calls, leads }]. Devuelve { ratings, byId } con
// ratings ordenados (rank 1 = mejor). Absoluto: cada closer se puntúa solo.
export function computeApexElo(closers, now = Date.now()) {
  const ratings = closers.map((c) => {
    const f = rawFeatures(c, now)

    // PASO 1: replay Glicko sobre las contiendas.
    const { R, RD, contests } = glickoReplay(extractContests(c.calls), now)

    // PASO 2: bonus de calidad absoluto.
    const { quality, sub } = qualityBonus(f)

    // PASO 3: puntos Apex.
    const Rc = R - Z * RD                                   // rating conservador
    const earned = Math.max(0, Rc - RATING_FLOOR)           // solo lo ganado sobre el suelo
    const ranked = contests >= MIN_CONTESTS || f.deals >= 1
    const activity = activityFactor(f.daysSince)
    const confidence = clamp(1 - (RD - RD_MIN) / (RD0 - RD_MIN))
    const form = clamp((Rc - RATING_FLOOR) / (1700 - RATING_FLOOR))
    const inactive = f.daysSince > INACTIVE_DAYS
    const dead = !ranked || f.daysSince >= DEAD_DAYS || !isFinite(f.daysSince)
    const eloRaw = (earned * PT_PER_RATING + quality * QUALITY_MAX) * activity
    const elo = ranked ? Math.round(Math.min(ELO_CAP, eloRaw)) : 0

    return {
      userId: c.userId,
      elo,
      ranked,
      form: Math.round(form * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      activity: Math.round(activity * 100) / 100,
      inactive,
      dead,
      daysSince: isFinite(f.daysSince) ? Math.floor(f.daysSince) : null,
      breakdown: sub,
      revenue: f.revenue,
      cash: f.cash,
      deals: f.deals,
      closeRate: f.closeRate,
      rating: Math.round(Rc),
      rd: Math.round(RD),
    }
  })

  // Orden: vivos primero por Elo desc; "muertos" (sin ranking o parados) al final.
  ratings.sort((a, b) => (a.dead === b.dead ? b.elo - a.elo : a.dead ? 1 : -1))
  ratings.forEach((r, i) => { r.rank = i + 1 })

  const byId = Object.fromEntries(ratings.map(r => [r.userId, r]))
  return { ratings, byId }
}
