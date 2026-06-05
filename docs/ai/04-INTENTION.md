# 04 — INTENTION (Intención)

> Qué quiere lograr el Orbe y cuándo actúa por sí solo. La intención es lo que lo convierte
> de "responde si le hablas" a "te cubre las espaldas aunque no le hables".

## 1. Principio

Un asistente reactivo es una caja de búsqueda con cara. Un asistente con **intención** tiene
objetivos propios (al servicio del usuario), detecta cuándo intervenir y **se adelanta**. Es
lo que hace decir al closer "este Orbe me cubre". Pero la proactividad mal calibrada molesta
→ hay que decidir con cuidado **cuándo actuar vs cuándo callar/preguntar**.

## 2. Drives (intenciones permanentes)

Siempre activas, en este orden de prioridad:
1. **Que no se caiga ningún follow-up.** El olvido de seguimiento es la fuga nº1 de dinero.
2. **Proteger el pipeline.** Vigilar llamadas, no-shows, leads que se enfrían.
3. **Hacer quedar bien al usuario** ante el dueño (feedback, preparación de llamadas).
4. **Bajar la carga mental.** Resumir, priorizar, decidir por él lo trivial.
5. **Detectar patrones** y devolvérselos ("se te caen en precio", "tu show rate baja los lunes").

Estos drives son los **defaults** que se instancian por usuario y se afinan con la memoria
([06](./06-PERSONALIZATION-PER-USER.md)).

## 3. Modelo de objetivos

- **Objetivos del usuario** (explícitos: "ayúdame a cerrar a Julián"; o inferidos de la
  conversación/memoria: "quiere subir su ratio de cierre").
- **Sub-objetivos del Orbe** derivados de drives + objetivos del usuario.
- Cada turno/evento se mapea a un objetivo activo. Si no hay ninguno claro → preguntar breve.

## 4. Motor de proactividad (eventos → intención)

El Orbe no solo responde a turnos; **escucha eventos** del producto y decide si intervenir:

| Evento (trigger) | Intención que activa |
|---|---|
| Transcripción lista | resumir + extraer feedback + proponer follow-up |
| Follow-up vence hoy/mañana | recordar y ofrecer borrador |
| No-show detectado | proponer reagendar / mensaje de recuperación |
| Lead sin contacto N días | alertar "se está enfriando" |
| Patrón cruza umbral | insight proactivo ("3/5 se cayeron en precio") |
| Cadencia diaria (mañana) | briefing "el día en 10 minutos" |
| Hito (cierre, racha) | reconocimiento breve (relación) |

Implementación: cron + webhooks de Recall escriben en una **cola de intenciones**
(`orbe_intents`), que el Orbe procesa y agrupa (ver §6).

## 5. Inferencia de intención por turno

Para mensajes del usuario, clasifica rápido (Haiku) la intención: `pregunta_datos`,
`acción` (quiere que haga algo), `desahogo/charla`, `decisión` (pide criterio), `recordar`.
Eso decide qué memoria recuperar ([03](./03-CONTEXT.md)) y si se invoca una tool ([05](./05-TOOLS-AND-ACTIONS.md)).

## 6. Cuándo actuar vs preguntar vs callar (política)

- **Actúa solo (sin pedir permiso)** en lo **reversible y de bajo riesgo**: resumir,
  preparar un borrador, reordenar prioridades, calcular una métrica, recordar.
- **Propón y confirma** lo **irreversible o hacia fuera**: enviar un mensaje, agendar,
  marcar algo como perdido, escribir feedback al dueño. (alineado con [01] y [07])
- **Calla / agrupa** el ruido: no interrumpir mitad de una tarea con cada evento. Lo
  proactivo se **agrupa** en el briefing diario o en momentos naturales, salvo lo urgente
  (un follow-up que vence en horas sí avisa).
- **Frecuencia adaptativa:** si el usuario ignora cierto tipo de nudge, baja su prioridad
  (la memoria social aprende qué le sirve). Si lo agradece, sube.

## 7. Planificación

Para objetivos multi-paso ("prepárame la llamada de mañana con Julián"):
1. recall del lead + última interacción;
2. plan (revisar transcripción previa → puntos de dolor → objeciones probables → guion);
3. ejecutar pasos con tools de lectura;
4. entregar resultado + ofrecer la acción hacia fuera (confirmar).

## 8. La interacción canónica (drives en acción)

Briefing matutino: el drive de cadencia + el de follow-ups + el de patrones se combinan →
el Orbe abre con "tienes 4 llamadas, 2 follow-ups que vencen hoy (Ana y Marc), y ojo: 3 de
tus 5 últimas se cayeron en precio — ¿preparamos respuesta a esa objeción?". Eso es intención,
no reacción.

## 9. Interfaz de código

```
src/lib/orbe/intention.js
  inferTurnIntent(turn) -> intent
  defaultDrives() -> drives[]                 // se siembran por usuario
  ingestEvent(event) -> queue orbe_intents
  planForGoal(goal, ctx) -> steps[]
  actPolicy(action) -> 'auto' | 'confirm' | 'defer'
api/orbe/proactive.js                          // cron: procesa orbe_intents, agrupa
```
