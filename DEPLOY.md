# Despliegue — levantar APEX-CLOSERS en otra máquina / VPS

Dos formas: **A) todo local** (este equipo / un VPS con la IA local) o **B) Vercel + Supabase Cloud**.

---

## Requisitos

- **Node 20+** y **npm**
- **Supabase** (local con Docker, o un proyecto en supabase.com)
- Opcional para abaratar la IA: **Ollama** (LLM) + **Whisper** (STT). Si no, usa `ANTHROPIC_API_KEY`.

---

## A) Todo en una máquina / VPS

```bash
# 1) Clonar e instalar
git clone https://github.com/SASbot01/apexclosers.git
cd apexclosers
npm install

# 2) Configurar entorno
cp .env.example .env
#   Edita .env con tus claves (Supabase, Recall, Google OAuth, y Ollama/Whisper
#   o ANTHROPIC_API_KEY). Ver la sección "Variables" abajo.

# 3) Base de datos: arrancar Supabase y aplicar migraciones
supabase start                      # (si usas Supabase local con Docker)
./scripts/migrate.sh --docker       # aplica migrations/*.sql en orden
#   …o contra cualquier Postgres:
#   DATABASE_URL='postgresql://USER:PASS@HOST:5432/postgres' ./scripts/migrate.sh

# 4) IA local (opcional, abarata costes): Ollama + Whisper + backend API
ollama pull qwen2.5:7b-instruct-q4_K_M     # modelo del .env (OLLAMA_MODEL)
#   Whisper necesita un venv con faster-whisper:
#     python3 -m venv ../whisper-venv && ../whisper-venv/bin/pip install faster-whisper
#   (o exporta WHISPER_VENV=/ruta/a/python con faster-whisper)
./local-ai/start-local-ai.sh        # arranca Ollama + Whisper + backend (:5181)

#   Si NO usas IA local: borra OLLAMA_URL y LOCAL_STT_URL del .env, pon
#   ANTHROPIC_API_KEY, y arranca solo el backend:  node server/local-api.mjs

# 5) Frontend
npm run dev                         # dev (Vite, :5180, proxy /api → :5181)
#   …o producción:
npm run build && npm run preview
```

### Acceso desde fuera (socios)
El login de Google exige HTTPS. En un VPS pon un dominio + reverse proxy (Caddy/Nginx)
con TLS delante de Vite/preview y del backend. Registra
`https://TU_DOMINIO/api/auth?action=google-callback` en Google Cloud Console y mete
`APEX_PUBLIC_BASE_URL=https://TU_DOMINIO` en el `.env`. (En dev rápido sirve un túnel
Cloudflare: `cloudflared tunnel --url http://localhost:5180`, con `allowedHosts: true`
en `vite.config.js`.)

---

## B) Vercel + Supabase Cloud

- Las funciones `api/*.js` son serverless de Vercel (auto-detectadas). `vercel.json`
  ya define los crons (`schedule-bots`, `reconcile-stuck`) y `maxDuration`.
- Crea un proyecto en supabase.com, aplica las migraciones
  (`DATABASE_URL=... ./scripts/migrate.sh`), y configura las env vars del `.env`
  en el panel de Vercel (sin `OLLAMA_URL`/`LOCAL_STT_URL` si usas Anthropic).
- `APEX_PUBLIC_BASE_URL = https://tu-deploy.vercel.app`.
- El backend local (`server/local-api.mjs`) NO se usa en Vercel.

---

## Variables (.env)

| Variable | Para qué | Obligatoria |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Base de datos (todo) | Sí |
| `RECALL_API_KEY` | Bot que entra a las llamadas (grabar/transcribir) | Para llamadas |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login + calendario + invitación auto | Para login/calendario |
| `ANTHROPIC_API_KEY` | Resumen/feedback/extracción (si no usas LLM local) | Alternativa a Ollama |
| `OLLAMA_URL`, `OLLAMA_MODEL` | LLM local (sustituye a Anthropic) | Opcional |
| `LOCAL_STT_URL` | Whisper local (sustituye a la transcripción de Recall) | Opcional |
| `APEX_PUBLIC_BASE_URL` | Webhooks/finalize en background | En producción |
| `VITE_API_BASE` | Base del API del front (vacío = mismo origen) | No |

> Tras editar `.env`, **reinicia** el backend (lee el entorno al arrancar).

## Migraciones
Viven en `migrations/NNNN_*.sql` y se aplican en orden con `scripts/migrate.sh`.
Cada vez que cambie el esquema, añade una migración nueva y vuelve a ejecutarlo.

## Smoke test
```bash
curl "http://127.0.0.1:5181/api/metrics?action=metrics&userId=00000000-0000-0000-0000-000000000001"
```
Debe responder un JSON de métricas (ceros si no hay datos).
