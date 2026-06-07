#!/usr/bin/env bash
# Arranca la IA local de APEX-CLOSERS: Ollama (LLM) + Whisper (STT) + backend API.
# Uso:  ./local-ai/start-local-ai.sh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Python de Whisper: configurable por env (en otra máquina/VPS apunta a tu venv
# o a 'python3'). Default: venv hermano del proyecto; si no existe, python3.
WHISPER_VENV="${WHISPER_VENV:-$PROJECT_DIR/../whisper-venv/bin/python}"
[ -x "$WHISPER_VENV" ] || WHISPER_VENV="$(command -v python3 || echo python3)"
WHISPER_SERVER="$(dirname "$0")/whisper_server.py"

# Device de Whisper: cpu por defecto. Cuando la GPU funcione, exporta
# WHISPER_DEVICE=cuda WHISPER_MODEL=medium antes de lanzar para más calidad/velocidad.
export WHISPER_DEVICE="${WHISPER_DEVICE:-cpu}"
export WHISPER_MODEL="${WHISPER_MODEL:-small}"

# 1) Ollama
if ! curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "[local-ai] arrancando ollama serve ..."
  nohup ollama serve >/tmp/ollama.log 2>&1 &
  sleep 3
fi
echo "[local-ai] ollama OK  (modelo: ${OLLAMA_MODEL:-qwen2.5:7b-instruct})"

# 2) Whisper
if ! curl -sf http://127.0.0.1:8090/health >/dev/null 2>&1; then
  echo "[local-ai] arrancando whisper (device=$WHISPER_DEVICE model=$WHISPER_MODEL) ..."
  nohup "$WHISPER_VENV" "$WHISPER_SERVER" >/tmp/whisper.log 2>&1 &
  # esperar a que cargue el modelo
  for i in $(seq 1 60); do
    curl -sf http://127.0.0.1:8090/health >/dev/null 2>&1 && break
    sleep 1
  done
fi
curl -s http://127.0.0.1:8090/health && echo

# 3) Backend API local (ejecuta api/* + cron local). Lee el .env del proyecto.
if ! curl -sf http://127.0.0.1:5181/api/recall?action=list >/dev/null 2>&1; then
  echo "[local-ai] arrancando backend API local (puerto 5181) ..."
  ( cd "$PROJECT_DIR" && nohup node server/local-api.mjs >/tmp/apex-local-api.log 2>&1 & )
  sleep 2
fi
echo "[local-ai] backend API:"; tail -1 /tmp/apex-local-api.log 2>/dev/null || true

echo "[local-ai] listo. Frontend: http://localhost:5180  (api via proxy → :5181)"
