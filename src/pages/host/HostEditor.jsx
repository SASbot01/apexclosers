// Editor de la página de reserva del closer (el botón "Host" del Calendario).
// Edita slug/enlace, disponibilidad por día, duraciones, formulario de intake,
// tipo de ubicación, en qué cuenta de Google se crea el evento y el proyecto al
// que se atribuyen las reservas. Guarda contra /api/host?action=save.
import { useState, useEffect } from 'react'
import { getHostPage, saveHostPage } from '../../lib/hostApi'

const DAYS = [['mon', 'Lun'], ['tue', 'Mar'], ['wed', 'Mié'], ['thu', 'Jue'], ['fri', 'Vie'], ['sat', 'Sáb'], ['sun', 'Dom']]
const FIELD_TYPES = [['text', 'Texto'], ['email', 'Email'], ['tel', 'Teléfono'], ['textarea', 'Texto largo'], ['select', 'Desplegable']]
const origin = () => (typeof window !== 'undefined' ? window.location.origin : 'https://apex-closers.com')

export default function HostEditor({ onClose }) {
  const [page, setPage] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [state, setState] = useState('loading')   // loading | ready | error
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getHostPage()
      .then(d => { setPage(normalize(d.page)); setAccounts(d.accounts || []); setState('ready') })
      .catch(() => setState('error'))
  }, [])

  const set = (patch) => setPage(p => ({ ...p, ...patch }))

  // availability: una ventana por día en el editor (el modelo admite varias).
  const dayWin = (key) => (page.availability?.[key] || [])[0] || null
  const setDay = (key, win) => set({ availability: { ...page.availability, [key]: win ? [win] : [] } })

  const save = async () => {
    setSaving(true); setMsg('')
    try {
      const d = await saveHostPage(page)
      setPage(normalize(d.page)); setMsg('Guardado ✓')
    } catch (e) {
      setMsg(e.message === 'slug_taken' ? 'Ese enlace ya está cogido, elige otro.' : 'No se pudo guardar.')
    } finally { setSaving(false) }
  }

  const link = page ? `${origin()}/agenda/${page.slug || ''}` : ''
  const copy = () => { navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {}) }

  return (
    <div className="he-overlay" onClick={onClose}>
      <div className="he-modal apex-card" onClick={e => e.stopPropagation()}>
        <header className="he-head">
          <div><h2 style={{ margin: 0, fontWeight: 500 }}>Host · tu enlace de agenda</h2><p className="set-note" style={{ margin: '2px 0 0' }}>Comparte tu enlace para que reserven contigo. Los huecos salen de tu disponibilidad menos lo ocupado en Google.</p></div>
          <button className="he-x" onClick={onClose}>✕</button>
        </header>

        {state === 'loading' && <div style={{ padding: 24, color: 'var(--apex-plat-low)' }}>Cargando…</div>}
        {state === 'error' && <div style={{ padding: 24, color: 'var(--apex-plat-mid)' }}>No pude cargar tu agenda (¿backend?).</div>}

        {state === 'ready' && page && <div className="he-body">
          {/* Enlace */}
          <Section title="Tu enlace público">
            <div className="he-link">
              <span className="he-link-base">{origin()}/agenda/</span>
              <input value={page.slug || ''} onChange={e => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="tu-nombre" />
              <button className="ac-btn" onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar'}</button>
              <a className="ac-btn" href={link} target="_blank" rel="noreferrer">Ver</a>
            </div>
          </Section>

          {/* Presentación */}
          <Section title="Presentación">
            <Field label="Título"><input value={page.title || ''} onChange={e => set({ title: e.target.value })} /></Field>
            <Field label="Descripción"><textarea rows={2} value={page.description || ''} onChange={e => set({ description: e.target.value })} /></Field>
            <div className="he-row">
              <Field label="Color"><input type="color" value={page.color || '#7c5cff'} onChange={e => set({ color: e.target.value })} style={{ width: 48, height: 34, padding: 2 }} /></Field>
              <Field label="Duraciones (min, separadas por coma)"><input value={(page.durations || []).join(', ')} onChange={e => set({ durations: e.target.value.split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean) })} /></Field>
            </div>
          </Section>

          {/* Disponibilidad */}
          <Section title="Disponibilidad semanal">
            {DAYS.map(([key, label]) => {
              const win = dayWin(key)
              return (
                <div key={key} className="he-day">
                  <label className="he-day-tog"><input type="checkbox" checked={!!win} onChange={e => setDay(key, e.target.checked ? ['09:00', '18:00'] : null)} /> {label}</label>
                  {win ? (
                    <span className="he-day-times">
                      <input type="time" value={win[0]} onChange={e => setDay(key, [e.target.value, win[1]])} />
                      <span>—</span>
                      <input type="time" value={win[1]} onChange={e => setDay(key, [win[0], e.target.value])} />
                    </span>
                  ) : <span className="he-day-off">No disponible</span>}
                </div>
              )
            })}
            <div className="he-row" style={{ marginTop: 10 }}>
              <Field label="Colchón entre citas (min)"><input type="number" min="0" value={page.buffer_min ?? 0} onChange={e => set({ buffer_min: +e.target.value })} /></Field>
              <Field label="Antelación mínima (h)"><input type="number" min="0" value={page.min_notice_hours ?? 4} onChange={e => set({ min_notice_hours: +e.target.value })} /></Field>
              <Field label="Reservable hasta (días)"><input type="number" min="1" value={page.max_days_ahead ?? 30} onChange={e => set({ max_days_ahead: +e.target.value })} /></Field>
            </div>
          </Section>

          {/* Formulario de intake */}
          <Section title="Formulario (lo rellena quien reserva)">
            {(page.intake_fields || []).map((f, i) => (
              <div key={i} className="he-fld">
                <input className="he-fld-label" value={f.label} onChange={e => editField(i, { label: e.target.value })} placeholder="Etiqueta" />
                <select value={f.type} onChange={e => editField(i, { type: e.target.value })}>{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <label className="he-req"><input type="checkbox" checked={!!f.required} onChange={e => editField(i, { required: e.target.checked })} /> Obligatorio</label>
                <button className="he-fld-x" onClick={() => removeField(i)} disabled={f.key === 'name' || f.key === 'email'} title={f.key === 'name' || f.key === 'email' ? 'Campo fijo' : 'Quitar'}>✕</button>
              </div>
            ))}
            <button className="ac-btn" onClick={addField} style={{ marginTop: 6 }}>+ Añadir campo</button>
          </Section>

          {/* Ubicación + cuenta + proyecto */}
          <Section title="Ubicación y calendario">
            <div className="he-row">
              <Field label="Tipo de llamada">
                <select value={page.location_type} onChange={e => set({ location_type: e.target.value })}>
                  <option value="google_meet">Google Meet (automático)</option>
                  <option value="phone">Teléfono</option>
                  <option value="custom">A convenir</option>
                </select>
              </Field>
              {page.location_type === 'phone' && <Field label="Teléfono"><input value={page.location_value || ''} onChange={e => set({ location_value: e.target.value })} /></Field>}
            </div>
            <div className="he-row">
              <Field label="Crear el evento en">
                <select value={page.calendar_account_id || ''} onChange={e => set({ calendar_account_id: e.target.value || null })}>
                  <option value="">Cuenta principal</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.label || a.email}{a.is_primary ? ' (principal)' : ''}</option>)}
                </select>
              </Field>
              <Field label="Proyecto (opcional, para el CRM)"><input value={page.project || ''} onChange={e => set({ project: e.target.value })} placeholder="p. ej. Enforma con Hugo" /></Field>
            </div>
            <label className="he-req" style={{ marginTop: 10 }}><input type="checkbox" checked={page.active !== false} onChange={e => set({ active: e.target.checked })} /> Página activa (acepta reservas)</label>
          </Section>
        </div>}

        {state === 'ready' && (
          <footer className="he-foot">
            <span className="set-note">{msg}</span>
            <div style={{ display: 'inline-flex', gap: 8 }}>
              <button className="ac-btn" onClick={onClose}>Cerrar</button>
              <button className="ac-btn ac-btn--primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar agenda'}</button>
            </div>
          </footer>
        )}
      </div>

      <style>{HE_CSS}</style>
    </div>
  )

  function editField(i, patch) { set({ intake_fields: page.intake_fields.map((f, j) => j === i ? { ...f, ...patch } : f) }) }
  function removeField(i) { set({ intake_fields: page.intake_fields.filter((_, j) => j !== i) }) }
  function addField() {
    const key = 'campo_' + Math.random().toString(36).slice(2, 7)
    set({ intake_fields: [...(page.intake_fields || []), { key, label: 'Nuevo campo', type: 'text', required: false }] })
  }
}

function normalize(p) {
  return {
    ...p,
    durations: p.durations?.length ? p.durations : [30],
    availability: p.availability && Object.keys(p.availability).length ? p.availability : { mon: [['09:00', '18:00']], tue: [['09:00', '18:00']], wed: [['09:00', '18:00']], thu: [['09:00', '18:00']], fri: [['09:00', '18:00']] },
    intake_fields: p.intake_fields?.length ? p.intake_fields : [{ key: 'name', label: 'Nombre', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }],
  }
}

function Section({ title, children }) { return <div className="he-sec"><h3 className="he-sec-t">{title}</h3>{children}</div> }
function Field({ label, children }) { return <label className="he-field"><span>{label}</span>{children}</label> }

const HE_CSS = `
.he-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 200; display: flex; align-items: flex-start; justify-content: center; padding: 5vh 16px; overflow-y: auto; }
.he-modal { width: 100%; max-width: 640px; padding: 0; display: flex; flex-direction: column; }
.he-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 20px 22px 12px; border-bottom: 1px solid var(--apex-border); }
.he-x { background: none; border: none; color: var(--apex-plat-mid); font-size: 16px; cursor: pointer; }
.he-body { padding: 8px 22px; overflow-y: auto; }
.he-sec { padding: 14px 0; border-bottom: 1px solid var(--apex-border); }
.he-sec-t { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--apex-plat-low); margin: 0 0 10px; }
.he-field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: var(--apex-plat-mid); flex: 1; margin-bottom: 8px; }
.he-field input, .he-field textarea, .he-field select { background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: 9px; padding: 9px 11px; color: var(--apex-plat-hi); font-size: 13.5px; font-family: inherit; }
.he-row { display: flex; gap: 10px; flex-wrap: wrap; }
.he-link { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.he-link-base { font-size: 12.5px; color: var(--apex-plat-low); }
.he-link input { flex: 1; min-width: 120px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: 9px; padding: 9px 11px; color: var(--apex-plat-hi); font-size: 13.5px; }
.he-day { display: flex; align-items: center; gap: 14px; padding: 5px 0; }
.he-day-tog { display: inline-flex; align-items: center; gap: 7px; width: 78px; font-size: 13.5px; color: var(--apex-plat-hi); }
.he-day-times { display: inline-flex; align-items: center; gap: 7px; }
.he-day-times input { background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: 8px; padding: 5px 8px; color: var(--apex-plat-hi); }
.he-day-off { color: var(--apex-plat-low); font-size: 12.5px; }
.he-fld { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.he-fld-label { flex: 1; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: 8px; padding: 7px 10px; color: var(--apex-plat-hi); font-size: 13px; }
.he-fld select { background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: 8px; padding: 7px 8px; color: var(--apex-plat-hi); }
.he-req { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--apex-plat-mid); }
.he-fld-x { background: none; border: none; color: var(--apex-plat-low); cursor: pointer; }
.he-fld-x:disabled { opacity: .3; cursor: default; }
.he-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 22px; border-top: 1px solid var(--apex-border); }
.ac-btn--primary { background: var(--apex-accent, #7c5cff); color: #0b0c10; border-color: transparent; }
`
