import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Loader2 } from 'lucide-react'
import { CLIENTS } from '../data/mock/clients'
import { addOrbeConversation } from '../lib/conversations'
import { API_BASE, USER_ID } from '../lib/config'

/*
 * ApexOrb — copiloto IA flotante del shell (el "Orbe").
 *
 * Conectado al LLM local vía /api/orbe (acción chat). El Orbe hace tres cosas:
 *   1) te dice todas tus métricas, 2) te dice qué está fallando en tu embudo,
 *   3) te guía en las llamadas para cerrar mejor. El backend calcula tus métricas
 *   reales (calls + leads) y las inyecta en el prompt del modelo local.
 */
const ORB_HISTORY_KEY = 'apex_closer_orb_history'

function readHistory() {
  try { const raw = localStorage.getItem(ORB_HISTORY_KEY); return raw ? JSON.parse(raw) : [] }
  catch { return [] }
}
function writeHistory(msgs) {
  try { localStorage.setItem(ORB_HISTORY_KEY, JSON.stringify(msgs.slice(-30))) } catch { /* off */ }
}

export default function ApexOrb() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState(() => readHistory())
  const [busy, setBusy] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const location = useLocation()
  const bodyRef = useRef(null)
  const inputRef = useRef(null)

  // Prompts sugeridos según la sección activa (producto del closer).
  const suggestedPrompts = useMemo(() => {
    const path = location.pathname
    if (/\/llamadas\b/.test(path)) {
      return ['¿Qué llamadas tengo hoy?', 'Resume mi última llamada', 'Prepárame la próxima llamada', '¿Cómo cerré la semana pasada?']
    }
    if (/\/pipeline\b/.test(path)) {
      return ['¿Qué follow-ups vencen hoy?', 'Redáctame un seguimiento', '¿A quién llevo días sin tocar?', 'Prioriza mi pipeline']
    }
    if (/\/finanzas\b/.test(path)) {
      return ['¿Cuánto he facturado este mes?', '¿Cuál es mi ticket medio?', '¿Qué closer vende más?', '¿Cuánto cash llevo cobrado?']
    }
    if (/\/reports\b/.test(path)) {
      return ['¿Cuál es mi close rate?', '¿Cómo va mi show rate?', '¿Cuántas ofertas lancé?', '¿Dónde se me cae el embudo?']
    }
    if (/\/clientes\b/.test(path)) {
      return ['Resume este cliente', 'Genera feedback para el cliente', '¿Qué seguimientos tiene?', '¿Cómo va su pipeline?']
    }
    if (/\/scripts\b/.test(path)) {
      return ['¿Qué digo en la apertura?', 'Frase para rebatir el precio', '¿Cómo cierro a este cliente?', 'Mejora mi guion con lo aprendido']
    }
    return ['¿Qué tengo hoy?', '¿Qué follow-ups vencen hoy?', 'Resume mi última llamada', '¿Qué objeción se me repite esta semana?']
  }, [location.pathname])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
      })
    }
  }, [open, messages.length])

  useEffect(() => { writeHistory(messages) }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user', body: text, ts: Date.now() }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/api/orbe?action=chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: USER_ID,
          messages: next.map(m => ({ role: m.role, body: m.body })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      const reply = data.reply || (res.ok ? 'No tengo respuesta ahora mismo.' : 'No pude conectar con el LLM local. Comprueba que el backend y Ollama están arrancados.')
      setMessages([...next, { role: 'assistant', body: reply, ts: Date.now(), error: !res.ok }])
    } catch {
      setMessages([...next, { role: 'assistant', body: 'No pude conectar con el Orbe. ¿Está arrancado el backend local (server/local-api.mjs) y Ollama?', ts: Date.now(), error: true }])
    } finally {
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  function reset() { setMessages([]); writeHistory([]) }

  return (
    <>
      <motion.button
        type="button"
        className="apex-orb-btn"
        data-open={open || undefined}
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Cerrar Orbe' : 'Abrir Orbe'}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
      >
        <span className="apex-orb-glow" aria-hidden="true" />
        <span className="apex-orb-ring" aria-hidden="true" />
        {open
          ? <X size={18} strokeWidth={1.7} />
          : <img src="/apex-mark-dark.svg" alt="" width={22} height={22} className="apex-orb-mark" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.aside
            className="apex-orb-panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            role="dialog"
            aria-label="Orbe"
          >
            <header className="apex-orb-head">
              <div className="apex-orb-title">
                <img src="/apex-mark.svg" alt="" width={12} height={12} />
                <span>Orbe</span>
              </div>
              <div style={{ display: 'inline-flex', gap: 6, position: 'relative' }}>
                <button type="button" className="apex-orb-reset" onClick={() => { setSaved(false); setSaveOpen(o => !o) }} disabled={messages.length === 0} title="Guardar conversación en un cliente">
                  {saved ? 'Guardado ✓' : 'Guardar en cliente'}
                </button>
                <button type="button" className="apex-orb-reset" onClick={reset} title="Limpiar conversación" disabled={messages.length === 0}>
                  Limpiar
                </button>
                {saveOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 870, minWidth: 190, background: 'var(--apex-card-bg)', border: '1px solid var(--apex-border)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
                    <div className="apex-hover-header apex-label" style={{ padding: '8px 12px' }}>Guardar en…</div>
                    {CLIENTS.map(c => (
                      <button key={c.id} type="button" className="apex-orb-prompt" style={{ width: '100%' }}
                        onClick={() => { addOrbeConversation(c.id, messages); setSaveOpen(false); setSaved(true) }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </header>

            <div className="apex-orb-body" ref={bodyRef}>
              {messages.length === 0 && (
                <div className="apex-orb-empty">
                  <img src="/apex-mark.svg" alt="" width={26} height={26} />
                  <h4>¿En qué te ayudo?</h4>
                  <p>Te digo tus métricas, qué está fallando en tu embudo y cómo cerrar mejor la próxima llamada.</p>
                  <div className="apex-orb-prompts">
                    {suggestedPrompts.map(p => (
                      <button key={p} type="button" className="apex-orb-prompt" onClick={() => setInput(p)}>{p}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`apex-orb-msg apex-orb-msg--${m.role}${m.error ? ' apex-orb-msg--err' : ''}`}>
                  <div className="apex-orb-msg-bubble">{m.body}</div>
                </div>
              ))}
              {busy && (
                <div className="apex-orb-msg apex-orb-msg--assistant">
                  <div className="apex-orb-msg-bubble apex-orb-msg-bubble--thinking">
                    <Loader2 size={11} strokeWidth={1.7} className="apex-spin" />
                    <span>Pensando…</span>
                  </div>
                </div>
              )}
            </div>

            <form className="apex-orb-form" onSubmit={(e) => { e.preventDefault(); send() }}>
              <textarea
                ref={inputRef}
                className="apex-orb-input"
                placeholder="Escribe lo que necesitas…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                rows={1}
                disabled={busy}
              />
              <button type="submit" className="apex-orb-send" disabled={busy || !input.trim()} aria-label="Enviar">
                {busy ? <Loader2 size={12} className="apex-spin" /> : <Send size={12} strokeWidth={1.7} />}
              </button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>

      <style>{ORB_CSS}</style>
    </>
  )
}

const ORB_CSS = `
.apex-orb-btn {
  position: fixed; right: 22px; bottom: 22px; z-index: 850;
  width: 58px; height: 58px; border-radius: 50%; border: 0;
  background: radial-gradient(circle at 32% 30%, #FFFFFF 0%, #F5F4F0 35%, #D8D4CB 65%, #9A958B 100%);
  color: var(--apex-bg-deep, #0a0c12);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  box-shadow:
    0 8px 24px rgba(0,0,0,0.55),
    0 0 32px 4px rgba(255,220,180,0.18),
    inset 0 1px 1px rgba(255,255,255,0.65),
    inset 0 -2px 4px rgba(0,0,0,0.25);
  overflow: visible;
}
.apex-orb-btn[data-open] {
  background: var(--apex-card-bg, #0d0f15); color: var(--apex-plat-hi);
  border: 1px solid var(--apex-plat-mid);
  box-shadow: 0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10);
}
.apex-orb-ring {
  position: absolute; inset: -8px; border-radius: 50%;
  background: conic-gradient(from 0deg, rgba(255,220,180,0) 0deg, rgba(255,220,180,0.4) 40deg, rgba(255,255,255,0.55) 90deg, rgba(255,220,180,0.3) 160deg, rgba(255,220,180,0) 220deg, rgba(255,220,180,0) 360deg);
  filter: blur(6px); opacity: 0.55; pointer-events: none;
  animation: orb-ring-rot 8s linear infinite; z-index: -1;
}
.apex-orb-btn[data-open] .apex-orb-ring { display: none; }
@keyframes orb-ring-rot { to { transform: rotate(360deg); } }
.apex-orb-glow {
  position: absolute; inset: -40%;
  background: radial-gradient(circle, rgba(255,200,150,0.32) 0%, transparent 60%);
  filter: blur(16px); animation: orb-pulse 3.6s ease-in-out infinite; pointer-events: none; z-index: -2;
}
.apex-orb-btn[data-open] .apex-orb-glow { display: none; }
@keyframes orb-pulse { 0%,100% { transform: scale(0.92); opacity: 0.5; } 50% { transform: scale(1.10); opacity: 0.85; } }
.apex-orb-mark { filter: drop-shadow(0 1px 1px rgba(0,0,0,0.25)); position: relative; z-index: 1; }

.apex-orb-panel {
  position: fixed; right: 22px; bottom: 86px; z-index: 851;
  width: 380px; max-width: calc(100vw - 44px); max-height: min(620px, calc(100vh - 120px));
  display: flex; flex-direction: column;
  background: var(--apex-card-bg, #0d0f15); border: 1px solid var(--apex-border);
  box-shadow: 0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 var(--apex-inset-top), inset 0 -1px 0 var(--apex-inset-bot);
}
.apex-orb-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--apex-alpha-3); }
.apex-orb-title { display: inline-flex; align-items: center; gap: 8px; font-family: var(--apex-font); font-size: 12.5px; color: var(--apex-plat-hi); }
.apex-orb-reset { background: transparent; border: 1px solid var(--apex-border); color: var(--apex-plat-low); padding: 4px 8px; font-family: var(--apex-font); font-size: 11px; cursor: pointer; transition: color 0.18s, border-color 0.18s; }
.apex-orb-reset:hover:not(:disabled) { color: var(--apex-plat-hi); border-color: var(--apex-plat-mid); }
.apex-orb-reset:disabled { opacity: 0.4; cursor: not-allowed; }
.apex-orb-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.apex-orb-empty { display: flex; flex-direction: column; gap: 10px; text-align: center; padding: 22px 8px; color: var(--apex-plat-low); }
.apex-orb-empty h4 { margin: 4px 0 0; font-family: var(--apex-font); font-weight: 400; font-size: 14px; color: var(--apex-plat-hi); }
.apex-orb-empty p { margin: 0; font-size: 12px; line-height: 1.5; }
.apex-orb-prompts { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.apex-orb-prompt { text-align: left; padding: 8px 10px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); color: var(--apex-plat-mid); font-family: var(--apex-font); font-size: 11.5px; cursor: pointer; transition: border-color 0.18s, color 0.18s; }
.apex-orb-prompt:hover { border-color: var(--apex-plat-mid); color: var(--apex-plat-hi); }
.apex-orb-msg { display: flex; }
.apex-orb-msg--user { justify-content: flex-end; }
.apex-orb-msg--assistant { justify-content: flex-start; }
.apex-orb-msg-bubble { max-width: 80%; padding: 9px 12px; border: 1px solid var(--apex-border); font-family: var(--apex-font); font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
.apex-orb-msg--user .apex-orb-msg-bubble { background: var(--apex-plat-hi); color: var(--apex-bg-deep, #0a0c12); border-color: var(--apex-plat-hi); }
.apex-orb-msg--assistant .apex-orb-msg-bubble { background: var(--apex-trigger-bg); color: var(--apex-plat-hi); }
.apex-orb-msg-bubble--thinking { display: inline-flex; align-items: center; gap: 6px; color: var(--apex-plat-low); }
.apex-orb-form { display: flex; align-items: flex-end; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--apex-alpha-3); }
.apex-orb-input { flex: 1; resize: none; min-height: 36px; max-height: 120px; padding: 8px 10px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); color: var(--apex-plat-hi); font-family: var(--apex-font); font-size: 12.5px; outline: none; transition: border-color 0.18s; }
.apex-orb-input:focus { border-color: var(--apex-border-strong); }
.apex-orb-send { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; background: var(--apex-plat-hi); color: var(--apex-bg-deep, #0a0c12); border: 1px solid var(--apex-plat-hi); cursor: pointer; transition: background 0.18s, opacity 0.18s; }
.apex-orb-send:hover:not(:disabled) { background: var(--apex-plat-mid); border-color: var(--apex-plat-mid); }
.apex-orb-send:disabled { opacity: 0.4; cursor: not-allowed; }
.apex-spin { animation: apex-spin 1s linear infinite; }
@keyframes apex-spin { to { transform: rotate(360deg); } }
@media (max-width: 480px) {
  .apex-orb-btn { right: 14px; bottom: 14px; width: 48px; height: 48px; }
  .apex-orb-panel { right: 14px; bottom: 76px; width: calc(100vw - 28px); }
}
`
