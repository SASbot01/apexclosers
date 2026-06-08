import { useState } from 'react'
import { Link } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import FilterBar, { SelectFilter } from '../../components/Filters'
import StatusBadge from '../../components/StatusBadge'
import { useCalls } from '../../data/hooks/useCalls'
import { fmtDateTime } from '../../lib/format'
import { calendarBounds, inWindow } from '../../lib/filters'
import { MONTHLY_GOALS } from '../../data/mock/goals'
import { CLIENT_OPTIONS } from '../../data/mock/clients'
import { MOCK_SALES } from '../../data/mock/sales'
import { getManualSales } from '../../lib/metrics'

const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const intf = (v) => new Intl.NumberFormat('es-ES').format(Math.round(v || 0))

/*
 * Home — panel del día. Filtro de periodo + objetivos (barra de % completado,
 * lo que falta y proyección a fin de periodo) + seguimientos + últimas llamadas.
 */
export default function Home() {
  const { calls, loading } = useCalls()
  const [time, setTime] = useState('this_quarter')
  const [client, setClient] = useState('all')

  const inWin = calls
    .filter(c => inWindow(c.started_at || c.scheduled_at, time))
    .filter(c => client === 'all' || c.client_id === client)
  const won = inWin.filter(c => c.outcome === 'won')
  const followUps = inWin.filter(c => c.next_step && c.outcome !== 'won' && c.outcome !== 'lost')
  const cashWon = won.reduce((a, c) => a + (c.deal_amount || 0), 0)
  const actuals = { calls: inWin.length, closes: won.length, cash: cashWon }

  // % recollected = cash collected / revenue (de las ventas del periodo).
  const salesWin = [...MOCK_SALES, ...getManualSales()].filter(s => inWindow(s.date, time)).filter(s => client === 'all' || s.client_id === client)
  const recRev = salesWin.reduce((a, s) => a + (s.revenue || 0), 0)
  const recCash = salesWin.reduce((a, s) => a + (s.cash_collected || 0), 0)
  const recollected = recRev ? Math.round((recCash / recRev) * 100) : 0

  const { elapsedFrac, days } = calendarBounds(time)
  const goals = MONTHLY_GOALS.map(g => {
    const objetivo = Math.max(1, Math.round(g.base * days / 30))
    const actual = actuals[g.key] || 0
    const pct = Math.min(100, Math.round((actual / objetivo) * 100))
    const expected = objetivo * elapsedFrac
    const onPace = actual >= expected
    const projection = elapsedFrac > 0.05 ? Math.round(actual / elapsedFrac) : actual
    const f = (v) => g.fmt === 'money' ? money(v) : intf(v)
    return { ...g, objetivo, actual, pct, queda: Math.max(0, objetivo - actual), onPace, projection, f }
  })

  const kpis = [
    { label: 'Llamadas',     value: intf(inWin.length) },
    { label: 'Cerradas',     value: intf(won.length) },
    { label: 'Seguimientos', value: intf(followUps.length) },
    { label: 'Cash cerrado', value: money(cashWon) },
    { label: '% Recollected', value: `${recollected}%` },
  ]

  const recent = [...inWin].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0)).slice(0, 5)

  return (
    <>
      <FloatingHeader title="Tu día" eyebrow="" actions={
        <FilterBar time={time} onTime={setTime}>
          <SelectFilter label="Cliente" value={client} options={CLIENT_OPTIONS} onChange={setClient} />
        </FilterBar>} />

      <section className="apex-section">
        <div className="apex-card kpi-strip">
          {kpis.map(k => (
            <div className="kpi" key={k.label}>
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-value">{k.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="apex-section">
        <div className="apex-card" style={{ padding: 24 }}>
          <div className="home-head">
            <h3>Objetivos del periodo</h3>
            <span className="ac-source">% completado · proyección</span>
          </div>
          <div className="goal-grid">
            {goals.map(g => (
              <div className="goal" key={g.key}>
                <div className="goal-top">
                  <span className="goal-label">{g.label}</span>
                  <span className="goal-nums">{g.f(g.actual)} <span className="goal-of">/ {g.f(g.objetivo)}</span></span>
                </div>
                <div className="goal-bar"><div className="goal-bar-fill" data-pace={g.onPace ? 'ok' : 'low'} style={{ width: `${g.pct}%` }} /></div>
                <div className="goal-meta">
                  <span className="goal-pct">{g.pct}%</span>
                  <span>Faltan {g.f(g.queda)}</span>
                  <span className="goal-proj" data-pace={g.onPace ? 'ok' : 'low'}>Proyección {g.f(g.projection)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="apex-section apex-grid-2">
        <div className="apex-card" style={{ padding: 24 }}>
          <div className="home-head">
            <h3>Seguimientos pendientes</h3>
            <Link to="/pipeline" className="home-link">Leads →</Link>
          </div>
          {loading && <p className="ac-empty" style={{ padding: 0 }}>Cargando…</p>}
          {!loading && followUps.length === 0 && <p className="ac-empty" style={{ padding: 0 }}>Sin seguimientos pendientes.</p>}
          <div className="home-list">
            {followUps.map(c => (
              <Link to={`/llamadas/${c.id}`} key={c.id} className="home-row">
                <span className="home-row-title">{c.title || 'Llamada'}</span>
                <span className="home-row-sub">→ {c.next_step}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="apex-card" style={{ padding: 24 }}>
          <div className="home-head">
            <h3>Últimas llamadas</h3>
            <Link to="/llamadas" className="home-link">Llamadas →</Link>
          </div>
          <div className="home-list">
            {recent.map(c => (
              <Link to={`/llamadas/${c.id}`} key={c.id} className="home-row home-row--split">
                <span className="home-row-title">{c.title || 'Llamada'}</span>
                <span className="home-row-meta">
                  <span className="home-row-date">{fmtDateTime(c.started_at || c.scheduled_at)}</span>
                  <StatusBadge call={c} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
