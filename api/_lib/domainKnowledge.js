// Conocimiento de dominio del cerebro: definiciones canónicas de métricas, CRM y
// workshop. Se inyecta en los prompts para que el LLM entienda y USE bien los
// conceptos (no que se los invente). Debe cuadrar con api/metrics.js (computeUserMetrics).

export const METRICS_GLOSSARY = `DEFINICIONES DE MÉTRICAS (úsalas con rigor, no las confundas):
- Llamadas: nº total de llamadas en la ventana. "Realizadas" (held) = llamadas efectivas (no no-show). "No-show" = el cliente no se presentó.
- Show rate = realizadas / (realizadas + no-shows). Mide cuántas agendadas se presentan.
- Oferta (offer): en la llamada se presentó precio/propuesta. "Tasa de oferta" = ofertas / realizadas.
- Cierre (close/won): el cliente se comprometió a comprar/pagar de verdad. "Depósito" = pagó señal/primera cuota pero no el total.
- Close rate = cierres / OFERTAS (NO sobre llamadas). Es la conversión de los que recibieron oferta. Si te preguntan close rate, es sobre ofertas.
- Revenue = suma facturada de ventas VERIFICADAS. Cash collected (cash cerrado) = dinero realmente cobrado de ventas verificadas (puede ser < revenue si hay cuotas).
- Recollected = cash collected / revenue (qué fracción del facturado ya está cobrada).
- Ticket medio = revenue / nº de ventas verificadas.
- Pipeline (valor) = suma del valor de los leads ABIERTOS (stage distinto de cerrado/cerrada).
Regla de oro: si un dato no está en los DATOS DEL USUARIO, dilo; nunca inventes una cifra.`

export const CRM_GLOSSARY = `CRM / EMBUDO (leads):
- Un lead es un prospecto en el embudo. Tiene una etapa (stage): típicamente "agendada" → en proceso → "cerrada"/"cerrado" (ganado) o "perdido". Lead ABIERTO = stage que no es cerrado/cerrada.
- "Caliente" = lead etiquetado de alta intención. "Sin tocar +7d" (stale) = lead abierto sin actividad en más de 7 días. "Seguimiento vencido" (due) = su próximo paso (next_at) ya pasó.
- "Proyecto" de un lead = la cuenta/cliente (empresa) al que pertenece (leads.project = client_key del equipo). Sirve para que una empresa vea su CRM filtrado por proyecto y closer.
- Prioriza: leads calientes y seguimientos vencidos primero; recupera los stale antes de que se enfríen.`

export const WORKSHOP_GLOSSARY = `WORKSHOP / HABILIDADES:
- Se evalúan 6 fases del cierre: apertura (control y agenda), descubrimiento (indagar dolor), propuesta (anclar valor antes que precio), objeciones (rebatir sin caerse), cierre (pedir el sí), seguimiento (próximo paso agendado).
- El "hexagrama" se deriva del embudo REAL: apertura≈show rate, descubrimiento≈tasa de oferta, propuesta≈compromiso (cierres+depósitos/ofertas), objeciones≈cierre entre llamadas con objeción, cierre≈close rate, seguimiento≈salud del pipeline. No son notas inventadas.
- "Cuello de botella" = la fase más débil del hexagrama; mejorarla es lo que más sube el revenue.
- Estilo: talk_ratio (fracción que habla el closer; ideal escuchar más en descubrimiento), wpm (ritmo), nº de preguntas, tono (seguridad/empatía/dudas).
- Apex Elo: rating compuesto del closer que ARRANCA EN 0 y se gana con actividad y resultados (no es un 1500 de regalo). Sin actividad mínima, "Sin actividad".`

// Devuelve el bloque de conocimiento pedido. Por defecto solo métricas.
export function knowledgeBlock({ metrics = true, crm = false, workshop = false } = {}) {
  const parts = []
  if (metrics) parts.push(METRICS_GLOSSARY)
  if (crm) parts.push(CRM_GLOSSARY)
  if (workshop) parts.push(WORKSHOP_GLOSSARY)
  if (!parts.length) return ''
  return `\n\n=== CÓMO FUNCIONA APEX (conocimiento de dominio) ===\n${parts.join('\n\n')}\n=== FIN CONOCIMIENTO ===`
}
