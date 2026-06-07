# IA local para APEX-CLOSERS (abaratar costes)

Sustituye **Anthropic** (resumen/feedback/outcome) y la **transcripción de
Recall.ai** por modelos que corren en este equipo. El bot que entra al Google
Meet **sigue siendo Recall.ai** (eso no es localizable de forma realista): solo
lo usamos para que entre, grabe y nos dé `recording_url`.

## Pipeline

```
closer conecta Google ─→ google_tokens (Supabase)
                              │
   cron */5 min: /api/calendar?action=schedule-bots
                              │  lee calendarios → callClassifier → calls de VENTA inminentes
                              ▼
Google Meet ◀─(bot programado, join_at)── Recall.ai ─graba→ recording_url
                                         │
                 finalize (api/recall.js)│
                                         ▼
        Whisper local (STT) ── transcripción ──▶ Ollama (LLM) ──▶ resumen + feedback + outcome
        local-ai/whisper_server.py                qwen2.5:7b-instruct
```

## Invitación automática (sin tocar nada el closer)

`/api/calendar?action=schedule-bots` (cron cada 5 min en `vercel.json`) recorre
**todos los closers con Google conectado**, mira sus calendarios y, para cada
llamada de **venta** (decide `api/_lib/callClassifier.js`) que empieza en los
próximos 15 min, crea un **bot de Recall programado** (`join_at`, entra 1 min
antes). Dedupe por `calendar_event_id` → nunca dos bots para la misma call.
Lógica de ventana/`join_at` aislada y testeada en `api/_lib/schedule.js`.

Requiere (solo desplegado): `RECALL_API_KEY`, Supabase, `GOOGLE_CLIENT_ID/SECRET`
y `APEX_PUBLIC_BASE_URL` (para que el webhook de `bot.done` dispare `finalize`).

## Componentes

- **Ollama** (`http://127.0.0.1:11434`) sirviendo `qwen2.5:7b-instruct` → resumen,
  feedback y outcome JSON. Reemplaza `claude-sonnet-4-6`.
- **Whisper** (`local-ai/whisper_server.py`, `http://127.0.0.1:8090`) →
  speech-to-text en español con `faster-whisper`. Reemplaza la transcripción de Recall.

## Arrancar

```bash
./local-ai/start-local-ai.sh
```

Y en `.env`:

```
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
LOCAL_STT_URL=http://127.0.0.1:8090
```

Con esas variables, `api/recall.js`:
- en `createBot` **no pide transcripción a Recall** (solo graba) → ahorras esa parte.
- en `finalize` transcribe en local y genera resumen/feedback/outcome con Ollama.

Si quitas `OLLAMA_URL`/`LOCAL_STT_URL`, vuelve automáticamente a Anthropic + Recall.

## GPU (RTX 3050, 4 GB)

Ahora mismo la GPU está en estado *driver/library mismatch* (el módulo del kernel
cargado es 595.58.03 y en disco hay 595.71.05). **Requiere reiniciar** el equipo
(o cerrar la sesión gráfica) para recargar el módulo. Mientras tanto todo va por
**CPU** (funciona; ~37 s por llamada para el LLM, suficiente porque `finalize`
corre en segundo plano).

Cuando la GPU funcione, para más calidad/velocidad:

```bash
WHISPER_DEVICE=cuda WHISPER_MODEL=medium ./local-ai/start-local-ai.sh
```

Nota VRAM: con 4 GB, `qwen2.5:7b` no entra entero en GPU (offload parcial). Si la
latencia molesta, alternativa: `OLLAMA_MODEL=qwen2.5:3b-instruct` (cabe en 4 GB,
más rápido, algo menos de calidad).

## Limitaciones conocidas

- **Sin diarización**: Whisper no separa interlocutores; todos los segmentos van
  como `Desconocido`. El resumen del LLM sale bien igualmente. Para atribuir
  closer/lead: Recall expone audio por participante (`participant_events` /
  tracks separados) — es el siguiente paso si se quiere.
- Calidad del STT: el modelo `small` comete fallos menores. `medium` (con GPU)
  mejora bastante.

## Pruebas

```bash
# salud de los servicios
curl http://127.0.0.1:8090/health
curl http://127.0.0.1:11434/api/tags

# prueba del LLM (resumen+feedback+outcome) con transcripción de ejemplo
OLLAMA_URL=http://127.0.0.1:11434 node local-ai/test_llm.mjs

# lógica del scheduler (clasificación + ventana + join_at), sin credenciales
node local-ai/test_scheduler.mjs
```
