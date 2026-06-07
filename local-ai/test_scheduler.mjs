// Simula la lógica del scheduler de invitación automática SIN credenciales.
// Prueba: clasificación correcta + ventana rodante + cálculo de join_at.
//   node local-ai/test_scheduler.mjs
import { classifyCall } from '../api/_lib/callClassifier.js'
import { dueForScheduling, computeJoinAt } from '../api/_lib/schedule.js'

const now = Date.UTC(2026, 5, 6, 12, 0, 0)   // ancla fija (no Date.now, determinista)
const iso = (minFromNow) => new Date(now + minFromNow * 60000).toISOString()

// Reproduce shapeEvent() mínimamente para el test.
const shape = (title, attendees, startMin, meetingUrl = 'https://meet.google.com/abc-defg-hij') => ({
  calendar_event_id: title.replace(/\s/g, '-'),
  title, start: iso(startMin), meeting_url: meetingUrl,
  classification: classifyCall({ title, attendees, closerEmail: 'closer@apex.io' }),
})

const closer = { email: 'closer@apex.io', name: 'Closer' }
const lead = { email: 'marcos@gmail.com', name: 'Marcos' }

const cases = [
  // [descripción, evento, esperado dueForScheduling]
  ['Venta externa en 5 min',            shape('Llamada con Marcos', [closer, lead], 5),  true],
  ['Venta externa en 10 min',           shape('Discovery demo', [closer, lead], 10),     true],
  ['Venta externa en 40 min (lejos)',   shape('Llamada con Ana', [closer, lead], 40),    false],
  ['Venta que empezó hace 10 min',      shape('Llamada con Luis', [closer, lead], -10),  true],
  ['Venta que empezó hace 45 min',      shape('Llamada con Eva', [closer, lead], -45),   false],
  ['Daily interna en 5 min',            shape('Daily standup', [closer], 5),             false],
  ['Sin meeting_url',                   { ...shape('Llamada con X', [closer, lead], 5), meeting_url: '' }, false],
  ['Bloqueo personal',                  shape('Focus deep work', [closer], 5),           false],
]

let pass = 0, fail = 0
for (const [desc, ev, expected] of cases) {
  const got = dueForScheduling(ev, now)
  const ok = got === expected
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${desc}  → due=${got} (esperado ${expected})  [${ev.classification.label}]`)
}

// join_at: en 5 min → ISO 1 min antes; ya empezada → undefined (entra ya).
const j1 = computeJoinAt(now + 5 * 60000, now)
const j2 = computeJoinAt(now - 10 * 60000, now)
console.log(`\njoin_at futuro (5min): ${j1}  ${j1 === iso(4) ? 'PASS' : 'FAIL'}`)
console.log(`join_at pasado (entra ya): ${j2}  ${j2 === undefined ? 'PASS' : 'FAIL'}`)
if (j1 !== iso(4)) fail++; else pass++
if (j2 !== undefined) fail++; else pass++

console.log(`\n== ${pass} PASS / ${fail} FAIL ==`)
process.exit(fail ? 1 : 0)
