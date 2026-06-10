import { useState, useEffect, useRef } from 'react'
import { teamChat, teamChatSend } from '../lib/profileApi'
import { getUserId } from '../lib/config'

/*
 * Chat de equipo — la empresa y los closers aceptados del equipo hablan aquí.
 * Refresca cada pocos segundos (polling simple). Se abre/cierra inline.
 */
export default function TeamChat({ teamId, title }) {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const me = getUserId()
  const bodyRef = useRef(null)

  const load = () => teamChat(teamId).then(setMsgs).catch(() => {})
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [teamId])
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [msgs.length])

  const send = async () => {
    const t = input.trim(); if (!t) return
    setInput('')
    setMsgs(m => [...m, { id: 'tmp' + Date.now(), user_id: me, body: t, author: 'Tú' }])
    await teamChatSend(teamId, t).catch(() => {})
    load()
  }

  return (
    <div className="tc">
      <div className="tc-head">{title || 'Chat del equipo'}</div>
      <div className="tc-body" ref={bodyRef}>
        {msgs.length === 0 && <div className="tc-empty">Aún no hay mensajes. Escribe el primero.</div>}
        {msgs.map(m => (
          <div key={m.id} className={`tc-msg ${m.user_id === me ? 'tc-msg--me' : ''}`}>
            {m.user_id !== me && <span className="tc-author">{m.author}</span>}
            <div className="tc-bubble">{m.body}</div>
          </div>
        ))}
      </div>
      <form className="tc-form" onSubmit={e => { e.preventDefault(); send() }}>
        <input className="tc-input" placeholder="Escribe un mensaje…" value={input} onChange={e => setInput(e.target.value)} />
        <button className="tc-send" type="submit" aria-label="Enviar">→</button>
      </form>
      <style>{TC_CSS}</style>
    </div>
  )
}

const TC_CSS = `
.tc { display: flex; flex-direction: column; height: 340px; border: 1px solid var(--apex-border); border-radius: var(--apex-radius-sm, 8px); overflow: hidden; margin-top: 12px; background: var(--apex-trigger-bg); }
.tc-head { padding: 10px 14px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--apex-plat-low); border-bottom: 1px solid var(--apex-alpha-3); }
.tc-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.tc-empty { color: var(--apex-plat-low); font-size: 12.5px; text-align: center; margin: auto; }
.tc-msg { display: flex; flex-direction: column; align-items: flex-start; max-width: 80%; }
.tc-msg--me { align-self: flex-end; align-items: flex-end; }
.tc-author { font-size: 10.5px; color: var(--apex-plat-low); margin: 0 0 2px 2px; }
.tc-bubble { padding: 8px 12px; font-size: 13px; line-height: 1.45; border-radius: 12px; background: var(--apex-card-bg); border: 1px solid var(--apex-border); color: var(--apex-plat-hi); white-space: pre-wrap; word-break: break-word; }
.tc-msg--me .tc-bubble { background: var(--apex-accent, var(--apex-plat-hi)); color: var(--apex-accent-ink, var(--apex-bg)); border-color: var(--apex-accent, var(--apex-plat-hi)); }
.tc-form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid var(--apex-alpha-3); }
.tc-input { flex: 1; background: var(--apex-card-bg); border: 1px solid var(--apex-border); color: var(--apex-plat-hi); font-family: var(--apex-font); font-size: 13px; padding: 9px 11px; outline: none; border-radius: var(--apex-radius-sm, 6px); }
.tc-input:focus { border-color: var(--apex-plat-mid); }
.tc-send { width: 38px; flex: 0 0 38px; background: var(--apex-accent, var(--apex-plat-hi)); color: var(--apex-accent-ink, var(--apex-bg)); border: 0; border-radius: var(--apex-radius-sm, 6px); cursor: pointer; font-size: 16px; }
`
