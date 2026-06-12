// Página PÚBLICA de reserva (apex-closers.com/agenda/:slug). Sin sesión: quien
// recibe el enlace ve los huecos libres reales del host y reserva; se le crea el
// evento con Meet y al host le entra un lead. Espejo del "enlace de agenda".
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicHost, getHostSlots, bookHost } from '../../lib/hostApi'

const DAY = 86_400_000

function fmtDate(d, tz) { return new Intl.DateTimeFormat('es-ES', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(d) }
function fmtTime(iso, tz) { return new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) }
function fmtFull(iso, tz) { return new Intl.DateTimeFormat('es-ES', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso)) }
const dayKey = (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const initials = (n) => (n || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()

export default function BookingPage() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')   // loading | ok | notfound
  const [duration, setDuration] = useState(null)
  const [date, setDate] = useState(null)           // Date (instante a mediodía)
  const [slots, setSlots] = useState([])
  const [slotsState, setSlotsState] = useState('idle')
  const [picked, setPicked] = useState(null)       // iso del slot elegido
  const [form, setForm] = useState({})
  const [booking, setBooking] = useState('idle')   // idle | sending | done | error
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  const tz = data?.page?.timezone || 'Europe/Madrid'

  useEffect(() => {
    getPublicHost(slug)
      .then(d => { setData(d); setDuration(d.page.durations?.[0] || 30); setDate(new Date(Date.now() + DAY)); setState('ok') })
      .catch(() => setState('notfound'))
  }, [slug])

  // Días seleccionables (hoy .. max_days_ahead).
  const days = useMemo(() => {
    if (!data) return []
    const out = []
    for (let i = 0; i <= (data.page.max_days_ahead || 30); i++) out.push(new Date(Date.now() + i * DAY))
    return out
  }, [data])

  // Cargar huecos al cambiar día/duración.
  useEffect(() => {
    if (!data || !date || !duration) return
    setSlotsState('loading'); setPicked(null)
    getHostSlots(slug, dayKey(date, tz), duration)
      .then(s => { setSlots(s); setSlotsState('ok') })
      .catch(() => { setSlots([]); setSlotsState('error') })
  }, [data, date, duration, slug, tz])

  const fields = data?.page?.intake_fields || []
  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const name = form.name?.trim(), email = form.email?.trim()
    if (!name || !email) { setErr('Nombre y email son obligatorios.'); return }
    setBooking('sending')
    try {
      const r = await bookHost(slug, { startISO: picked, duration, name, email, phone: form.phone || null, answers: form })
      setResult(r); setBooking('done')
    } catch (e2) {
      setBooking('error')
      setErr(e2.message === 'slot_taken' ? 'Ese hueco se acaba de ocupar. Elige otro.' : 'No se pudo reservar. Inténtalo de nuevo.')
      if (e2.message === 'slot_taken') { setPicked(null); setSlotsState('loading'); getHostSlots(slug, dayKey(date, tz), duration).then(s => { setSlots(s); setSlotsState('ok') }) }
    }
  }

  if (state === 'loading') return <Wrap><div className="bk-card" style={{ padding: 28, color: '#9aa' }}>Cargando…</div></Wrap>
  if (state === 'notfound') return <Wrap><div className="bk-card" style={{ padding: 28 }}><h2 style={{ margin: 0 }}>Agenda no encontrada</h2><p style={{ color: '#9aa' }}>Este enlace de reserva no existe o está desactivado.</p></div></Wrap>

  const { page, host } = data
  const accent = page.color || '#7c5cff'

  if (booking === 'done' && result) {
    return (
      <Wrap accent={accent}>
        <div className="bk-card" style={{ padding: 28, textAlign: 'center' }}>
          <div className="bk-check" style={{ background: accent }}>✓</div>
          <h2 style={{ margin: '14px 0 4px' }}>¡Reserva confirmada!</h2>
          <p style={{ color: '#9aa', margin: '0 0 14px' }}>{fmtFull(result.start, tz)}</p>
          {result.meet_url && <a className="bk-btn" href={result.meet_url} target="_blank" rel="noreferrer" style={{ background: accent }}>Abrir Google Meet</a>}
          <p style={{ color: '#8a8f99', fontSize: 13, marginTop: 16 }}>Te enviamos la invitación a <b>{form.email}</b>.</p>
        </div>
      </Wrap>
    )
  }

  return (
    <Wrap accent={accent}>
      <div className="bk-grid">
        {/* Cabecera del host */}
        <aside className="bk-card bk-host">
          <div className="bk-av">{host.photo_url ? <img src={host.photo_url} alt="" /> : <span>{initials(host.name)}</span>}</div>
          <h1 className="bk-title">{page.title}</h1>
          <p className="bk-host-name">con {host.name}{host.headline ? ` · ${host.headline}` : ''}</p>
          {page.description && <p className="bk-desc">{page.description}</p>}
          <div className="bk-meta">
            <span>🕑 {duration} min</span>
            <span>{page.location_type === 'google_meet' ? '🎥 Google Meet' : page.location_type === 'phone' ? '📞 Teléfono' : '📍 A convenir'}</span>
            <span>🌍 {tz}</span>
          </div>
          {page.durations?.length > 1 && (
            <div className="bk-durs">
              {page.durations.map(d => <button key={d} className="bk-dur" data-on={d === duration || undefined} onClick={() => setDuration(d)} style={d === duration ? { borderColor: accent, color: accent } : undefined}>{d} min</button>)}
            </div>
          )}
        </aside>

        {/* Selector de día + huecos, o formulario */}
        <main className="bk-card bk-main">
          {!picked && <>
            <div className="bk-days">
              {days.map(d => {
                const on = date && dayKey(d, tz) === dayKey(date, tz)
                return <button key={dayKey(d, tz)} className="bk-day" data-on={on || undefined} onClick={() => setDate(d)} style={on ? { borderColor: accent, color: accent } : undefined}>{fmtDate(d, tz)}</button>
              })}
            </div>
            <div className="bk-slots">
              {slotsState === 'loading' && <p className="bk-muted">Buscando huecos…</p>}
              {slotsState === 'ok' && slots.length === 0 && <p className="bk-muted">No hay huecos libres este día. Prueba otro.</p>}
              {slotsState === 'error' && <p className="bk-muted">No pude cargar los huecos.</p>}
              {slotsState === 'ok' && slots.map(s => (
                <button key={s} className="bk-slot" onClick={() => setPicked(s)} style={{ '--ac': accent }}>{fmtTime(s, tz)}</button>
              ))}
            </div>
          </>}

          {picked && <form onSubmit={submit} className="bk-form">
            <button type="button" className="bk-back" onClick={() => setPicked(null)}>← Cambiar hora</button>
            <p className="bk-when">{fmtFull(picked, tz)} · {duration} min</p>
            {fields.map(f => (
              <label key={f.key} className="bk-field">
                <span>{f.label}{f.required && ' *'}</span>
                {f.type === 'textarea'
                  ? <textarea rows={3} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} required={f.required} />
                  : f.type === 'select'
                    ? <select value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} required={f.required}><option value="">—</option>{(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}</select>
                    : <input type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} required={f.required} />}
              </label>
            ))}
            {err && <p className="bk-err">{err}</p>}
            <button type="submit" className="bk-btn" disabled={booking === 'sending'} style={{ background: accent }}>{booking === 'sending' ? 'Reservando…' : 'Confirmar reserva'}</button>
          </form>}
        </main>
      </div>
    </Wrap>
  )
}

function Wrap({ children, accent = '#7c5cff' }) {
  return (
    <div className="bk-root">
      {children}
      <style>{`
        .bk-root { min-height: 100vh; background: radial-gradient(1200px 600px at 50% -10%, ${accent}22, transparent), #0b0c10; color: #e9ecf1; padding: 40px 18px; display: flex; align-items: flex-start; justify-content: center; font-family: system-ui, -apple-system, sans-serif; }
        .bk-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; }
        .bk-grid { width: 100%; max-width: 880px; display: grid; grid-template-columns: 320px 1fr; gap: 16px; }
        .bk-host { padding: 26px; }
        .bk-av { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; background: rgba(255,255,255,0.06); display: inline-flex; align-items: center; justify-content: center; font-size: 20px; color: #aab; }
        .bk-av img { width: 100%; height: 100%; object-fit: cover; }
        .bk-title { font-size: 21px; margin: 14px 0 4px; font-weight: 600; }
        .bk-host-name { color: #9aa; margin: 0 0 12px; font-size: 14px; }
        .bk-desc { color: #c2c7d0; font-size: 14px; line-height: 1.5; }
        .bk-meta { display: flex; flex-direction: column; gap: 7px; margin-top: 16px; color: #aab; font-size: 13.5px; }
        .bk-durs { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
        .bk-dur, .bk-day { background: transparent; border: 1px solid rgba(255,255,255,0.14); color: #c2c7d0; border-radius: 10px; padding: 7px 12px; cursor: pointer; font-size: 13px; }
        .bk-main { padding: 22px; min-height: 320px; }
        .bk-days { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 14px; }
        .bk-day { white-space: nowrap; }
        .bk-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 8px; }
        .bk-slot { background: transparent; border: 1px solid var(--ac); color: var(--ac); border-radius: 10px; padding: 11px 0; cursor: pointer; font-size: 14px; font-weight: 600; transition: .12s; }
        .bk-slot:hover { background: var(--ac); color: #0b0c10; }
        .bk-muted { color: #8a8f99; font-size: 14px; }
        .bk-form { display: flex; flex-direction: column; gap: 12px; }
        .bk-back { align-self: flex-start; background: none; border: none; color: #9aa; cursor: pointer; font-size: 13px; padding: 0; }
        .bk-when { font-size: 15px; font-weight: 600; margin: 4px 0 6px; }
        .bk-field { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: #aab; }
        .bk-field input, .bk-field textarea, .bk-field select { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.14); border-radius: 10px; padding: 10px 12px; color: #e9ecf1; font-size: 14px; font-family: inherit; }
        .bk-btn { display: inline-block; border: none; color: #0b0c10; font-weight: 700; border-radius: 12px; padding: 12px 18px; cursor: pointer; font-size: 15px; text-decoration: none; text-align: center; }
        .bk-btn:disabled { opacity: .6; }
        .bk-err { color: #ff8a8a; font-size: 13px; margin: 0; }
        .bk-check { width: 56px; height: 56px; border-radius: 50%; color: #0b0c10; font-size: 28px; display: inline-flex; align-items: center; justify-content: center; }
        @media (max-width: 720px) { .bk-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  )
}
