import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getScript, saveCallResult } from '../../lib/scripts'
import { addReportEntry, addSale } from '../../lib/metrics'
import { getClient } from '../../data/mock/clients'
import { MOCK_LEADS } from '../../data/mock/leads'
import { RESULTS } from '../../data/mock/scriptTemplate'

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

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
  }, [start])

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

  return (
    <div className="live-wrap">
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
          </div>

          <aside className="live-side">
            <div className="live-side-h">Objeciones</div>
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
