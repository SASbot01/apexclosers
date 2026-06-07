#!/usr/bin/env python3
"""
Servicio HTTP de transcripción local (STT) para APEX-CLOSERS.

Sustituye la transcripción de Recall.ai por Whisper en local sobre el audio
que Recall expone como `recording_url`. El backend Node (api/recall.js) le pasa
una URL (o ruta de fichero) y recibe los segmentos en el MISMO shape que
`parseRecallSegments` produce: [{speaker, text, startMs, endMs}].

Sin dependencias web extra: usa http.server de la stdlib. Modelo via
faster-whisper (CTranslate2), CPU o GPU según disponibilidad.

Endpoints:
  GET  /health                 -> {"ok": true, "model": ..., "device": ...}
  POST /transcribe             -> body {"audio_url": "..."} | {"file_path": "..."}
                                  resp {"segments": [...], "language": "es", "duration": N}

Variables de entorno:
  WHISPER_MODEL    tamaño del modelo (tiny|base|small|medium|large-v3). Default: small
  WHISPER_DEVICE   cpu | cuda | auto. Default: auto
  WHISPER_COMPUTE  int8 | int8_float16 | float16 | float32. Default: auto por device
  WHISPER_LANG     idioma forzado. Default: es
  WHISPER_PORT     puerto. Default: 8090
"""
import json
import os
import sys
import tempfile
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
LANG = os.environ.get("WHISPER_LANG", "es")
PORT = int(os.environ.get("WHISPER_PORT", "8090"))


def _pick_device_compute():
    """Elige device y compute_type. En CPU int8 es lo más rápido; en GPU float16."""
    dev = DEVICE
    if dev == "auto":
        try:
            import ctranslate2
            dev = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            dev = "cpu"
    compute = os.environ.get("WHISPER_COMPUTE") or ("float16" if dev == "cuda" else "int8")
    return dev, compute


DEV, COMPUTE = _pick_device_compute()
print(f"[whisper] cargando modelo '{MODEL_SIZE}' device={DEV} compute={COMPUTE} ...", flush=True)
MODEL = WhisperModel(MODEL_SIZE, device=DEV, compute_type=COMPUTE)
print("[whisper] modelo listo.", flush=True)


def _download(url: str) -> str:
    suffix = os.path.splitext(url.split("?")[0])[1] or ".mp4"
    fd, path = tempfile.mkstemp(suffix=suffix, prefix="apex-rec-")
    os.close(fd)
    req = urllib.request.Request(url, headers={"User-Agent": "apex-closer-stt/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return path


def transcribe(path: str):
    # NOTA: faster-whisper no hace diarización (no separa interlocutores).
    # Marcamos speaker como "Desconocido"; la atribución closer/lead es un
    # follow-up (Recall expone tracks por participante; ver README).
    segments, info = MODEL.transcribe(
        path,
        language=LANG,
        vad_filter=True,
        beam_size=5,
    )
    out = []
    for s in segments:
        text = (s.text or "").strip()
        if not text:
            continue
        out.append({
            "speaker": "Desconocido",
            "text": text,
            "startMs": int(s.start * 1000),
            "endMs": int(s.end * 1000),
        })
    return out, info


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):  # silenciar log por defecto
        pass

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True, "model": MODEL_SIZE, "device": DEV, "compute": COMPUTE})
        return self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/transcribe":
            return self._json(404, {"error": "not_found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception as e:
            return self._json(400, {"error": f"bad_json: {e}"})

        url = body.get("audio_url")
        path = body.get("file_path")
        tmp = None
        try:
            if url:
                tmp = path = _download(url)
            if not path or not os.path.exists(path):
                return self._json(400, {"error": "audio_url_or_file_path_required"})
            segments, info = transcribe(path)
            return self._json(200, {
                "segments": segments,
                "language": getattr(info, "language", LANG),
                "duration": getattr(info, "duration", None),
            })
        except Exception as e:
            return self._json(500, {"error": str(e)})
        finally:
            if tmp and os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass


if __name__ == "__main__":
    print(f"[whisper] escuchando en http://127.0.0.1:{PORT}", flush=True)
    try:
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
