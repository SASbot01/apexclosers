// Datos mock — misma forma que la tabla `calls` / el API. Permiten que la UI
// funcione en dev sin backend. Se reemplazan por datos reales (Recall) en cuanto
// el API está disponible (Vercel + RECALL_API_KEY + Supabase).

import { CLIENT_CYCLE } from './clients'

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString() }

const RAW_CALLS = [
  {
    id: 'mock-1',
    bot_id: 'bot_mock_1',
    title: 'Llamada con Julián — Programa High Ticket',
    status: 'done',
    platform: 'google_meet',
    started_at: '2026-06-01T09:30:00.000Z',
    ended_at: '2026-06-01T10:12:00.000Z',
    outcome: 'follow_up',
    deal_closed: false,
    deal_amount: null,
    offer_made: true,
    recording_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    next_step: 'Enviar propuesta y reagendar cierre para el jueves.',
    summary: `## Resumen
Julián dirige una agencia de captación y factura ~25k/mes. Busca sistematizar su closing porque pierde seguimientos. Mostró interés alto pero frenó en el precio.

## Puntos clave
- Dolor principal: se le caen los follow-ups, no tiene visibilidad de su pipeline.
- Objeción: precio — lo comparó con seguir en Excel.
- Presupuesto disponible, decisor único (él).

## Próximo paso
Enviar propuesta con el ROI de un solo cierre recuperado y reagendar el jueves.`,
    feedback: `## Lo que vi
Llevaste bien el descubrimiento y conectaste con su dolor real (los follow-ups).

Puntos fuertes:
- Buen rapport en los primeros 5 minutos.
- Cuantificaste el dolor (cuánto pierde por seguimiento caído).

Para mejorar:
- Te adelantaste al precio antes de anclar valor.
- No usaste un caso de éxito para rebatir la objeción de Excel.

Para la próxima: ancla el valor con una cifra concreta antes de soltar el precio.`,
    transcript: [
      { speaker: 'Closer', text: 'Julián, cuéntame, ¿cómo gestionas hoy tus seguimientos?', startMs: 5000, endMs: 9000 },
      { speaker: 'Julián', text: 'Pues con hojas de Excel, la verdad. Y se me cae gente, no te voy a mentir.', startMs: 9500, endMs: 15000 },
      { speaker: 'Closer', text: 'Entiendo. ¿Cuántas llamadas tienes a la semana más o menos?', startMs: 15500, endMs: 19000 },
      { speaker: 'Julián', text: 'Unas veinte. Pero el seguimiento lo llevo fatal, ahí pierdo dinero seguro.', startMs: 19500, endMs: 25000 },
    ],
  },
  {
    id: 'mock-2',
    bot_id: 'bot_mock_2',
    title: 'Llamada de admisión — María (Mentoría)',
    status: 'done',
    platform: 'zoom',
    started_at: '2026-05-31T16:00:00.000Z',
    ended_at: '2026-05-31T16:38:00.000Z',
    outcome: 'won',
    deal_closed: true,
    deal_amount: 1800,
    offer_made: true,
    recording_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    next_step: 'Enviar contrato y link de pago de la segunda cuota.',
    summary: `## Resumen
María cerró en llamada. Pago inicial confirmado, resto en dos cuotas.

## Puntos clave
- Decisora clara, con urgencia real.
- Cerró tras ver el caso de éxito de otra alumna.

## Próximo paso
Enviar contrato + link de pago de la segunda cuota.`,
    feedback: `## Lo que vi
Cierre limpio. Usaste muy bien la prueba social en el momento justo.

Puntos fuertes:
- Manejo de la urgencia sin presionar.
- Cierre asumido natural.

Para mejorar:
- Podrías haber subido a un paquete superior (había margen).

Para la próxima: tantea el upsell antes de cerrar el básico.`,
    transcript: [
      { speaker: 'Closer', text: 'María, por lo que me cuentas, encajas perfecto. ¿Lo arrancamos hoy?', startMs: 4000, endMs: 9000 },
      { speaker: 'María', text: 'Sí, vamos. ¿Cómo hago el primer pago?', startMs: 9500, endMs: 13000 },
    ],
  },
  {
    id: 'mock-3',
    bot_id: 'bot_mock_3',
    title: 'Llamada con Roger — e-commerce',
    status: 'joining',
    platform: 'google_meet',
    started_at: null,
    ended_at: null,
    outcome: null,
    next_step: null,
    summary: null,
    feedback: null,
    transcript: [],
  },
  {
    id: 'mock-4',
    bot_id: 'bot_mock_4',
    title: 'Llamada con lead (no-show)',
    status: 'done',
    platform: 'google_meet',
    started_at: '2026-05-30T11:00:00.000Z',
    ended_at: '2026-05-30T11:10:00.000Z',
    outcome: 'no_show',
    next_step: 'Reagendar por WhatsApp.',
    summary: null,
    feedback: null,
    transcript: [],
  },
  { id: 'c5',  bot_id: 'bot_c5',  title: 'Llamada con Pablo — SaaS',        status: 'done', platform: 'google_meet', started_at: daysAgo(3),  ended_at: daysAgo(3),  outcome: 'won',       deal_closed: true,  deal_amount: 2400, next_step: 'Enviar onboarding',        summary: null, feedback: null, transcript: [] },
  { id: 'c6',  bot_id: 'bot_c6',  title: 'Admisión — Lucía',                status: 'done', platform: 'zoom',        started_at: daysAgo(6),  ended_at: daysAgo(6),  outcome: 'follow_up', deal_closed: false, deal_amount: null, next_step: 'Reenviar propuesta',      summary: null, feedback: null, transcript: [] },
  { id: 'c7',  bot_id: 'bot_c7',  title: 'Llamada con Marc — agencia',      status: 'done', platform: 'google_meet', started_at: daysAgo(9),  ended_at: daysAgo(9),  outcome: 'lost',      deal_closed: false, deal_amount: null, next_step: null,                     summary: null, feedback: null, transcript: [] },
  { id: 'c8',  bot_id: 'bot_c8',  title: 'Llamada con Ana — coaching',      status: 'done', platform: 'google_meet', started_at: daysAgo(12), ended_at: daysAgo(12), outcome: 'won',       deal_closed: true,  deal_amount: 1500, next_step: 'Cobrar 2ª cuota',         summary: null, feedback: null, transcript: [] },
  { id: 'c9',  bot_id: 'bot_c9',  title: 'Admisión — lead frío',            status: 'done', platform: 'zoom',        started_at: daysAgo(18), ended_at: daysAgo(18), outcome: 'no_show',   deal_closed: false, deal_amount: null, next_step: 'Reagendar',              summary: null, feedback: null, transcript: [] },
  { id: 'c10', bot_id: 'bot_c10', title: 'Llamada con Sergio — ecom',       status: 'done', platform: 'google_meet', started_at: daysAgo(25), ended_at: daysAgo(25), outcome: 'follow_up', deal_closed: false, deal_amount: null, next_step: 'Mandar caso de éxito',    summary: null, feedback: null, transcript: [] },
  { id: 'c11', bot_id: 'bot_c11', title: 'Llamada con Nuria — infoproducto',status: 'done', platform: 'google_meet', started_at: daysAgo(34), ended_at: daysAgo(34), outcome: 'won',       deal_closed: true,  deal_amount: 3000, next_step: 'Firmar contrato',         summary: null, feedback: null, transcript: [] },
  { id: 'c12', bot_id: 'bot_c12', title: 'Llamada con David — mentoría',    status: 'done', platform: 'zoom',        started_at: daysAgo(48), ended_at: daysAgo(48), outcome: 'lost',      deal_closed: false, deal_amount: null, next_step: null,                     summary: null, feedback: null, transcript: [] },
]

// Asocia cada llamada a un cliente (determinista por índice).
export const MOCK_CALLS = RAW_CALLS.map((c, i) => ({ ...c, client_id: c.client_id || CLIENT_CYCLE[i % CLIENT_CYCLE.length] }))

export function mockListShape(c) {
  const { transcript, ...rest } = c
  return { ...rest, has_transcript: Array.isArray(transcript) && transcript.length > 0 }
}
