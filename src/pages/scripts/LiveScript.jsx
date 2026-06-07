import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getScript, saveCallResult } from '../../lib/scripts'
import { addReportEntry, addSale } from '../../lib/metrics'
import { getClient } from '../../data/mock/clients'
import { MOCK_LEADS } from '../../data/mock/leads'
import { RESULTS } from '../../data/mock/scriptTemplate'
import { API_BASE } from '../../lib/config'

/*
 * Modo llamada en vivo — teleprompter del guion del cliente. Te vas guiando por
 * las fases (qué decir + consejos), con objeciones y tonalidades a mano. Al
 * terminar, registras el resultado (se asocia al cliente y, opcional, al lead).
 * La transcripción automática + actualizar pipeline se deja para más adelante.
 */
const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }

export default function LiveScript() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const client = getClient(clientId)
  const script = getScript(clientId)
  const phases = script.phases || []

  const [i, setI] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const [notes, setNotes] = useState('')
  const [leadId, setLeadId] = useState('')
  const [amount, setAmount] = useState('')
  const [cash, setCash] = useState('')
  const [start] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  // Copiloto en vivo (Live Call Support)
  const [coSit, setCoSit] = useState('')
  const [coSug, setCoSug] = useState(null)
  const [coBusy, setCoBusy] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [start])

  // Navegación por teclado del teleprompter: ←/→ (y espacio = siguiente) para
  // moverte entre fases sin tocar el ratón durante la llamada. Se desactiva si
  // estás escribiendo en un campo o en la pantalla de registro.
  useEffect(() => {
    if (finishing) return
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setI(v => Math.min(phases.length - 1, v + 1)) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setI(v => Math.max(0, v - 1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finishing, phases.length])

  if (!client) {
    return <div className="live-wrap"><div className="apex-card ac-empty">Cliente no encontrado. <Link to="/scripts">Volver a Scripts</Link></div></div>
  }

  const leads = MOCK_LEADS.filter(l => l.client_id === clientId)
  const phase = phases[i] || phases[0]
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`

  function register() {
    saveCallResult(clientId, { outcome, notes, lead_id: leadId || null, duration_min: Math.round(elapsed / 60), revenue: Number(amount || 0), cash_collected: Number(cash || 0) })
    // Suma automática al reporte diario (siempre, tras rellenarlo).
    addReportEntry({
      client_id: clientId, date: new Date().toISOString(),
      scheduled: 1,
      realizadas: outcome === 'no_show' ? 0 : 1,
      offers: ['won', 'deposit', 'lost'].includes(outcome) ? 1 : 0,
      deposits: outcome === 'deposit' ? 1 : 0,
      closes: outcome === 'won' ? 1 : 0,
    })
    // Si es Cierre o Depósito, reporta la venta a Finanzas.
    if (outcome === 'won' || outcome === 'deposit') {
      addSale({
        client_id: clientId, date: new Date().toISOString(),
        revenue: Number(amount || 0),
        cash_collected: Number(cash || (outcome === 'won' ? amount : 0) || 0),
        payment_type: outcome === 'deposit' ? 'Cuotas' : 'Pago único',
      })
    }
    navigate(`/clientes/${clientId}`)
  }

  // Copiloto en vivo: dada la situación/objeción actual, sugiere qué decir ya.
  async function askCopilot(situation) {
    const sit = (situation || coSit).trim()
    if (!sit || coBusy) return
    setCoBusy(true); setCoSug(null)
    try {
      const res = await fetch(`${API_BASE}/api/orbe?action=live-support`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation: sit, clientName: client.name, objections: script.objections, tonalities: script.tonalities }),
      })
      const d = await res.json().catch(() => ({}))
      setCoSug(res.ok ? (d.suggestion || '—') : 'No pude sugerir (¿LLM local arrancado?).')
    } catch { setCoSug('Sin conexión con el copiloto.') }
    finally { setCoBusy(false) }
  }

  return (
    <div className="live-wrap">
      <style>{LIVE_CO_CSS}</style>
      <div className="live-bar">
        <Link to="/scripts" className="home-link">← Salir</Link>
        <span className="live-client">{client.name}</span>
        <span className="live-timer">{mmss}</span>
      </div>

      {!finishing ? (
        <div className="live-main">
          <aside className="live-rail">
            {phases.map((p, idx) => (
              <button key={p.id} className="live-rail-item" data-active={idx === i || undefined} data-done={idx < i || undefined} onClick={() => setI(idx)}>
                <span className="live-rail-n">{idx + 1}</span>{p.title}
              </button>
            ))}
          </aside>

          <div className="live-stage">
            <div className="live-progress"><div className="live-progress-fill" style={{ width: `${Math.round(((i + 1) / phases.length) * 100)}%` }} /></div>
            <h2 className="live-phase-title">{phase.title}</h2>
            <ul className="live-lines">{phase.lines.filter(Boolean).map((l, k) => <li key={k}>{l}</li>)}</ul>
            {phase.tips?.filter(Boolean).length > 0 && (
              <div className="live-tips">
                <div className="live-tips-h">Consejos</div>
                {phase.tips.filter(Boolean).map((t, k) => <div className="live-tip" key={k}>{t}</div>)}
              </div>
            )}
            <div className="live-nav">
              <button className="ac-btn" style={ghost} disabled={i === 0} onClick={() => setI(i - 1)}>← Anterior</button>
              {i < phases.length - 1
                ? <button className="ac-btn" onClick={() => setI(i + 1)}>Siguiente →</button>
                : <button className="ac-btn" onClick={() => setFinishing(true)}>Terminar y registrar</button>}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--apex-plat-low)', letterSpacing: '0.02em' }}>
              Atajos: ← → cambian de fase · espacio = siguiente
            </div>
          </div>

          <aside className="live-side">
            <div className="live-side-h">Copiloto en vivo</div>
            <div className="live-copilot">
              <div className="live-co-chips">
                {(script.objections || []).slice(0, 5).map((o, k) => (
                  <button key={k} type="button" className="live-co-chip" onClick={() => { setCoSit(o.trigger); askCopilot(o.trigger) }} disabled={coBusy}>{o.trigger}</button>
                ))}
              </div>
              <div className="live-co-input">
                <input className="ac-input" placeholder="¿Qué está pasando ahora?" value={coSit}
                  onChange={e => setCoSit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') askCopilot() }} />
                <button type="button" className="ac-btn" onClick={() => askCopilot()} disabled={coBusy || !coSit.trim()}>{coBusy ? '…' : 'Sugerir'}</button>
              </div>
              {coSug && <div className="live-co-sug">{coSug}</div>}
            </div>

            <div className="live-side-h" style={{ marginTop: 16 }}>Objeciones</div>
            {script.objections?.map((o, k) => (
              <div className="live-obj" key={k}><div className="live-obj-t">{o.trigger}</div><div className="live-obj-r">{o.response}</div></div>
            ))}
            <div className="live-side-h" style={{ marginTop: 16 }}>Tonalidades</div>
            {script.tonalities?.map((t, k) => <div className="live-ton" key={k}>{t}</div>)}
          </aside>
        </div>
      ) : (
        <div className="live-result apex-card">
          <h2 style={{ margin: '0 0 16px', fontWeight: 400 }}>¿Cómo terminó la llamada?</h2>
          <div className="live-outcomes">
            {RESULTS.map(r => (
              <button key={r.key} className="live-outcome" data-sel={outcome === r.key || undefined} onClick={() => setOutcome(r.key)}>{r.label}</button>
            ))}
          </div>

          {(outcome === 'won' || outcome === 'deposit') && (
            <div className="live-sale">
              <div>
                <label className="sc-lbl">{outcome === 'won' ? 'Importe del cierre (€)' : 'Importe total (€)'}</label>
                <input className="ac-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="sc-lbl">Cash cobrado (€)</label>
                <input className="ac-input" type="number" value={cash} onChange={e => setCash(e.target.value)} placeholder="0" />
              </div>
            </div>
          )}

          <label className="sc-lbl">Lead asociado (opcional)</label>
          <select className="ac-input" value={leadId} onChange={e => setLeadId(e.target.value)}>
            <option value="">— Sin asociar —</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <label className="sc-lbl">Notas</label>
          <textarea className="ac-input" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Qué pasó, objeciones, próximos pasos…" />
          <div className="live-nav">
            <button className="ac-btn" style={ghost} onClick={() => setFinishing(false)}>← Volver al guion</button>
            <button className="ac-btn" disabled={!outcome} onClick={register}>Registrar resultado</button>
          </div>
          <p className="set-note">La automatización (transcripción + actualizar el pipeline) llega más adelante; por ahora registramos el resultado a mano.</p>
        </div>
      )}
    </div>
  )
}

const LIVE_CO_CSS = `
.live-copilot { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
.live-co-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.live-co-chip { background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); color: var(--apex-plat-mid); font-family: var(--apex-font); font-size: 10.5px; padding: 3px 7px; cursor: pointer; }
.live-co-chip:hover:not(:disabled) { color: var(--apex-plat-hi); border-color: var(--apex-plat-mid); }
.live-co-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.live-co-input { display: flex; gap: 6px; }
.live-co-input .ac-input { flex: 1; min-width: 0; }
.live-co-sug { padding: 9px 11px; background: color-mix(in srgb, #6FCF9C 12%, var(--apex-trigger-bg)); border: 1px solid color-mix(in srgb, #6FCF9C 40%, var(--apex-border)); color: var(--apex-plat-hi); font-size: 12.5px; line-height: 1.5; }
`

