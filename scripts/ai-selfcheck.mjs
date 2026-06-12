// ai-selfcheck · consistencia del cerebro de IA (interno, no visual).
//
//   node scripts/ai-selfcheck.mjs [userId]
//
// Por usuario (o todos si no se pasa userId) comprueba:
//   1. Llamadas 'done' sin skills (sin puntuar) y sin filas en call_chunks (sin
//      indexar en el RAG del coach).
//   2. Llamadas con deal_closed=true sin venta asociada en `sales` (posible
//      venta perdida): primero por sales.call_id, si no por owner_id+call_id null
//      el mismo día.
//   3. Cobertura de memoria: nº de filas en `memories` (tabla de 0020; si aún no
//      existe la migración, lo dice y sigue).
// Defensivo: cualquier tabla/columna ausente se reporta y NO rompe el script.
import 'dotenv/config'

// Node 20 no trae WebSocket global y @supabase/supabase-js (realtime) lo exige al
// construir el cliente fuera del servidor. Shim con `ws` (ya es dependencia) para
// que las queries REST funcionen también en este script standalone.
import ws from 'ws'
if (!globalThis.WebSocket) globalThis.WebSocket = ws

// Import dinámico DESPUÉS de cargar .env (supabase.js lee process.env al cargar).
const { supabase, supabaseReady } = await import('../api/_lib/supabase.js')

const ARG_USER = process.argv[2] || null
const short = (id) => String(id || '').slice(0, 8)
const sameDay = (a, b) => {
  if (!a || !b) return false
  const da = new Date(a), db = new Date(b)
  return da.getUTCFullYear() === db.getUTCFullYear() && da.getUTCMonth() === db.getUTCMonth() && da.getUTCDate() === db.getUTCDate()
}

// Query defensiva: devuelve { rows, error } sin lanzar nunca.
async function q(label, fn) {
  try {
    const { data, error } = await fn()
    if (error) return { rows: null, error: `${label}: ${error.message || error.code || 'error'}` }
    return { rows: data || [], error: null }
  } catch (e) {
    return { rows: null, error: `${label}: ${e?.message || e}` }
  }
}

async function listUsers() {
  if (ARG_USER) return [{ id: ARG_USER, email: null }]
  const u = await q('users', () => supabase.from('users').select('id, email').order('created_at', { ascending: true }))
  if (u.rows && u.rows.length) return u.rows
  if (u.error) console.warn(`  (aviso) no pude leer users — ${u.error}; derivo usuarios desde calls`)
  // Fallback: usuarios distintos con llamadas.
  const c = await q('calls(users)', () => supabase.from('calls').select('user_id').limit(2000))
  if (!c.rows) { console.warn(`  (aviso) ${c.error}`); return [] }
  const seen = new Set()
  return c.rows.filter(r => r.user_id && !seen.has(r.user_id) && seen.add(r.user_id)).map(r => ({ id: r.user_id, email: null }))
}

async function checkUser(user) {
  const uid = user.id
  const issues = []
  console.log(`\n── Usuario ${short(uid)}${user.email ? ` (${user.email})` : ''} ${'─'.repeat(30)}`)

  // 1 · llamadas done sin skills / sin RAG
  const calls = await q('calls', () => supabase.from('calls')
    .select('id, title, status, skills, deal_closed, deal_amount, calendar_event_id, started_at')
    .eq('user_id', uid).eq('status', 'done'))
  let done = []
  if (!calls.rows) {
    console.warn(`  (aviso) ${calls.error}`)
  } else {
    done = calls.rows
    const noSkills = done.filter(c => c.skills == null)
    let noChunks = []
    const chunks = await q('call_chunks', () => supabase.from('call_chunks').select('call_id').eq('user_id', uid))
    if (!chunks.rows) {
      console.warn(`  (aviso) ${chunks.error}`)
    } else {
      const indexed = new Set(chunks.rows.map(r => r.call_id).filter(Boolean))
      noChunks = done.filter(c => !indexed.has(c.id))
    }
    console.log(`  Llamadas done: ${done.length} · sin skills: ${noSkills.length} · sin indexar en RAG: ${noChunks.length}`)
    if (noSkills.length) {
      issues.push(`${noSkills.length} llamada(s) done sin puntuar (skills)`)
      console.log(`    sin skills: ${noSkills.slice(0, 10).map(c => short(c.id)).join(', ')}${noSkills.length > 10 ? ` … (+${noSkills.length - 10})` : ''}`)
    }
    if (noChunks.length) {
      issues.push(`${noChunks.length} llamada(s) done sin indexar en call_chunks`)
      console.log(`    sin RAG: ${noChunks.slice(0, 10).map(c => short(c.id)).join(', ')}${noChunks.length > 10 ? ` … (+${noChunks.length - 10})` : ''}`)
    }
  }

  // 2 · deal_closed sin venta en sales
  const closed = done.filter(c => c.deal_closed === true)
  if (closed.length) {
    const sales = await q('sales', () => supabase.from('sales').select('id, call_id, date, revenue').eq('owner_id', uid))
    if (!sales.rows) {
      console.warn(`  (aviso) ${sales.error}`)
    } else {
      const byCall = new Set(sales.rows.map(s => s.call_id).filter(Boolean))
      const loose = sales.rows.filter(s => !s.call_id)
      const missing = closed.filter(c => !byCall.has(c.id) && !loose.some(s => sameDay(s.date, c.started_at)))
      console.log(`  Cierres detectados (deal_closed): ${closed.length} · sin venta en sales: ${missing.length}`)
      if (missing.length) {
        issues.push(`${missing.length} cierre(s) sin venta registrada (posible venta perdida)`)
        for (const c of missing.slice(0, 10)) {
          console.log(`    call ${short(c.id)} "${(c.title || 'sin título').slice(0, 40)}"${c.deal_amount != null ? ` ~${c.deal_amount}` : ''}`)
        }
      }
    }
  } else {
    console.log(`  Cierres detectados (deal_closed): 0`)
  }

  // 3 · cobertura de memoria (0020)
  const mem = await q('memories', () => supabase.from('memories').select('id', { count: 'exact', head: false }).eq('user_id', uid))
  if (!mem.rows) {
    console.log(`  Memoria: tabla 'memories' no disponible (¿falta migración 0020?) — ${mem.error}`)
  } else {
    console.log(`  Memoria: ${mem.rows.length} hecho(s) en memories`)
    if (done.length >= 3 && mem.rows.length === 0) issues.push('usuario con actividad pero 0 memorias (el cerebro no está aprendiendo)')
  }

  if (issues.length) {
    console.log(`  → ${issues.length} inconsistencia(s):`)
    for (const i of issues) console.log(`     · ${i}`)
  } else {
    console.log('  → OK')
  }
  return issues.length
}

async function main() {
  console.log(`ai-selfcheck · ${new Date().toISOString()}${ARG_USER ? ` · usuario ${ARG_USER}` : ' · todos los usuarios'}`)
  if (!supabaseReady()) {
    console.error('Supabase no configurado (SUPABASE_URL / SUPABASE_SERVICE_KEY en .env). Nada que comprobar.')
    process.exit(1)
  }
  const users = await listUsers()
  if (!users.length) { console.log('Sin usuarios que comprobar.'); return }
  let total = 0
  for (const u of users) {
    try { total += await checkUser(u) } catch (e) { console.warn(`  (aviso) fallo comprobando ${short(u.id)}: ${e?.message || e}`) }
  }
  console.log(`\n${'═'.repeat(50)}`)
  console.log(total === 0
    ? `RESUMEN: OK — ${users.length} usuario(s), sin inconsistencias.`
    : `RESUMEN: ${total} inconsistencia(s) en ${users.length} usuario(s). Revisa arriba.`)
}

main().catch((e) => { console.error('ai-selfcheck fallo inesperado:', e?.message || e); process.exit(1) })
