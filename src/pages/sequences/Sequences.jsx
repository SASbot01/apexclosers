import { useState, useEffect } from 'react'
import FloatingHeader from '../../components/FloatingHeader'
import { listSequences, saveSequence, deleteSequence, listTasks } from '../../lib/workflowApi'

/*
 * Secuencias (Workflow) — Configuración de Secuencias de seguimiento. Cada
 * secuencia se dispara por un ESTADO de llamada y ejecuta pasos
 * {tiempo, canal, tipo, mensaje}. Las tareas vencidas las ejecuta el cron y
 * generan notificaciones. (El envío real por Email/WhatsApp/SMS llega con las
 * Integraciones.)
 */
const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }
const STATES = [
  { k: 'follow_up_hot', l: 'Follow-up HOT' },
  { k: 'follow_up_nurture', l: 'Follow-up Nurture' },
  { k: 'no_show', l: 'No-show' },
  { k: 'deposito', l: 'Depósito' },
  { k: 'perdido', l: 'Perdido' },
  { k: 'ganada', l: 'Ganada' },
  { k: 'any', l: 'Cualquiera' },
]
const stateLabel = (k) => STATES.find(s => s.k === k)?.l || k
const CHANNELS = ['email', 'whatsapp', 'sms']
const TYPES = [['seguimiento', 'Seguimiento'], ['confirmacion', 'Confirmación']]
const emptyStep = () => ({ delay_hours: 24, channel: 'email', type: 'seguimiento', message: '' })

export default function Sequences() {
  const [seqs, setSeqs] = useState([])
  const [tasks, setTasks] = useState([])
  const [pending, setPending] = useState(0)
  const [draft, setDraft] = useState(null)
  const [state, setState] = useState('loading')

  const load = () => {
    listSequences().then(d => { setSeqs(d.sequences || []); setPending(d.pendingTasks || 0); setState('live') }).catch(() => setState('error'))
    listTasks().then(setTasks).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const newSeq = () => setDraft({ name: 'Nueva secuencia', trigger_state: 'follow_up_hot', active: true, steps: [emptyStep()] })
  const editSeq = (s) => setDraft({ ...s, steps: s.steps?.length ? s.steps : [emptyStep()] })
  const save = async () => {
    try { await saveSequence(draft); setDraft(null); load() } catch { alert('No pude guardar la secuencia.') }
  }
  const remove = async (id) => { if (window.confirm('¿Eliminar la secuencia?')) { await deleteSequence(id).catch(() => {}); load() } }

  const setStep = (i, k, v) => setDraft(d => ({ ...d, steps: d.steps.map((s, j) => j === i ? { ...s, [k]: v } : s) }))

  return (
    <>
      <FloatingHeader title="Secuencias" eyebrow="WORKFLOW" actions={<button className="ac-btn" onClick={newSeq}>+ Secuencia</button>} />

      <section className="apex-section">
        <p className="set-note" style={{ margin: 0 }}>
          Define qué seguimientos se disparan según cómo termina la llamada. Cuando una llamada se clasifica en ese estado, se crean las tareas y el sistema te notifica cuando toca. {pending > 0 && <b>{pending} tarea(s) pendiente(s).</b>}
        </p>
        {state === 'error' && <div className="apex-card" style={{ padding: 16, color: 'var(--apex-plat-mid)' }}>No pude cargar (¿backend?).</div>}
      </section>

      {draft && (
        <section className="apex-section">
          <div className="apex-card" style={{ padding: 24, display: 'grid', gap: 14, maxWidth: 720 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="sc-lbl">Nombre</label>
                <input className="ac-input" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <label className="sc-lbl">Se dispara cuando la llamada es…</label>
                <select className="ac-input" value={draft.trigger_state} onChange={e => setDraft({ ...draft, trigger_state: e.target.value })}>
                  {STATES.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}
                </select>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-end', fontSize: 13, color: 'var(--apex-plat-mid)' }}>
                <input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Activa
              </label>
            </div>

            <div>
              <label className="sc-lbl">Pasos</label>
              {draft.steps.map((s, i) => (
                <div key={i} className="apex-card" style={{ padding: 12, marginBottom: 8, display: 'grid', gridTemplateColumns: '90px 120px 130px 1fr auto', gap: 8, alignItems: 'center' }}>
                  <div>
                    <input className="ac-input" type="number" min="0" value={s.delay_hours} onChange={e => setStep(i, 'delay_hours', e.target.value)} title="Horas tras la llamada" />
                    <span style={{ fontSize: 10, color: 'var(--apex-plat-low)' }}>horas</span>
                  </div>
                  <select className="ac-input" value={s.channel} onChange={e => setStep(i, 'channel', e.target.value)}>
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="ac-input" value={s.type} onChange={e => setStep(i, 'type', e.target.value)}>
                    {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  <input className="ac-input" placeholder="Mensaje / plantilla" value={s.message} onChange={e => setStep(i, 'message', e.target.value)} />
                  <button className="sales-mini sales-mini--del" onClick={() => setDraft(d => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
              <button className="ac-btn" style={ghost} onClick={() => setDraft(d => ({ ...d, steps: [...d.steps, emptyStep()] }))}>+ Paso</button>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="ac-btn" style={ghost} onClick={() => setDraft(null)}>Cancelar</button>
              <button className="ac-btn" onClick={save}>Guardar secuencia</button>
            </div>
          </div>
        </section>
      )}

      <section className="apex-section">
        {seqs.length === 0 && state === 'live' && !draft && <div className="apex-card" style={{ padding: 18, color: 'var(--apex-plat-low)' }}>Sin secuencias. Crea una para automatizar tus seguimientos.</div>}
        {seqs.map(s => (
          <div className="apex-card" key={s.id} style={{ padding: 18, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 14, color: 'var(--apex-plat-hi)' }}>{s.name}</span>
                <span className="sales-badge" style={{ '--c': s.active ? '#6FCF9C' : 'var(--apex-plat-low)', marginLeft: 10 }}>{s.active ? 'Activa' : 'Pausada'}</span>
                <div style={{ fontSize: 12, color: 'var(--apex-plat-low)', marginTop: 4 }}>Dispara en: <b>{stateLabel(s.trigger_state)}</b> · {(s.steps || []).length} paso(s)</div>
              </div>
              <div style={{ display: 'inline-flex', gap: 6 }}>
                <button className="sales-mini" onClick={() => editSeq(s)}>Editar</button>
                <button className="sales-mini sales-mini--del" onClick={() => remove(s.id)}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {tasks.length > 0 && (
        <section className="apex-section">
          <h3 style={{ margin: '0 0 8px', fontWeight: 400 }}>Tareas de seguimiento</h3>
          <div className="apex-card" style={{ padding: 0 }}>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Cuándo</th><th>Canal</th><th>Tipo</th><th>Mensaje</th><th>Estado</th></tr></thead>
                <tbody>
                  {tasks.slice(0, 30).map(t => (
                    <tr key={t.id}>
                      <td>{t.run_at ? new Date(t.run_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td>{t.channel}</td>
                      <td>{t.type === 'confirmacion' ? 'Confirmación' : 'Seguimiento'}</td>
                      <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.message || '—'}</td>
                      <td><span className="sales-badge" style={{ '--c': t.status === 'sent' ? '#6FCF9C' : '#F2A765' }}>{t.status === 'sent' ? 'Hecha' : 'Pendiente'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
