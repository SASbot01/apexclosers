# FLOW — flujo de uso del software

> Pensado para **closers poco técnicos**: pocas pantallas, un camino claro, mínima
> fricción. Regla: cada pantalla responde a "¿qué hago ahora?" sin pensar.

## Navegación (deliberadamente simple)

**5 destinos** en la barra + **engranaje** (Ajustes) arriba a la derecha:

| Tab | Para qué |
|---|---|
| **Hoy** | Su día: objetivos (con % y proyección), próximas llamadas, seguimientos. |
| **Clientes** | Cada cliente = un proyecto con TODO lo suyo (llamadas, leads, conversación, resumen/feedback). |
| **Llamadas** | Sus llamadas. Sub-vistas: **Llamadas** (historial + vídeo/transcripción) · **Guion** (script + iniciar llamada). |
| **Pipeline** | Tablero de leads por etapa (con su seguimiento dentro). |
| **Métricas** | Sub-vistas: **Ventas** (revenue/cash + tabla) · **Embudo** (Agendadas→Realizadas→Ofertas→Depósitos→Cierres + %). |
| ⚙️ **Ajustes** | Cuenta, calendario, uso/tokens. Fuera de la barra (icono). |

Las sub-vistas se cambian con un **control segmentado** (no más tabs arriba). El **Orbe**
flota en todas las pantallas como ayuda.

## El bucle del closer (el camino feliz)

```
1. ENTRA  →  login con Google  →  aterriza en HOY (su día de un vistazo)
2. PREPARA →  Llamadas › Guion  (elige cliente)  →  "▶ Iniciar llamada"
3. DURANTE →  Teleprompter: fases (qué decir) + consejos + objeciones + tonalidades + timer
4. CIERRA  →  "Terminar" → registra RESULTADO:
              Cerrada · Depósito · Seguimiento · No cualifica · Perdida · No-show  + notas + lead
5. QUEDA   →  el resultado se guarda en la ficha del CLIENTE  →  alimenta MÉTRICAS
6. REVISA  →  HOY (objetivos) · MÉTRICAS (Embudo/Ventas) · CLIENTE (resumen/feedback)
```

El **Orbe** acompaña en cada paso (resúmenes, feedback, dudas) y sus conversaciones se
**guardan por cliente** ("aprende" de cada uno).

## Qué es automático vs manual (hoy)

- **Manual ahora (a propósito):** registrar el resultado de la llamada y mover el lead en el
  pipeline. El closer lo hace en 1 clic al terminar.
- **Automático cuando se active (fase posterior, requiere prueba):** la **transcripción** de la
  llamada (Recall) y la **actualización del pipeline** + resumen/feedback con IA. La pieza ya
  está preparada (`call_results.call_id`, Orbe, tabla `calls`).

## Principios anti-fricción

- **Una acción primaria por pantalla** (en Guion: "Iniciar llamada"; en vivo: "Siguiente").
- **Nada de jerga.** Lenguaje de closer (Agendada, Realizada, Oferta, Depósito, Cierre).
- **Filtros, no menús anidados.** Periodo y Cliente como filtros simples; sub-vistas con segmented.
- **El cliente es el eje.** Todo cuelga del cliente → el closer piensa "¿qué hago con este cliente?".
- **Registrar es 1 clic.** El resultado de la llamada nunca debe dar pereza.

## Mapa de rutas

```
/                  Hoy
/clientes  /clientes/:id        Clientes + ficha (conversación, resumen, feedback)
/llamadas  /llamadas/:id        Historial + detalle (vídeo, transcripción, export)
/scripts   /scripts/live/:id    Guion (editar) + llamada en vivo (teleprompter)
/pipeline                       Tablero de leads
/finanzas  /reports             Métricas: Ventas · Embudo
/ajustes                        (engranaje)
```
