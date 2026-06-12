// Test del Apex Elo (Glicko). Sin deps externas: node scripts/elo-test.mjs
import { computeApexElo } from '../api/_lib/elo.js'

const FIXED_NOW = Date.parse('2026-06-13T00:00:00Z')
const DAY = 86400000

let failures = 0
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS  ${name}`)
  } else {
    failures++
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// Helper: llamada con oferta. won=true → cerrada; daysAgo controla started_at.
function call({ won = false, daysAgo = 0, objections = [], outcome = null } = {}) {
  return {
    status: 'done',
    outcome: outcome ?? (won ? 'won' : 'lost'),
    state: won ? 'ganada' : 'perdido',
    offer_made: true,
    deal_closed: won,
    skills: null,
    objections,
    started_at: new Date(FIXED_NOW - daysAgo * DAY).toISOString(),
  }
}

function closer(userId, calls, sales = [], leads = []) {
  return { userId, calls, sales, leads }
}

// Genera n ofertas con `wonCount` ganadas, fechas recientes (i días atrás).
function offers(n, wonCount, { objections = [], offsetDays = 0 } = {}) {
  return Array.from({ length: n }, (_, i) =>
    call({ won: i < wonCount, daysAgo: offsetDays + i, objections }))
}

// ── 1. Closer sin datos → elo 0, no ranked ──────────────────────────────────
{
  const { byId } = computeApexElo([closer('empty', [], [], [])], FIXED_NOW)
  const r = byId.empty
  check('1. sin datos: elo === 0', r.elo === 0, `elo=${r.elo}`)
  check('1. sin datos: ranked === false', r.ranked === false, `ranked=${r.ranked}`)
}

// ── 2. Closer con 8 ofertas, 6 cerradas recientes → elo > 0, ranked ─────────
{
  const { byId } = computeApexElo([closer('a', offers(8, 6))], FIXED_NOW)
  const r = byId.a
  check('2. 6/8 cerradas: elo > 0', r.elo > 0, `elo=${r.elo}`)
  check('2. 6/8 cerradas: ranked === true', r.ranked === true, `ranked=${r.ranked}`)
}

// ── 3. Determinismo: mismo input + mismo now → mismo elo ────────────────────
{
  const input = () => [closer('a', offers(8, 6), [{ revenue: 5000, cash_collected: 5000, date: new Date(FIXED_NOW - 2 * DAY).toISOString() }])]
  const r1 = computeApexElo(input(), FIXED_NOW).byId.a
  const r2 = computeApexElo(input(), FIXED_NOW).byId.a
  check('3. determinismo: mismo elo', r1.elo === r2.elo, `${r1.elo} vs ${r2.elo}`)
  check('3. determinismo: mismo rating/rd', r1.rating === r2.rating && r1.rd === r2.rd,
    `rating ${r1.rating}/${r2.rating}, rd ${r1.rd}/${r2.rd}`)
}

// ── 4. Monotonía: 8/8 cerradas > 2/8 cerradas (mismas fechas/volumen) ───────
{
  const { byId } = computeApexElo([
    closer('top', offers(8, 8)),
    closer('low', offers(8, 2)),
  ], FIXED_NOW)
  check('4. monotonía victorias: 8/8 > 2/8', byId.top.elo > byId.low.elo,
    `top=${byId.top.elo}, low=${byId.low.elo}`)
}

// ── 5. Dificultad: mismas victorias, con objeciones >= sin objeciones ───────
{
  const { byId } = computeApexElo([
    closer('hard', offers(8, 6, { objections: ['precio', 'tiempo', 'pareja'] })),
    closer('easy', offers(8, 6)),
  ], FIXED_NOW)
  check('5. dificultad: con objeciones >= sin objeciones', byId.hard.elo >= byId.easy.elo,
    `hard=${byId.hard.elo}, easy=${byId.easy.elo}`)
}

// ── 6. Inactividad: rendimiento idéntico, activo > parado 60 días ───────────
{
  const { byId } = computeApexElo([
    closer('fresh', offers(8, 6, { offsetDays: 1 })),
    closer('stale', offers(8, 6, { offsetDays: 60 })),
  ], FIXED_NOW)
  check('6. inactividad: activo > parado 60d', byId.fresh.elo > byId.stale.elo,
    `fresh=${byId.fresh.elo}, stale=${byId.stale.elo}`)
}

console.log(failures ? `\n${failures} test(s) FAILED` : '\nAll tests passed')
process.exit(failures ? 1 : 0)
