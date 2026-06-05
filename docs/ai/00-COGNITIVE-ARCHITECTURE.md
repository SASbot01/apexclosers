# 00 — Arquitectura cognitiva del Orbe

> Documento maestro. Cómo encajan Alma · Memoria · Contexto · Intención · Manos,
> y cómo todo se instancia **por usuario**.

## 1. Qué es el Orbe

Un **agente cognitivo personal** embebido en el software del closer. Vive como un orbe
flotante (`ApexOrb`) presente en toda la app. No espera órdenes pasivamente: percibe lo
que pasa en el negocio del usuario (llamadas, transcripciones, seguimientos), recuerda,
razona con su contexto, **forma intenciones** y actúa o propone.

Mentalmente: es el **chief-of-staff** del closer. Sabe quién es, qué vendió ayer, a quién
debe seguir hoy, y qué patrón se repite en sus llamadas. Y lo dice con una voz propia.

## 2. El bucle cognitivo (runtime)

Cada interacción (del usuario o disparada por un evento) recorre este bucle:

```
   ┌─────────────────────────────────────────────────────────────┐
   │                      ORBE  ·  user_id = U                     │
   │                                                               │
   │  PERCIBIR ──► RECORDAR ──► CONTEXTUALIZAR ──► INTENCIÓN ──►    │
   │  (evento /    (memoria U)   (arma ventana)    (qué lograr)     │
   │   turno)                                          │           │
   │      ▲                                            ▼           │
   │      │                                         ACTUAR         │
   │      │                                   (responder / tool /  │
   │      │                                    proponer)           │
   │      │                                            │           │
   │   REFLEXIONAR ◄──── escribir memoria ◄────────────┘           │
   │   (¿qué aprendí de U?)                                        │
   └─────────────────────────────────────────────────────────────┘
```

1. **Percibir** — un turno del usuario *o* un evento del sistema (transcripción lista,
   follow-up vencido, no-show, cadence diaria).
2. **Recordar** — recupera de la memoria de `U` lo relevante (ver [02](./02-MEMORY.md)).
3. **Contextualizar** — ensambla la ventana: alma + memoria + datos vivos + turno (ver [03](./03-CONTEXT.md)).
4. **Intención** — infiere/activa qué quiere lograr; decide actuar vs preguntar (ver [04](./04-INTENTION.md)).
5. **Actuar** — responde, llama a una tool o propone una acción (ver [05](./05-TOOLS-AND-ACTIONS.md)).
6. **Reflexionar** — extrae lo aprendido y lo escribe en la memoria de `U`.

El paso 6 es lo que hace que el Orbe **mejore con cada uso** y se sienta "vivo" para ese usuario.

## 3. Los pilares y cómo se combinan

- **SOUL** se compila en el *prefijo estable* del prompt (cacheable). Da el quién y el cómo.
- **MEMORY** alimenta el paso *recordar*. Da el qué-sé-de-ti.
- **CONTEXT** es el ensamblaje que entra al modelo cada turno. Da el ahora.
- **INTENTION** decide el objetivo y la proactividad. Da el para-qué.
- **TOOLS** ejecutan. Dan el hacer.

## 4. Instanciación por usuario (regla nº1)

Al crear un usuario (`U`), se instancia:
- una **soul overlay** (`soul_profiles[U]`) sobre el alma base compartida;
- un **almacén de memoria** vacío (`memories` filtrado por `user_id=U`);
- un **modelo de usuario** (`user_models[U]`) que se siembra en el onboarding;
- **intenciones por defecto** (drives estándar) que luego se afinan.

Todo lo que el Orbe sabe, recuerda y cómo se relaciona vive bajo `U` y **jamás** cruza a
otro usuario. Ver [06](./06-PERSONALIZATION-PER-USER.md) y [07](./07-SAFETY-AND-ISOLATION.md).

## 5. Estrategia de modelos (Anthropic)

| Tarea | Modelo sugerido | Por qué |
|---|---|---|
| Conversación Orbe, razonamiento, intención | **Claude Opus / Sonnet** | calidad de juicio y voz |
| Resúmenes de llamada, extracción de memoria | **Sonnet** | volumen + buena relación coste/calidad |
| Clasificación (solo-ventas), etiquetado rápido | **Haiku** | barato y rápido, alto volumen |

- **Prompt caching obligatorio:** el alma base + capacidades + soul card del usuario forman
  un prefijo estable → se cachean. Solo la cola (memoria recuperada + datos vivos + turno)
  cambia. Esto baja coste y latencia drásticamente (clave para el COGS por token del modelo
  de negocio).
- La capa de modelo se abstrae en `src/lib/anthropic` para poder cambiar de tier por tarea.

## 6. Interacción canónica — "el día en 10 minutos"

Del re-enfoque del proyecto: el usuario abre el Orbe por la mañana → *"¿qué tengo hoy?"* →
el Orbe, con su memoria y los datos vivos, le resume llamadas del día, follow-ups que no
puede dejar caer, y un patrón que detectó ("3 de tus últimos 5 leads se cayeron en precio").
Eso es alma + memoria + contexto + intención trabajando juntos. Es la demo y es el producto.

## 7. Dónde vive el código (cuando se construya)

```
src/lib/orbe/
  loop.js            orquestador del bucle cognitivo
  soul.js            compila el alma (base + overlay) → system prompt
  memory.js          escribir / recordar (write + recall policies)
  context.js         ensamblaje de la ventana + presupuesto de tokens
  intention.js       drives, triggers de proactividad, act-vs-ask
  tools.js           definiciones de tools + ejecución
  anthropic.js       capa de modelo (tiers + caching)
api/orbe/            endpoints serverless (chat, proactive cron)
```
Base de partida: portar/evolucionar el Orbe existente del monorepo
(`Apex-operations`: `components/ApexOrb.jsx`, `api/agent.js`, `lib/config.js`).
