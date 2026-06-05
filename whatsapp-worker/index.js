// Worker WhatsApp (Baileys) — vincula por QR el número del closer (estilo
// WhatsApp Web), envía/recibe mensajes y los reenvía a la app.
//
// ⚠️ Servicio SIEMPRE ENCENDIDO con disco persistente (Railway/Render/VPS).
// No corre en Vercel serverless. Usa el número personal → contra ToS de WhatsApp
// (riesgo de baneo). Una sesión por usuario en ./sessions/<userId>.
//
// Env: PORT · WORKER_SECRET (cabecera x-worker-secret) · APP_WEBHOOK_URL
//      (= https://<deploy>/api/whatsapp?action=webhook)

import express from 'express'
import qrcode from 'qrcode'
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'

const PORT = process.env.PORT || 8787
const SECRET = process.env.WORKER_SECRET || ''
const APP_WEBHOOK = process.env.APP_WEBHOOK_URL || ''
const sessions = {} // userId -> { sock, qr, status, phone }

async function start(userId) {
  const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${userId}`)
  const sock = makeWASocket({ auth: state, printQRInTerminal: false })
  sessions[userId] = { ...(sessions[userId] || {}), sock, status: 'connecting' }
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u
    if (qr) { sessions[userId].qr = await qrcode.toDataURL(qr); sessions[userId].status = 'qr' }
    if (connection === 'open') {
      sessions[userId].status = 'connected'; sessions[userId].qr = null; sessions[userId].phone = sock.user?.id
    }
    if (connection === 'close') {
      sessions[userId].status = 'disconnected'
      const code = lastDisconnect?.error?.output?.statusCode
      if (code !== DisconnectReason.loggedOut) start(userId) // reconecta salvo logout
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      if (m.key.fromMe) continue
      const from = (m.key.remoteJid || '').replace(/@s\.whatsapp\.net$/, '')
      const body = m.message?.conversation || m.message?.extendedTextMessage?.text || ''
      if (!body || !APP_WEBHOOK) continue
      fetch(APP_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-worker-secret': SECRET },
        body: JSON.stringify({ userId, phone: from, body, wa_id: m.key.id, direction: 'in' }),
      }).catch(() => {})
    }
  })
}

const app = express()
app.use(express.json())
const auth = (req, res, next) => { if (SECRET && req.headers['x-worker-secret'] !== SECRET) return res.status(401).json({ error: 'unauthorized' }); next() }

app.post('/connect', auth, async (req, res) => {
  const { userId } = req.body
  if (!sessions[userId]?.sock) await start(userId)
  res.json({ ok: true, status: sessions[userId]?.status || 'connecting' })
})
app.get('/qr', auth, (req, res) => {
  const s = sessions[req.query.userId]
  res.json({ status: s?.status || 'disconnected', qr: s?.qr || null, phone: s?.phone || null })
})
app.get('/status', auth, (req, res) => {
  const s = sessions[req.query.userId]
  res.json({ status: s?.status || 'disconnected', phone: s?.phone || null })
})
app.post('/send', auth, async (req, res) => {
  const { userId, to, text } = req.body
  const s = sessions[userId]
  if (s?.status !== 'connected') return res.status(409).json({ error: 'not_connected' })
  const jid = String(to).replace(/[^0-9]/g, '') + '@s.whatsapp.net'
  await s.sock.sendMessage(jid, { text })
  res.json({ ok: true })
})

app.listen(PORT, () => console.log('[whatsapp-worker] escuchando en', PORT))
