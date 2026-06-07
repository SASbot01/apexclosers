import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import { getClient } from '../../data/mock/clients'
import { API_BASE } from '../../lib/config'

/*
 * Roleplay — practica tu pitch contra un CLIENTE simulado por el LLM local. La
 * IA interpreta a un prospect realista (con objeciones); al terminar, te evalúa.
 */
const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }
const DIFFS = [['facil', 'Fácil'], ['realista', 'Realista'], ['duro', 'Duro']]

async function call(action, body) {
  const res = await fetch(`${API_BASE}/api/orbe?action=${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'error')
  return d
}

export default function Roleplay() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const client = getClient(clientId)
  const clientName = client?.name || ''
  const [difficulty, setDifficulty] = useState('realista')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)
  const [evaluation, setEvaluation] = useState(null)
  const bodyRef = useRef(null)

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [messages, busy])

  const start = async () => {
    setStarted(true); setBusy(true); setEvaluation(null)
    try {
      const d = await call('roleplay', { messages: [], clientName, difficulty })
      setMessages([{ role: 'assistant', body: d.reply }])
    } catch { setMessages([{ role: 'assistant', body: 'No pude arrancar el roleplay (¿LLM local arrancado?).' }]) }
    finally { setBusy(false) }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user', body: text }]
    setMessages(next); setInput(''); setBusy(true)
    try {
      const d = await call('roleplay', { messages: next, clientName, difficulty })
      setMessages([...next, { role: 'assistant', body: d.reply }])
    } catch { setMessages([...next, { role: 'assistant', body: '…' }]) }
    finally { setBusy(false) }
  }

  const evaluate = async () => {
    if (busy || messages.length < 2) return
    setBusy(true)
    try { const d = await call('roleplay-eval', { messages, clientName }); setEvaluation(d.evaluation) }
    catch { setEvaluation('No pude evaluar ahora mismo.') }
    finally { setBusy(false) }
  }
  const reset = () => { setMessages([]); setStarted(false); setEvaluation(null); setInput('') }

  return (
    <>
      <FloatingHeader title="Roleplay" eyebrow="ENTRENAMIENTO" actions={
        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <Link to="/scripts" className="ac-btn" style={{ ...ghost, textDecoration: 'none' }}>← Guion</Link>
          {started && <button className="ac-btn" style={ghost} onClick={reset}>Reiniciar</button>}
        </div>
      } />

      <section className="apex-section">
        <div className="apex-card" style={{ padding: 20, maxWidth: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'var(--apex-plat-mid)' }}>Cliente simulado: <b>{clientName || 'genérico'}</b></span>
            <div className="seg">
              {DIFFS.map(([k, l]) => <button key={k} className="seg-btn" data-active={difficulty === k || undefined} onClick={() => setDifficulty(k)} disabled={started}>{l}</button>)}
            </div>
            {!started && <button className="ac-btn" onClick={start} disabled={busy}>▶ Empezar roleplay</button>}
            {started && !evaluation && <button className="ac-btn" style={ghost} onClick={evaluate} disabled={busy || messages.length < 2}>Terminar y evaluar</button>}
          </div>

          {!started && <p className="set-note" style={{ margin: 0 }}>La IA interpreta a un cliente realista con objeciones. Cierra como si fuera real. Al terminar te puntúa y te da feedback.</p>}

          {started && (
            <>
              <div ref={bodyRef} className="rp-body">
                {messages.map((m, i) => (
                  <div key={i} className={`rp-msg rp-msg--${m.role}`}>
                    <span className="rp-who">{m.role === 'user' ? 'Tú' : 'Cliente'}</span>
                    <div className="rp-bubble">{m.body}</div>
                  </div>
                ))}
                {busy && <div className="rp-msg rp-msg--assistant"><span className="rp-who">Cliente</span><div className="rp-bubble rp-bubble--think">…</div></div>}
              </div>
              {!evaluation && (
                <form className="apex-orb-form" style={{ padding: '10px 0 0' }} onSubmit={e => { e.preventDefault(); send() }}>
                  <textarea className="apex-orb-input" rows={1} placeholder="Lo que le dices al cliente…" value={input}
                    onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} disabled={busy} />
                  <button className="apex-orb-send" type="submit" disabled={busy || !input.trim()}>→</button>
                </form>
              )}
            </>
          )}

          {evaluation && (
            <div className="rp-eval">
              <Prose text={evaluation} />
              <button className="ac-btn" style={{ ...ghost, marginTop: 8 }} onClick={reset}>Otro roleplay</button>
            </div>
          )}
        </div>
      </section>

      <style>{RP_CSS}</style>
    </>
  )
}

function Prose({ text }) {
  if (!text) return null
  const out = []; let list = null
  const flush = (k) => { if (list) { out.push(<ul key={'u' + k}>{list}</ul>); list = null } }
  text.split('\n').forEach((ln, i) => {
    const t = ln.trim()
    if (t.startsWith('## ')) { flush(i); out.push(<h4 key={i} style={{ margin: '12px 0 6px', fontWeight: 500 }}>{t.slice(3)}</h4>) }
    else if (t.startsWith('- ')) { (list = list || []).push(<li key={'l' + i}>{t.slice(2)}</li>) }
    else if (t) { flush(i); out.push(<p key={i} style={{ margin: '4px 0' }}>{t}</p>) }
  })
  flush('end')
  return <div className="prose" style={{ fontSize: 13.5, color: 'var(--apex-plat-mid)', lineHeight: 1.55 }}>{out}</div>
}

const RP_CSS = `
.rp-body { display: flex; flex-direction: column; gap: 10px; max-height: 52vh; overflow-y: auto; padding: 14px 2px; }
.rp-msg { display: flex; flex-direction: column; gap: 3px; max-width: 82%; }
.rp-msg--user { align-self: flex-end; align-items: flex-end; }
.rp-msg--assistant { align-self: flex-start; }
.rp-who { font-size: 10px; color: var(--apex-plat-low); text-transform: uppercase; letter-spacing: 0.06em; }
.rp-bubble { padding: 9px 12px; border: 1px solid var(--apex-border); font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
.rp-msg--user .rp-bubble { background: var(--apex-plat-hi); color: var(--apex-bg-deep, #0a0c12); border-color: var(--apex-plat-hi); }
.rp-msg--assistant .rp-bubble { background: var(--apex-trigger-bg); color: var(--apex-plat-hi); }
.rp-bubble--think { color: var(--apex-plat-low); }
.rp-eval { border-top: 1px solid var(--apex-alpha-3); margin-top: 12px; padding-top: 8px; }
`
