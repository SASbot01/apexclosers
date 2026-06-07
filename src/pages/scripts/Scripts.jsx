import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import HoverMenu from '../../components/HoverMenu'
import SegTabs from '../../components/SegTabs'
import { CLIENTS, clientName } from '../../data/mock/clients'

const CALLS_TABS = [{ to: '/llamadas', label: 'Llamadas' }, { to: '/scripts', label: 'Guion' }, { to: '/calendario', label: 'Calendario' }]
import { useScript, listCallResults } from '../../lib/scripts'
import { resultLabel } from '../../data/mock/scriptTemplate'
import { fmtDateTime } from '../../lib/format'
import { API_BASE } from '../../lib/config'

/*
 * Scripts — guion de llamada por cliente (método Apex). Ver/editar las fases +
 * consejos, lanzar la llamada en vivo (teleprompter) y ver el historial de
 * resultados registrados.
 */
const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }
const clone = (o) => JSON.parse(JSON.stringify(o))

export default function Scripts() {
  const [clientId, setClientId] = useState(CLIENTS[0].id)
  const { script, save } = useScript(clientId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [optimizing, setOptimizing] = useState(false)
  const [optMsg, setOptMsg] = useState(null)
  const navigate = useNavigate()
  const results = listCallResults(clientId)
  const data = editing ? draft : script

  const startEdit = () => { setDraft(clone(script)); setEditing(true) }
  const commit = () => { save(draft); setEditing(false); setDraft(null) }
  const cancel = () => { setEditing(false); setDraft(null) }
  const pickClient = (id) => { setClientId(id); cancel(); setOptMsg(null) }

  // Optimiza el guion con el LLM local usando los resultados reales del cliente.
  // El resultado entra en modo edición para que el closer lo revise y guarde.
  async function optimize() {
    if (optimizing) return
    setOptimizing(true); setOptMsg(null)
    try {
      const res = await fetch(`${API_BASE}/api/orbe?action=optimize-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, results, clientName: clientName(clientId) }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.script?.phases) {
        setDraft(d.script); setEditing(true)
        setOptMsg({ ok: true, text: 'Guion optimizado por la IA. Revísalo y dale a Guardar para fijarlo.' })
      } else {
        setOptMsg({ ok: false, text: d.error === 'no_llm_configured' ? 'No hay LLM local activo. Arranca Ollama para optimizar.' : 'No pude optimizar el guion ahora mismo. ¿Backend local y Ollama arrancados?' })
      }
    } catch {
      setOptMsg({ ok: false, text: 'No pude conectar con el Orbe (backend local).' })
    } finally {
      setOptimizing(false)
    }
  }

  const patch = (idx, field, value) => setDraft(d => { const n = clone(d); n.phases[idx][field] = value; return n })
  const setLines = (idx, text) => patch(idx, 'lines', text.split('\n'))
  const setTips = (idx, text) => patch(idx, 'tips', text.split('\n'))
  const addPhase = () => setDraft(d => { const n = clone(d); n.phases.push({ id: 'fase' + Date.now(), title: 'Nueva fase', lines: [''], tips: [] }); return n })
  const delPhase = (idx) => setDraft(d => { const n = clone(d); n.phases.splice(idx, 1); return n })

  return (
    <>
      <FloatingHeader title="Guion" eyebrow="LLAMADAS" actions={
        <div className="apex-filter-bar">
          <SegTabs tabs={CALLS_TABS} />
          <HoverMenu label="Cliente" value={clientName(clientId)}>
            {CLIENTS.map(c => <HoverMenu.Item key={c.id} selected={c.id === clientId} onSelect={() => pickClient(c.id)}>{c.name}</HoverMenu.Item>)}
          </HoverMenu>
          {!editing ? (
            <>
              <button className="ac-btn" onClick={() => navigate(`/scripts/live/${clientId}`)}>▶ Iniciar llamada</button>
              <button className="ac-btn" style={ghost} onClick={optimize} disabled={optimizing} title="Mejora el guion con la IA local usando los resultados reales de este cliente">
                {optimizing ? 'Optimizando…' : '✦ Optimizar con IA'}
              </button>
              <button className="ac-btn" style={ghost} onClick={startEdit}>Editar</button>
            </>
          ) : (
            <>
              <button className="ac-btn" onClick={commit}>Guardar</button>
              <button className="ac-btn" style={ghost} onClick={cancel}>Cancelar</button>
            </>
          )}
        </div>
      } />

      <section className="apex-section">
        {optMsg && (
          <div className="apex-card" style={{ padding: '12px 16px', marginBottom: 12, fontSize: 12.5, color: optMsg.ok ? 'var(--apex-plat-hi)' : 'var(--apex-plat-mid)', borderColor: optMsg.ok ? 'var(--apex-plat-mid)' : 'var(--apex-border)' }}>
            {optMsg.ok ? '✦ ' : ''}{optMsg.text}
          </div>
        )}
        {data.phases.map((p, idx) => (
          <div className="apex-card sc-phase" key={p.id}>
            {!editing ? (
              <>
                <div className="sc-phase-head"><span className="sc-step">{idx + 1}</span><h3>{p.title}</h3></div>
                <ul className="sc-lines">{p.lines.filter(Boolean).map((l, k) => <li key={k}>{l}</li>)}</ul>
                {p.tips?.filter(Boolean).length > 0 && (
                  <div className="sc-tips">{p.tips.filter(Boolean).map((t, k) => <div className="sc-tip" key={k}>{t}</div>)}</div>
                )}
              </>
            ) : (
              <>
                <div className="sc-edit-head">
                  <input className="ac-input" value={p.title} onChange={e => patch(idx, 'title', e.target.value)} />
                  <button className="set-btn" onClick={() => delPhase(idx)}>Eliminar</button>
                </div>
                <label className="sc-lbl">Qué decir / preguntar (una línea por punto)</label>
                <textarea className="ac-input" rows={4} value={p.lines.join('\n')} onChange={e => setLines(idx, e.target.value)} />
                <label className="sc-lbl">Consejos (una línea por consejo)</label>
                <textarea className="ac-input" rows={2} value={(p.tips || []).join('\n')} onChange={e => setTips(idx, e.target.value)} />
              </>
            )}
          </div>
        ))}
        {editing && <button className="ac-btn" style={ghost} onClick={addPhase}>+ Añadir fase</button>}
      </section>

      <section className="apex-section apex-grid-2">
        <div className="apex-card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 14px', fontWeight: 400 }}>Objeciones</h3>
          {data.objections?.map((o, k) => (
            <div className="sc-obj" key={k}><div className="sc-obj-t">{o.trigger}</div><div className="sc-obj-r">{o.response}</div></div>
          ))}
        </div>
        <div className="apex-card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 14px', fontWeight: 400 }}>Tonalidades</h3>
          {data.tonalities?.map((t, k) => <div className="sc-ton" key={k}>{t}</div>)}
          <h3 style={{ margin: '22px 0 12px', fontWeight: 400 }}>Resultados recientes</h3>
          {results.length === 0 && <p className="ac-empty" style={{ padding: 0 }}>Aún no hay llamadas registradas para este cliente.</p>}
          <div className="home-list">
            {results.slice(0, 6).map(r => (
              <div key={r.id} className="home-row home-row--split">
                <span className="home-row-title">{resultLabel(r.outcome)}{r.notes ? ` · ${r.notes.slice(0, 40)}` : ''}</span>
                <span className="home-row-date">{fmtDateTime(r.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
