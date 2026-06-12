import { useEffect, useMemo, useState } from 'react'
import FloatingHeader from '../../components/FloatingHeader'
import SegTabs from '../../components/SegTabs'
import { useCurrentUser } from '../../lib/auth'
import { API_BASE, getUserId } from '../../lib/config'
import HostEditor from '../host/HostEditor'

/*
 * Calendario (booking calendar) — la agenda real de la persona conectada con
 * Google Calendar, embebida en la app como en el software de Apex. Lee
 * /api/calendar?action=events (calendario propio + compartidos) y la pinta en
 * un grid Día/Semana/Agenda. TODA la aritmética de fechas en Europe/Madrid.
 *
 * Las llamadas de venta de esta agenda son las que disparan el Notetaker y crean
 * leads solos (api/calendar.js · schedule-bots/sync).
 */
const CALLS_TABS = [
  { to: '/llamadas', label: 'Llamadas' },
  { to: '/scripts', label: 'Guion' },
  { to: '/calendario', label: 'Calendario' },
]

const DAY = 86_400_000
const ROW_HEIGHT_PX = 48
const TZ = 'Europe/Madrid'

// ── Capa de zona horaria (Europe/Madrid) ─────────────────────────────
function tzParts(date) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const o = {}
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') o[p.type] = p.value
  let h = parseInt(o.hour, 10); if (h === 24) h = 0
  return { y: +o.year, mo: +o.month, d: +o.day, h, mi: +o.minute }
}
function dayKeyTZ(date) { const p = tzParts(date); return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` }
function hourFloatTZ(date) { const p = tzParts(date); return p.h + p.mi / 60 }
function wallToUtc(y, mo, d, h, mi = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const p = tzParts(new Date(guess))
  const back = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi)
  return new Date(guess - (back - guess))
}
function noonInstant(p) { return wallToUtc(p.y, p.mo, p.d, 12, 0) }
function addDaysDate(date, n) { return new Date(date.getTime() + n * DAY) }
function madridMonday(date) {
  const p = tzParts(date)
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()
  const shift = (dow + 6) % 7
  return addDaysDate(noonInstant(p), -shift)
}
function sameTZDay(a, b) { return dayKeyTZ(a) === dayKeyTZ(b) }
const fmtTime = (date) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
const fmtDayShort = (date) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'short' }).format(date)
const fmtDayNum = (date) => tzParts(date).d
const fmtDayLong = (date) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(date)

export default function Calendar() {
  const user = useCurrentUser() || {}
  const [view, setView] = useState('week')   // day | week | agenda
  const [anchor, setAnchor] = useState(() => new Date())
  const [showWeekend, setShowWeekend] = useState(false)
  const [events, setEvents] = useState([])
  const [state, setState] = useState('loading') // loading | live | not_connected | error
  const [selected, setSelected] = useState(null)
  const [hostOpen, setHostOpen] = useState(false)

  useEffect(() => {
    let alive = true
    setState('loading')
    fetch(`${API_BASE}/api/calendar?action=events&userId=${encodeURIComponent(getUserId())}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        if (d.reason === 'google_not_connected') { setEvents([]); setState('not_connected'); return }
        setEvents(Array.isArray(d.events) ? d.events.filter(e => !e.all_day && e.start) : [])
        setState('live')
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [])

  // Eventos de Google → "citas" del grid.
  const bookings = useMemo(() => events.map(e => {
    const start = new Date(e.start)
    const end = e.end ? new Date(e.end) : new Date(start.getTime() + 30 * 60000)
    return {
      id: e.calendar_event_id,
      scheduled_at: e.start,
      client_name: e.lead_name || e.title || '(sin título)',
      title: e.title,
      duration_min: Math.max(15, Math.round((end - start) / 60000)),
      meet_url: e.meeting_url || '',
      calendar: e.calendar,
      is_sale: e.classification?.shouldAttachBot || false,
      _date: start,
    }
  }).filter(b => !isNaN(b._date)), [events])

  const kpis = useMemo(() => {
    const now = Date.now()
    const upcoming = bookings.filter(b => b._date.getTime() >= now).length
    const today = bookings.filter(b => sameTZDay(b._date, new Date())).length
    const monday = madridMonday(new Date()).getTime()
    const week = bookings.filter(b => { const t = b._date.getTime(); return t >= monday && t < monday + 7 * DAY }).length
    const sales = bookings.filter(b => b.is_sale && b._date.getTime() >= now).length
    return { upcoming, today, week, sales }
  }, [bookings])

  const bookingsByDay = useMemo(() => {
    const map = new Map()
    for (const b of bookings) {
      const k = dayKeyTZ(b._date)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(b)
    }
    for (const arr of map.values()) arr.sort((a, b) => a._date - b._date)
    return map
  }, [bookings])

  const { startHour, endHour } = useMemo(() => {
    let min = 8, max = 20
    for (const b of bookings) {
      const h = Math.floor(hourFloatTZ(b._date))
      if (h < min) min = h
      if (h + 1 > max) max = h + 1
    }
    return { startHour: Math.max(6, min - 1), endHour: Math.min(23, max + 1) }
  }, [bookings])
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)

  const gridDays = useMemo(() => {
    if (view === 'day') return [anchor]
    const start = madridMonday(anchor)
    const n = showWeekend ? 7 : 5
    return Array.from({ length: n }, (_, i) => addDaysDate(start, i))
  }, [view, anchor, showWeekend])

  const go = (dir) => setAnchor(a => addDaysDate(a, view === 'day' ? dir : dir * 7))
  const navLabel = view === 'day'
    ? fmtDayLong(anchor)
    : view === 'agenda'
      ? 'Próximos 30 días'
      : `${fmtDayLong(gridDays[0])} – ${fmtDayLong(gridDays[gridDays.length - 1])}`

  return (
    <>
      <FloatingHeader title="Calendario" eyebrow="LLAMADAS" actions={
        <>
          <SegTabs tabs={CALLS_TABS} />
          <button type="button" className="ac-btn" onClick={() => setHostOpen(true)} title="Edita tu enlace de agenda">🗓️ Host</button>
          <span className="ac-source">{user.email || 'tu Google'} · hora España</span>
        </>
      } />

      {hostOpen && <HostEditor onClose={() => setHostOpen(false)} />}

      <section className="apex-section">
        <div className="apex-card kpi-strip">
          {[
            { label: 'Próximas', value: kpis.upcoming },
            { label: 'Hoy', value: kpis.today },
            { label: 'Esta semana', value: kpis.week },
            { label: 'Ventas próximas', value: kpis.sales },
          ].map(k => (
            <div className="kpi" key={k.label}><span className="kpi-label">{k.label}</span><span className="kpi-value">{k.value}</span></div>
          ))}
        </div>
      </section>

      <section className="apex-section">
        <div className="cal2-toolbar">
          <div className="seg">
            {[['day', 'Día'], ['week', 'Semana'], ['agenda', 'Agenda']].map(([k, l]) => (
              <button key={k} type="button" className="seg-btn" data-active={view === k || undefined} onClick={() => setView(k)}>{l}</button>
            ))}
          </div>
          {view === 'week' && (
            <button type="button" className="ac-btn" style={{ background: 'transparent', borderColor: 'var(--apex-border)', color: 'var(--apex-plat-mid)' }} onClick={() => setShowWeekend(v => !v)}>
              {showWeekend ? 'Ocultar finde' : 'Ver finde'}
            </button>
          )}
          <div className="cal2-nav">
            <button type="button" className="cal2-iconbtn" onClick={() => go(-1)} aria-label="Anterior">‹</button>
            <button type="button" className="ac-btn" style={{ background: 'transparent', borderColor: 'var(--apex-border)', color: 'var(--apex-plat-mid)' }} onClick={() => setAnchor(new Date())}>Hoy</button>
            <button type="button" className="cal2-iconbtn" onClick={() => go(1)} aria-label="Siguiente">›</button>
          </div>
          <span className="cal2-navlabel apex-mono">{navLabel}</span>
        </div>

        {state === 'not_connected' && (
          <div className="apex-card" style={{ padding: 16, marginBottom: 12, color: 'var(--apex-plat-mid)' }}>
            Tu Google no está conectado. Inicia sesión con Google (Ajustes / login) para ver aquí tu calendario real y el de tus calendarios compartidos.
          </div>
        )}
        {state === 'error' && (
          <div className="apex-card" style={{ padding: 16, marginBottom: 12, color: 'var(--apex-plat-mid)' }}>
            No pude cargar el calendario (¿backend local arrancado?).
          </div>
        )}

        {view === 'agenda'
          ? <AgendaList bookings={bookings} onPick={setSelected} loading={state === 'loading'} />
          : <TimeGrid days={gridDays} hours={hours} startHour={startHour} bookingsByDay={bookingsByDay} onPick={setSelected} />}
      </section>

      {selected && <DetailModal booking={selected} onClose={() => setSelected(null)} />}
      <style>{CAL_CSS}</style>
    </>
  )
}

function TimeGrid({ days, hours, startHour, bookingsByDay, onPick }) {
  const bodyH = hours.length * ROW_HEIGHT_PX
  const now = new Date()
  const nowTop = (hourFloatTZ(now) - startHour) * ROW_HEIGHT_PX
  return (
    <div className="cal2-grid" style={{ '--cols': days.length }}>
      <div className="cal2-times">
        <div className="cal2-corner" />
        {hours.map(h => <div key={h} className="cal2-time apex-mono" style={{ height: ROW_HEIGHT_PX }}>{String(h).padStart(2, '0')}:00</div>)}
      </div>
      <div className="cal2-days">
        {days.map(d => {
          const k = dayKeyTZ(d)
          const items = bookingsByDay.get(k) || []
          const isToday = sameTZDay(d, now)
          return (
            <div key={k} className="cal2-day" data-today={isToday || undefined}>
              <div className="cal2-day-head">
                <span className="cal2-day-name">{fmtDayShort(d)}</span>
                <span className="apex-mono cal2-day-num" data-today={isToday || undefined}>{fmtDayNum(d)}</span>
              </div>
              <div className="cal2-day-body" style={{ height: bodyH }}>
                {hours.map((h, hi) => <div key={h} className="cal2-hourline" style={{ top: hi * ROW_HEIGHT_PX }} />)}
                {isToday && nowTop >= 0 && nowTop <= bodyH && <div className="cal2-now" style={{ top: nowTop }}><span className="cal2-now-dot" /></div>}
                {items.map(b => {
                  const top = (hourFloatTZ(b._date) - startHour) * ROW_HEIGHT_PX
                  const height = Math.max(22, (b.duration_min / 60) * ROW_HEIGHT_PX)
                  return (
                    <button key={b.id} type="button" className="cal2-pill" data-sale={b.is_sale || undefined}
                      style={{ top, height }} onClick={() => onPick(b)} title={`${b.client_name} · ${fmtTime(b._date)}`}>
                      <span className="apex-mono cal2-pill-time">{fmtTime(b._date)}</span>
                      <span className="cal2-pill-name">{b.client_name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AgendaList({ bookings, onPick, loading }) {
  const from = Date.now() - 1 * DAY
  const to = Date.now() + 30 * DAY
  const items = bookings.filter(b => { const t = b._date.getTime(); return t >= from && t <= to }).sort((a, b) => a._date - b._date)
  const groups = []
  let curKey = null
  for (const b of items) {
    const k = dayKeyTZ(b._date)
    if (k !== curKey) { groups.push({ key: k, date: b._date, items: [] }); curKey = k }
    groups[groups.length - 1].items.push(b)
  }
  if (loading) return <div className="apex-card" style={{ padding: 28, textAlign: 'center', color: 'var(--apex-plat-low)' }}>Cargando…</div>
  if (!groups.length) return <div className="apex-card" style={{ padding: 28, textAlign: 'center', color: 'var(--apex-plat-low)' }}>Sin citas en los próximos 30 días.</div>
  return (
    <div className="cal2-agenda">
      {groups.map(g => (
        <div key={g.key} className="cal2-ag-group">
          <div className="cal2-ag-date apex-mono">{fmtDayLong(g.date)}</div>
          <div className="cal2-ag-items">
            {g.items.map(b => (
              <button key={b.id} type="button" className="cal2-ag-row" data-sale={b.is_sale || undefined} onClick={() => onPick(b)}>
                <span className="apex-mono cal2-ag-time">{fmtTime(b._date)}</span>
                <span className="cal2-ag-dot" />
                <span className="cal2-ag-name">{b.client_name}</span>
                <span className="cal2-ag-meta apex-mono">{b.duration_min}m{b.is_sale ? ' · venta' : ''}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DetailModal({ booking, onClose }) {
  return (
    <div className="cal2-modal-back" onClick={onClose}>
      <div className="cal2-modal" onClick={e => e.stopPropagation()}>
        <header className="cal2-modal-head">
          <h3>{booking.client_name}</h3>
          <button type="button" onClick={onClose}>✕</button>
        </header>
        <div className="cal2-modal-sub apex-mono">{fmtDayLong(booking._date)} · {fmtTime(booking._date)} · {booking.duration_min}m</div>
        <div className="home-list" style={{ marginTop: 12 }}>
          <div className="dw-row"><span className="dw-k">Calendario</span><span className="dw-v">{booking.calendar || '—'}</span></div>
          <div className="dw-row"><span className="dw-k">Tipo</span><span className="dw-v">{booking.is_sale ? 'Llamada de venta' : 'Evento'}</span></div>
        </div>
        {booking.meet_url && (
          <a href={booking.meet_url} target="_blank" rel="noreferrer" className="ac-btn" style={{ marginTop: 14, display: 'inline-flex', textDecoration: 'none' }}>
            Abrir reunión
          </a>
        )}
      </div>
    </div>
  )
}

const CAL_CSS = `
.cal2-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.cal2-nav { display: inline-flex; align-items: center; gap: 6px; }
.cal2-iconbtn { width: 30px; height: 30px; background: transparent; border: 1px solid var(--apex-border); color: var(--apex-plat-mid); cursor: pointer; font-size: 16px; line-height: 1; }
.cal2-iconbtn:hover { color: var(--apex-plat-hi); border-color: var(--apex-plat-mid); }
.cal2-navlabel { font-size: 12px; color: var(--apex-plat-mid); text-transform: capitalize; letter-spacing: 0.03em; margin-left: auto; }

.cal2-grid { display: grid; grid-template-columns: 56px 1fr; border: 1px solid var(--apex-border); background: var(--apex-card-bg, rgba(255,255,255,0.02)); overflow: hidden; }
.cal2-times { display: flex; flex-direction: column; border-right: 1px solid var(--apex-border); }
.cal2-corner { height: 44px; border-bottom: 1px solid var(--apex-border); }
.cal2-time { display: flex; align-items: flex-start; justify-content: flex-end; padding: 2px 8px 0 0; font-size: 10px; color: var(--apex-plat-low); box-sizing: border-box; }
.cal2-days { display: grid; grid-template-columns: repeat(var(--cols), 1fr); }
.cal2-day { border-right: 1px solid var(--apex-alpha-3); min-width: 0; }
.cal2-day:last-child { border-right: 0; }
.cal2-day[data-today] { background: color-mix(in srgb, #8AC8E0 5%, transparent); }
.cal2-day-head { height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border-bottom: 1px solid var(--apex-border); }
.cal2-day-name { font-size: 10.5px; color: var(--apex-plat-low); text-transform: uppercase; letter-spacing: 0.08em; }
.cal2-day-num { font-size: 14px; color: var(--apex-plat-hi); width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; }
.cal2-day-num[data-today] { background: #8AC8E0; color: #0a0c12; border-radius: 50%; font-weight: 600; }
.cal2-day-body { position: relative; }
.cal2-hourline { position: absolute; left: 0; right: 0; border-top: 1px solid var(--apex-alpha-3); }
.cal2-now { position: absolute; left: 0; right: 0; height: 0; border-top: 2px solid #E58371; z-index: 5; }
.cal2-now-dot { position: absolute; left: -4px; top: -4px; width: 7px; height: 7px; border-radius: 50%; background: #E58371; }
.cal2-pill { position: absolute; left: 3px; right: 3px; display: flex; flex-direction: column; gap: 1px; padding: 3px 6px; background: color-mix(in srgb, #8AC8E0 22%, var(--apex-bg-deep, #0c0e14)); border: 1px solid #8AC8E0; border-left: 3px solid #8AC8E0; color: var(--apex-plat-hi); text-align: left; cursor: pointer; overflow: hidden; z-index: 4; box-sizing: border-box; }
.cal2-pill[data-sale] { background: color-mix(in srgb, var(--apex-status-pos) 22%, var(--apex-bg-deep, #0c0e14)); border-color: var(--apex-status-pos); border-left-color: var(--apex-status-pos); }
.cal2-pill:hover { filter: brightness(1.12); z-index: 6; }
.cal2-pill-time { font-size: 9.5px; opacity: 0.85; }
.cal2-pill-name { font-size: 11.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.cal2-agenda { display: flex; flex-direction: column; gap: 16px; }
.cal2-ag-group { display: flex; flex-direction: column; gap: 6px; }
.cal2-ag-date { font-size: 12px; color: var(--apex-plat-mid); text-transform: capitalize; letter-spacing: 0.03em; }
.cal2-ag-items { display: flex; flex-direction: column; gap: 4px; }
.cal2-ag-row { display: grid; grid-template-columns: 52px 10px 1fr auto; align-items: center; gap: 10px; padding: 10px 12px; background: var(--apex-card-bg, rgba(255,255,255,0.02)); border: 1px solid var(--apex-border); border-left: 3px solid #8AC8E0; color: var(--apex-plat-hi); text-align: left; cursor: pointer; }
.cal2-ag-row[data-sale] { border-left-color: var(--apex-status-pos); }
.cal2-ag-row:hover { background: var(--apex-trigger-bg); }
.cal2-ag-time { font-size: 12px; color: var(--apex-plat-hi); }
.cal2-ag-dot { width: 8px; height: 8px; border-radius: 50%; background: #8AC8E0; }
.cal2-ag-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cal2-ag-meta { font-size: 10.5px; color: var(--apex-plat-low); }

.cal2-modal-back { position: fixed; inset: 0; z-index: 860; background: rgba(0,0,0,0.55); backdrop-filter: blur(6px); display: grid; place-items: center; padding: 16px; }
.cal2-modal { width: min(480px, 100%); background: var(--apex-card-bg, #0f1115); border: 1px solid var(--apex-border); padding: 20px; color: var(--apex-plat-hi); font-family: var(--apex-font); }
.cal2-modal-head { display: flex; justify-content: space-between; align-items: center; }
.cal2-modal-head h3 { margin: 0; font-size: 16px; font-weight: 500; }
.cal2-modal-head button { background: transparent; border: 0; color: var(--apex-plat-mid); cursor: pointer; font-size: 14px; }
.cal2-modal-sub { font-size: 11.5px; color: var(--apex-plat-low); text-transform: capitalize; margin-top: 2px; }
@media (max-width: 720px) {
  .cal2-grid { grid-template-columns: 44px 1fr; }
  .cal2-navlabel { width: 100%; margin-left: 0; }
}
`
