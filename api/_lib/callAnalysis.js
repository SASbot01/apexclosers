// Análisis de la llamada — extracción comercial precisa (para la tabla de ventas)
// + contexto de aprendizaje (para que el feedback mejore con el historial).
//
// Lo usa api/recall.js#finalize. Los prompts se comparten entre la ruta local
// (Ollama) y la de Anthropic; la normalización es defensiva con lo que devuelva
// el modelo (sobre todo los 7B locales).

import { supabase } from './supabase.js'

const KNOWN_METHODS = ['Stripe', 'Transferencia', 'Tarjeta', 'PayPal', 'Bizum', 'Crypto', 'Financiación', 'Efectivo']

// ── Extracción comercial ─────────────────────────────────────────────────
export const EXTRACTION_SYSTEM = `Eres un analista de ventas senior. Lees la transcripción de una llamada (closer + cliente) y extraes los HECHOS COMERCIALES con precisión quirúrgica. Distingue con cuidado:

- HABLAR de una venta/precio NO es CERRARLA. Marca "deal_closed": true SOLO si el cliente se compromete de verdad a comprar/pagar (dice que sí al cierre, da datos de pago, paga ya, o acuerda fecha/forma de pago concreta). Si solo se exploró o quedó en pensárselo → deal_closed false y outcome "follow_up".
- PRECIO OFERTADO (lo que pidió el closer) vs PRECIO CERRADO (lo que el cliente aceptó pagar). Pueden diferir si hubo negociación/descuento.
- COBRADO AHORA (lo que se paga ya: señal, depósito o total) vs el total del trato.
- PLATAFORMA/MÉTODO de pago si se menciona (Stripe, transferencia, tarjeta, PayPal, Bizum, crypto, financiación, efectivo).
- TIPO de pago: "Pago único" vs "Cuotas" (plan de pagos); si dicen el nº de cuotas, ponlo.

Devuelve SOLO un JSON válido (sin markdown, sin texto fuera del JSON) con EXACTAMENTE esta forma:
{
 "outcome":"won"|"lost"|"follow_up"|"no_show"|"unknown",
 "sale_discussed":boolean,
 "offer_made":boolean,
 "deal_closed":boolean,
 "deposit_collected":boolean,
 "product":string|null,
 "currency":"EUR"|"USD"|string,
 "offer_amount":number|null,
 "deal_amount":number|null,
 "cash_collected":number|null,
 "payment_method":string|null,
 "payment_type":"Pago único"|"Cuotas"|null,
 "installments":number|null,
 "objections":[string],
 "evidence":string|null,
 "next_step":string,
 "lead_summary":{"objetivos":"","bloqueos":"","compromiso":"","cualificacion":"","financiera":"","prioridad":"","decision":""}
}
Reglas: importes como NÚMEROS sin símbolo, en la divisa de "currency" (default EUR). Si un dato no está claro usa null / false / []. "evidence" = la frase textual donde se cierra o se fija el precio (máx 200 caracteres). "objections" = objeciones REALES que salieron, en minúscula y en una palabra clave cada una (precio, tiempo, pareja, socio, confianza, miedo, autoridad, urgencia...). "lead_summary": cada campo UNA frase corta en español (objetivos, bloqueos, compromiso, cualificacion, financiera, prioridad, decision).`

const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const toBool = (v) => v === true || v === 'true' || v === 1
const titleMethod = (s) => {
  if (!s) return null
  const t = String(s).trim()
  const hit = KNOWN_METHODS.find(m => m.toLowerCase() === t.toLowerCase())
  if (hit) return hit
  const low = t.toLowerCase()
  if (/transfer/.test(low)) return 'Transferencia'
  if (/stripe/.test(low)) return 'Stripe'
  if (/paypal/.test(low)) return 'PayPal'
  if (/bizum/.test(low)) return 'Bizum'
  if (/crypto|cripto|bitcoin|usdt/.test(low)) return 'Crypto'
  if (/financ/.test(low)) return 'Financiación'
  if (/efectivo|cash|metálico/.test(low)) return 'Efectivo'
  if (/tarjeta|card|visa|master/.test(low)) return 'Tarjeta'
  return t.slice(0, 40)
}

// Normaliza la salida del modelo al shape exacto que usamos (defensivo).
export function normalizeExtraction(raw) {
  if (!raw || typeof raw !== 'object') return null
  const deal_closed = toBool(raw.deal_closed)
  const deposit = toBool(raw.deposit_collected)
  const installments = toNum(raw.installments)
  let payment_type = raw.payment_type
  if (payment_type !== 'Pago único' && payment_type !== 'Cuotas') {
    payment_type = (installments && installments > 1) || deposit ? 'Cuotas' : (deal_closed ? 'Pago único' : null)
  }
  const objections = Array.isArray(raw.objections)
    ? [...new Set(raw.objections.map(o => String(o).toLowerCase().trim()).filter(Boolean))].slice(0, 8)
    : []
  const ls = raw.lead_summary && typeof raw.lead_summary === 'object' ? raw.lead_summary : null
  return {
    outcome: ['won', 'lost', 'follow_up', 'no_show', 'unknown'].includes(raw.outcome) ? raw.outcome : 'unknown',
    sale_discussed: toBool(raw.sale_discussed) || toBool(raw.offer_made) || deal_closed,
    offer_made: toBool(raw.offer_made),
    deal_closed,
    deposit_collected: deposit,
    product: raw.product ? String(raw.product).slice(0, 120) : null,
    currency: raw.currency ? String(raw.currency).slice(0, 8).toUpperCase() : 'EUR',
    offer_amount: toNum(raw.offer_amount),
    deal_amount: toNum(raw.deal_amount),
    cash_collected: toNum(raw.cash_collected),
    payment_method: titleMethod(raw.payment_method),
    payment_type,
    installments,
    objections,
    evidence: raw.evidence ? String(raw.evidence).slice(0, 200) : null,
    next_step: raw.next_step ? String(raw.next_step).slice(0, 300) : null,
    lead_summary: ls,
  }
}

// Cobro de la venta para la tabla: usa cash_collected si lo dio; si no, el total
// (pago único) o, en cuotas, lo que se sepa (editable luego en la tabla).
export function saleCashFor(o) {
  if (o.cash_collected != null) return o.cash_collected
  if (o.payment_type === 'Cuotas') return o.deposit_collected ? (o.offer_amount ?? 0) : 0
  return o.deal_amount ?? 0
}

// Línea compacta de hechos para anclar el feedback (que no se los invente).
export function factsLine(o) {
  if (!o) return ''
  const eur = (v) => v == null ? '—' : `${v} ${o.currency || 'EUR'}`
  const parts = [
    `outcome=${o.outcome}`,
    `venta_hablada=${o.sale_discussed ? 'sí' : 'no'}`,
    `cerrada=${o.deal_closed ? 'sí' : 'no'}`,
    `precio_ofertado=${eur(o.offer_amount)}`,
    `precio_cerrado=${eur(o.deal_amount)}`,
    `cobrado_ahora=${eur(o.cash_collected)}`,
    o.payment_method ? `método=${o.payment_method}` : null,
    o.payment_type ? `tipo=${o.payment_type}${o.installments ? ` x${o.installments}` : ''}` : null,
    o.objections?.length ? `objeciones=${o.objections.join(', ')}` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

// ── Resumen + Feedback (con aprendizaje del historial) ────────────────────
const BASE_SUMMARY = `Eres un asistente de ventas senior. Acabas de analizar una call de tu closer. Escribe en español, primera persona, voz cálida y directa.

Genera dos bloques separados por una línea con tres guiones (---):

BLOQUE 1 — RESUMEN (markdown):
- Encabezado "## Resumen"
- 3-4 frases con lo esencial (incluye si hubo venta, a qué precio y cómo se paga, si aplica)
- Sección "## Puntos clave" con bullets
- Sección "## Próximo paso" con la acción concreta

BLOQUE 2 — FEEDBACK (markdown):
- Encabezado "## Lo que vi"
- 2-3 puntos fuertes del closer
- 2-3 cosas para mejorar (sé específico: cita el momento)
- 1 frase concreta para la próxima call

Sin emojis. Sin exclamaciones. Tono de socio con 15 años de oficio.`

export function summarySystem(coaching) {
  if (!coaching) return BASE_SUMMARY
  return `${BASE_SUMMARY}

CONTEXTO DEL CLOSER (sus llamadas anteriores). Úsalo para dar feedback que MEJORA con el tiempo: si un patrón se repite (p. ej. se cae siempre en la misma objeción), dilo explícitamente y dale UNA acción concreta para romperlo; reconoce también lo que ya hace bien de forma consistente.
${coaching}`
}

// Contexto de aprendizaje: mira las últimas llamadas del closer y resume su
// patrón (resultados, close rate, objeciones recurrentes). Devuelve null si aún
// no hay historial suficiente.
export async function buildCoachingContext(userId) {
  if (!userId) return null
  try {
    const { data } = await supabase.from('calls')
      .select('outcome, objections, deal_closed, offer_made, started_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(25)
    const C = (data || []).filter(c => c.outcome && c.outcome !== 'unknown')
    if (C.length < 2) return null
    const counts = {}
    for (const c of C) counts[c.outcome] = (counts[c.outcome] || 0) + 1
    const won = C.filter(c => c.outcome === 'won' || c.deal_closed).length
    const offers = C.filter(c => c.offer_made).length
    const closeRate = offers ? Math.round((won / offers) * 100) : null
    const obj = {}
    for (const c of C) for (const o of (Array.isArray(c.objections) ? c.objections : [])) {
      const k = String(o).toLowerCase().trim(); if (k) obj[k] = (obj[k] || 0) + 1
    }
    const topObj = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} (${v})`)
    const lines = [`- Últimas ${C.length} llamadas con resultado: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}.`]
    if (closeRate != null) lines.push(`- Close rate reciente (de ofertas): ${closeRate}%.`)
    if (topObj.length) lines.push(`- Objeciones recurrentes: ${topObj.join(', ')}.`)
    return lines.join('\n')
  } catch (e) {
    console.error('[callAnalysis] coaching context failed', e.message)
    return null
  }
}
