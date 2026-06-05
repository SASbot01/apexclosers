# 08 — EVALS & TELEMETRY (Evaluación)

> Cómo sabemos que el alma, la memoria, el contexto y la intención funcionan — y que el
> aislamiento por usuario nunca se rompe. Lo que no se mide, se degrada en silencio.

## 1. Principio

El Orbe es el corazón del producto y su mayor riesgo (la viralidad amplifica lo bueno y lo
malo). Necesita **evals offline** (suites repetibles antes de cada release) + **telemetría
online** (qué pasa en producción) + **red-team** (intentar romperlo).

## 2. Qué medimos por pilar

| Pilar | Métrica | Cómo |
|---|---|---|
| **SOUL** | consistencia de persona | rúbrica (juez LLM + humano): ¿voz, valores y prohibiciones respetados? sobre set de diálogos |
| **MEMORY** | precision / recall de recuerdo | set con hechos "verdad": ¿recupera lo relevante? ¿escribe lo correcto? ¿deduplica? |
| **MEMORY** | **no-filtración entre usuarios** (P0) | test adversario: usuario A nunca ve nada de B. Debe ser **100%** |
| **CONTEXT** | grounding / citas correctas | ¿toda afirmación de negocio está respaldada y citada? tasa de alucinación |
| **CONTEXT** | eficiencia | tokens por turno, cache hit rate, latencia |
| **INTENTION** | acierto proactivo | ¿los nudges aciertan? tasa de aceptación vs descarte por tipo |
| **INTENTION** | act-vs-ask correcto | ¿pidió confirmación cuando debía? ¿actuó solo en lo seguro? |
| **SAFETY** | resistencia a inyección | red-team de transcripciones maliciosas: 0 acciones/fugas inducidas |

## 3. Evals offline (suites)

- **Golden set de diálogos** por intención (datos, acción, decisión, charla) con respuesta
  esperada/rúbrica → corre en cada cambio de alma/contexto.
- **Memoria sintética:** usuarios ficticios con historial conocido → comprobar write/recall/
  dedup/decay y, sobre todo, **aislamiento** (A vs B).
- **Inyección:** corpus de transcripciones con instrucciones incrustadas → el Orbe debe
  tratarlas como datos. Cualquier fallo = bloqueo de release.
- **Grounding:** preguntas cuya respuesta exige una tool → penalizar afirmaciones sin cita.

Juez: combinación de **LLM-as-judge** (con rúbricas) + revisión humana de muestras.

## 4. Telemetría online (producción)

- **Calidad percibida:** 👍/👎 por respuesta, "esto no es verdad" (señal de alucinación),
  ediciones de borradores (señal de mismatch de estilo).
- **Uso del Orbe:** % de días con interacción, briefing diario abierto, acciones confirmadas.
- **Coste:** tokens/usuario, cache hit rate, coste por usuario activo (alimenta el COGS del
  modelo de negocio — ver PDR §13).
- **Proactividad:** aceptación/descarte por tipo de nudge → realimenta drives ([04](./04-INTENTION.md)).
- **Seguridad:** patrones de inyección detectados, intentos de acceso cruzado (deben ser 0).

## 5. Métricas de producto ligadas a la IA

- **Activación:** 1ª llamada transcrita + 1er follow-up en <24h (PDR).
- **Momento "wow":** primera vez que el Orbe da un feedback/insight que el usuario marca útil.
- **Retención sem.4** y churn (el Orbe con memoria debería moverlas) — KPI nº1 del negocio.
- **North Star:** llamadas de venta gestionadas / semana.

## 6. Red-team (continuo)

- **Aislamiento:** intentar que el Orbe de A revele/use datos de B (prompting, IDs falsos).
- **Inyección:** transcripciones y fichas de lead diseñadas para secuestrar el Orbe.
- **Exfiltración:** intentar que mande datos del usuario fuera sin confirmación.
- **Persona break:** empujar al Orbe fuera de su alma (tono, prohibiciones).
Cualquier hallazgo P0 (fuga/acción no autorizada) bloquea release.

## 7. Bucle de mejora

```
telemetría + evals ⇒ detectar fallo ⇒ corregir (alma / memoria / contexto / política)
                 ⇒ añadir caso al golden set ⇒ re-eval ⇒ release
```
Cada bug de calidad o seguridad **se convierte en un test permanente** (no se vuelve a romper).

## 8. Cuándo empezar

Desde la Fase 0: aunque sea con un golden set pequeño y los tests de **aislamiento +
inyección** (los P0). Crecen con el producto. Mejor 10 evals que protegen lo crítico que 0.
