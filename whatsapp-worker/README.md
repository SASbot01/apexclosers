# whatsapp-worker

Worker que vincula **por QR** el número del closer (estilo WhatsApp Web) y enruta
mensajes hacia/desde la app. Recreación del flujo que pediste.

> ⚠️ **Importante:** usa el número personal vía librería no oficial (Baileys) → va
> **contra los ToS de WhatsApp** (riesgo de baneo del número). Necesita un servicio
> **siempre encendido** con **disco persistente** (las sesiones viven en `./sessions/`).
> **No corre en Vercel** (serverless). Despliega en Railway / Render / Fly / VPS.

## Variables de entorno
- `PORT` (def. 8787)
- `WORKER_SECRET` — secreto compartido con la app (cabecera `x-worker-secret`).
- `APP_WEBHOOK_URL` — `https://<deploy>/api/whatsapp?action=webhook` (entrantes).

## Endpoints (protegidos por `x-worker-secret`)
- `POST /connect {userId}` — inicia sesión (genera QR la 1ª vez).
- `GET /qr?userId=` — `{ status, qr (dataURL), phone }` → la app pinta el QR.
- `GET /status?userId=` — estado de la conexión.
- `POST /send {userId,to,text}` — envía un mensaje.

## Flujo
1. La app llama (vía `/api/whatsapp`) a `/connect` → el closer escanea el **QR** con su WhatsApp.
2. Conectado → la app envía/recibe; los entrantes llegan al webhook y se guardan en `lead_messages`.

## Local
```bash
cd whatsapp-worker && npm install && npm start
```
Escanea el QR (lo expone `/qr`). En producción, detrás de HTTPS + el `WORKER_SECRET`.
