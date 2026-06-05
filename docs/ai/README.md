# Orbe — Arquitectura de IA (suite de documentos)

> El **Orbe** es el asistente de IA del software. No es un chatbot pegado encima:
> es un **agente cognitivo con alma, memoria, contexto e intención**, y —regla
> número uno— **instanciado por cada usuario**. Cada closer tiene *su* Orbe: su
> memoria, su relación, su contexto. Nunca se comparte ni se filtra entre usuarios.

Esto se diseña **desde el principio**. Es la diferencia entre "otra herramienta de
transcripción" y un producto del que el usuario no quiere desengancharse (mata el churn,
nuestro riesgo nº1).

## Los pilares

| # | Pilar | Pregunta que responde |
|---|---|---|
| [01](./01-SOUL.md) | **SOUL (Alma)** | ¿Quién es el Orbe? Identidad, voz, valores, principios. |
| [02](./02-MEMORY.md) | **MEMORY (Memoria)** | ¿Qué recuerda de *este* usuario, y cómo? |
| [03](./03-CONTEXT.md) | **CONTEXT (Contexto)** | ¿Qué sabe *ahora mismo* para responder bien? |
| [04](./04-INTENTION.md) | **INTENTION (Intención)** | ¿Qué quiere lograr? ¿Cuándo actúa por sí solo? |
| [05](./05-TOOLS-AND-ACTIONS.md) | **TOOLS (Manos)** | ¿Qué puede *hacer*, no solo decir? |
| [06](./06-PERSONALIZATION-PER-USER.md) | **PER-USER** | ¿Cómo se instancia y evoluciona para cada nuevo usuario? |
| [07](./07-SAFETY-AND-ISOLATION.md) | **SAFETY** | Aislamiento, PII, inyección desde transcripciones, confirmaciones. |
| [08](./08-EVALS-AND-TELEMETRY.md) | **EVALS** | ¿Cómo medimos que el alma, la memoria y la intención funcionan? |

Documento maestro que une todo: **[00 — Arquitectura cognitiva](./00-COGNITIVE-ARCHITECTURE.md)**.

## Orden de lectura
00 (visión) → 06 (cómo nace por usuario) → 01–05 (los pilares) → 07–08 (lo que protege y mide).

## Principio rector
> **Un usuario = un Orbe.** Todo —alma, memoria, contexto, intención— se crea, se aísla
> y evoluciona por `user_id`. La misma disciplina de aislamiento que ya aplicamos entre
> perfiles de cliente en Apex. Cero filtración entre usuarios, siempre.
