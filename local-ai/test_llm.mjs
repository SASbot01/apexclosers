// Prueba del LLM local replicando las 2 llamadas de finalize.
import { localChat } from '../api/_lib/localLLM.js'

const transcript = `Closer: Hola Marcos, gracias por sacar el hueco. ¿Cómo estás?
Lead: Bien, con ganas de que me cuentes. Llevo tiempo intentando montar mi agencia pero no termino de despegar.
Closer: Te entiendo. ¿Qué es lo que más te está frenando ahora mismo?
Lead: Sobre todo conseguir clientes de forma constante. Tengo dos pero llegaron de rebote.
Closer: Vale. Nuestro programa es de 12 semanas, acompañamiento 1 a 1, y cuesta 4.000 euros. ¿Con qué presupuesto cuentas para invertir en esto?
Lead: 4.000 es bastante ahora mismo. Podría hacer una entrada y el resto en dos meses.
Closer: Perfecto, lo podemos fraccionar. ¿Eres tú quien toma la decisión o lo consultas con alguien?
Lead: Decido yo. Me lo quiero pensar este fin de semana y te digo el lunes.
Closer: Genial, te dejo reservada la plaza y hablamos el lunes a las 10.`

const SUMMARY_SYSTEM = `Eres un asistente de ventas senior. Acabas de analizar una call de tu closer. Escribe en español, primera persona, voz cálida y directa.

Genera dos bloques separados por una línea con tres guiones (---):

BLOQUE 1 — RESUMEN (markdown):
- Encabezado "## Resumen"
- 3-4 frases con lo esencial
- Sección "## Puntos clave" con bullets
- Sección "## Próximo paso" con la acción concreta

BLOQUE 2 — FEEDBACK (markdown):
- Encabezado "## Lo que vi"
- 2-3 puntos fuertes del closer
- 2-3 cosas para mejorar
- 1 frase concreta para la próxima call

Sin emojis. Sin exclamaciones. Tono de socio con 15 años de oficio.`

const OUTCOME_SYSTEM = `Eres un analista de ventas. Lee la transcripción y devuelve SOLO un JSON válido (sin markdown) con esta forma:
{"outcome":"won"|"lost"|"follow_up"|"no_show"|"unknown","offer_made":boolean,"offer_amount":number|null,"deposit_collected":boolean,"deal_closed":boolean,"deal_amount":number|null,"next_step":"string corto en español","lead_summary":{"objetivos":"","bloqueos":"","compromiso":"","cualificacion":"","financiera":"","prioridad":"","decision":""}}
Importes en EUR como números. Si no hay info clara, null/false.`

const t0 = Date.now()
console.log('== RESUMEN + FEEDBACK ==')
const sf = await localChat({ system: SUMMARY_SYSTEM, user: `Transcripción:\n\n${transcript}`, maxTokens: 2000 })
console.log(sf)
console.log(`\n(t=${((Date.now()-t0)/1000).toFixed(1)}s)\n`)

const t1 = Date.now()
console.log('== OUTCOME (JSON) ==')
const oc = await localChat({ system: OUTCOME_SYSTEM, user: transcript, maxTokens: 800, json: true })
console.log(oc)
const m = oc.match(/\{[\s\S]*\}/)
console.log('\nJSON.parse OK?', m ? !!JSON.parse(m[0]) : false)
console.log(`(t=${((Date.now()-t1)/1000).toFixed(1)}s)`)
