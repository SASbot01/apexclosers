# 03 — CONTEXT (Contexto)

> Qué sabe el Orbe *ahora mismo* para responder bien. El contexto es el ensamblaje que
> entra al modelo en cada turno: alma + memoria + datos vivos + conversación + turno,
> dentro de un presupuesto de tokens y con caching.

## 1. Principio

El modelo solo es tan bueno como lo que le metes en la ventana. **Context engineering** =
poner lo justo y relevante, ni más (ruido + coste) ni menos (alucina). Para el Orbe esto
significa combinar tres fuentes: **quién es** (alma), **qué sabe de ti** (memoria) y **qué
está pasando** (datos vivos del producto).

## 2. La pila de contexto (orden = de estable a volátil)

```
┌─ CACHE ESTABLE (prompt caching) ──────────────────────────────┐
│ 1. Alma base: identidad, valores, voz, principios, prohibic.  │  igual para todos
│ 2. Capacidades / definiciones de tools                        │
├─ CACHE POR USUARIO ───────────────────────────────────────────┤
│ 3. Soul card de user_id (la relación)                         │  cambia rara vez
│ 4. User model: perfil + negocio + estilo (resumen vivo)       │  cambia poco
├─ DINÁMICO (no cacheado, cada turno) ──────────────────────────┤
│ 5. Memoria recuperada (top-K relevante al turno)              │
│ 6. Datos vivos del producto (llamadas hoy, follow-ups due…)   │  GROUNDING
│ 7. Historial de conversación (ventana / resumido)             │
│ 8. Turno actual del usuario / evento disparador               │
└───────────────────────────────────────────────────────────────┘
```

- 1–2 son constantes → se cachean una vez.
- 3–4 son estables por usuario → se cachean por `user_id`.
- 5–8 cambian cada turno → es lo único que se recomputa. Maximiza cache hit, minimiza coste
  (clave para el COGS del token LLM en el modelo de negocio).

## 3. Datos vivos (grounding)

Lo que distingue al Orbe de un chatbot genérico: **siempre razona sobre los datos reales del
usuario**, no sobre vaguedades. Antes de responder, ensambla lo pertinente:
- llamadas de hoy / esta semana (estado, hora, lead);
- follow-ups vencidos o próximos;
- transcripciones/resúmenes recientes;
- métricas básicas (show rate, cierres, ratio);
- ficha del lead si la conversación va de uno.

Cada dato vivo se inyecta **con su identificador** para que el Orbe pueda **citar**
("según tu llamada con Julián del 28/05…"). Sin grounding no se afirma nada del negocio.

## 4. Presupuesto de tokens (ejemplo, ventana ~200k)

| Bloque | Asignación | Estrategia si se pasa |
|---|---|---|
| Alma + capacidades (1–2) | fijo, cacheado | versión recortada |
| Soul card + user model (3–4) | ~2–4k | el user model es un resumen, no el log |
| Memoria recuperada (5) | ~3–8k | bajar K; subir umbral de score |
| Datos vivos (6) | ~3–10k | solo lo del foco actual; resumir transcripciones largas |
| Historial (7) | ~2–8k | ventana deslizante + resumen del resto |
| Turno (8) | lo que ocupe | — |

Regla: **grounding (6) y memoria (5) tienen prioridad** sobre historial largo. Mejor recordar
bien que arrastrar toda la conversación literal.

## 5. Recuperación de memoria al contexto

`context.js` pide a `memory.recall()` (ver [02](./02-MEMORY.md)) los top-K hechos según la
**intención inferida** del turno ([04](./04-INTENTION.md)):
- "¿qué hago hoy?" → procedural + episodic reciente + follow-ups due.
- "¿quién es este lead?" → structured match por `lead_id` + episodic de ese lead.
- charla general → social + semantic de alto salience.

## 6. Compactación de conversación

Cuando el historial crece: resumir los tramos antiguos en un "resumen de la conversación
hasta ahora" (hechos + decisiones + tono), manteniendo verbatim solo los últimos turnos.
Los hechos importantes del resumen se **promueven a memoria** (no se pierden al cerrar sesión).

## 7. Contexto por superficie

El Orbe vive en varios sitios; el ensamblaje cambia:

| Superficie | Énfasis del contexto |
|---|---|
| **Chat del Orbe** | conversacional: memoria + datos vivos + historial |
| **Briefing diario** ("el día en 10 min") | datos vivos del día + follow-ups + patrones + poca conversación |
| **En detalle de llamada** | esa transcripción + ficha del lead + histórico de ese lead |
| **Proactivo (evento)** | el evento + memoria relevante; sin historial de chat |

## 8. Caching (Anthropic)

- Marca de cache tras el bloque por-usuario (4) → el prefijo 1–4 se reutiliza entre turnos
  del mismo usuario.
- TTL del cache en mente: ráfagas de conversación se benefician; tras inactividad, el prefijo
  se recomputa (coste asumible porque 1–4 son compactos).
- Documentado en `src/lib/orbe/anthropic.js`. Ver guía interna de prompt caching.

## 9. Interfaz de código

```
src/lib/orbe/context.js
  assemble({ userId, turn|event, surface }) ->
    { system, messages, cacheBreakpoints, tokenReport }
```
Devuelve la ventana lista para el modelo + un reporte de tokens (para telemetría, [08]).
