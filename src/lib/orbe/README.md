# src/lib/orbe — núcleo del Orbe (Fase 1)

Aquí vivirá la implementación del agente, según la arquitectura en
[`docs/ai/`](../../../docs/ai/README.md):

```
loop.js        orquestador del bucle cognitivo (00)
soul.js        compila alma base + overlay por usuario → system prompt (01)
memory.js      remember() / recall() / consolidate() / forget() (02)
context.js     ensamblaje de la ventana + presupuesto de tokens (03)
intention.js   drives, proactividad por eventos, act-vs-ask (04)
tools.js       definiciones + execute(name, input, { userId }) (05)
anthropic.js   capa de modelo (tiers + prompt caching)
```

Endpoints serverless asociados: `api/orbe/chat`, `api/orbe/proactive`.

> Regla nº1: todo se instancia y se aísla **por `user_id`** (ver `docs/ai/06`, `07`).
> Fase 0: el Orbe (`src/shell/ApexOrb.jsx`) está en "modo esqueleto" (UI sin backend).
