import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import FloatingHeader from '../../components/FloatingHeader'
import SegTabs from '../../components/SegTabs'
import ProgressRing from '../../components/ProgressRing'
import AnimatedValue from '../../components/AnimatedValue'
import { getMetrics, listSales } from '../../lib/salesApi'
import { inWindow } from '../../lib/filters'

const METRICS_TABS = [{ to: '/finanzas', label: 'Ventas' }, { to: '/reports', label: 'Embudo' }]

/*
 * Métricas (evolución) — KPIs desde el backend (api/metrics), contando SOLO
 * ventas verificadas, + gráfico de tus ventas verificadas. Qué métricas son
 * públicas/privadas se gestiona en Ajustes; se muestran en tu Perfil. La tabla
 * de ventas vive en "Ventas" (antes Clientes).
 */
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const intf = (v) => new Intl.NumberFormat('es-ES').format(Math.round(v || 0))
const pct = (v) => v == null ? '—' : `${Math.round(v * 100)}%`
const fmtVal = (fmt, v) => fmt === 'money' ? money(v) : fmt === 'pct' ? pct(v) : intf(v)
const fmtDay = (iso) => { try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) } catch { return iso } }
const CHART_METRICS = [{ key: 'revenue', label: 'Revenue' }, { key: 'cash', label: 'Cash collected' }, { key: 'deals', label: 'Cierres' }]

export default function Finance() {
  const [time, setTime] = useState('this_quarter')
  const [metric, setMetric] = useState('revenue')
  const [list, setList] = useState([])
  const [sales, setSales] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
    Promise.all([getMetrics(), listSales('verified')])
      .then(([m, s]) => { setList(m.list || []); setSales(s || []); setState('live') })
      .catch(() => setState('error'))
  }, [])

  const rows = useMemo(() => sales.filter(s => inWindow(s.date, time)), [sales, time])
  const series = useMemo(() => {
    const m = new Map()
    for (const s of rows) {
      const d = (s.date || '').slice(0, 10)
      const cur = m.get(d) || { date: d, revenue: 0, cash: 0, deals: 0 }
      cur.revenue += Number(s.revenue || 0); cur.cash += Number(s.cash_collected || 0); cur.deals += 1
      m.set(d, cur)
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [rows])

  return (
    <>
      <FloatingHeader title="Métricas" eyebrow="MÉTRICAS" actions={
        <>
          <SegTabs tabs={METRICS_TABS} />
          <div className="seg">
            {[['this_month', 'Mes'], ['this_quarter', 'Trim.'], ['this_year', 'Año'], ['all', 'Todo']].map(([k, l]) => (
              <button key={k} type="button" className="seg-btn" data-active={time === k || undefined} onClick={() => setTime(k)}>{l}</button>
            ))}
          </div>
        </>
      } />

      <section className="apex-section">
        <p className="set-note" style={{ margin: 0 }}>
          Solo cuentan ventas verificadas — la tabla está en <Link to="/clientes" className="crm-link">Ventas</Link>. Qué métricas son públicas se elige en <Link to="/ajustes" className="crm-link">Ajustes</Link> y se ven en tu <Link to="/perfil" className="crm-link">Perfil</Link>.
        </p>
        {state === 'error' && <div className="apex-card" style={{ padding: 16, color: 'var(--apex-plat-mid)' }}>No pude cargar las métricas (¿backend?).</div>}
        <div className="mx-cards">
          {list.map(m => m.fmt === 'pct' ? (
            <div className="apex-card mx-card mx-card--ring" key={m.key} data-public={m.public || undefined}>
              <ProgressRing value={m.value} size={92} stroke={8} card={false} />
              <span className="mx-card-label">{m.label}</span>
            </div>
          ) : (
            <div className="apex-card mx-card" key={m.key} data-public={m.public || undefined}>
              <span className="mx-card-label">{m.label}</span>
              <span className="mx-card-value"><AnimatedValue value={m.value} fmt={m.fmt} /></span>
            </div>
          ))}
          {state === 'loading' && <div className="apex-card mx-card"><span className="mx-card-label">Cargando…</span></div>}
        </div>
      </section>

      <section className="apex-section">
        <div className="apex-card fx-chart-card">
          <div className="fx-chart-head">
            <h3>Evolución · ventas verificadas</h3>
            <div style={{ display: 'inline-flex', gap: 6 }}>
              {CHART_METRICS.map(m => (
                <button key={m.key} className="ac-btn" style={metric === m.key ? undefined : { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }} onClick={() => setMetric(m.key)}>{m.label}</button>
              ))}
            </div>
          </div>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fxFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--apex-chart-line-2)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--apex-chart-line-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--apex-chart-grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: 'var(--apex-chart-tick)', fontSize: 11 }} stroke="var(--apex-chart-axis)" />
                <YAxis tick={{ fill: 'var(--apex-chart-tick)', fontSize: 11 }} stroke="var(--apex-chart-axis)" width={48} />
                <Tooltip contentStyle={{ background: 'var(--apex-panel-bg)', border: '1px solid var(--apex-border-strong)', color: 'var(--apex-plat-hi)', fontSize: 12 }} labelFormatter={fmtDay}
                  formatter={(v) => metric === 'deals' ? [v, 'Cierres'] : [money(v), CHART_METRICS.find(m => m.key === metric)?.label]} />
                <Area type="monotone" dataKey={metric} stroke="var(--apex-chart-line-2)" strokeWidth={2} fill="url(#fxFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {state === 'live' && series.length === 0 && <p className="ac-empty" style={{ padding: '16px 0 0' }}>Sin ventas verificadas en el periodo. Verifica ventas en <Link to="/clientes" className="crm-link">Ventas</Link>.</p>}
        </div>
      </section>

      <style>{MX_CSS}</style>
    </>
  )
}

const MX_CSS = `
.mx-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.mx-card { padding: 16px; display: flex; flex-direction: column; gap: 6px; position: relative; min-height: 118px; justify-content: center; }
.mx-card--ring { align-items: center; justify-content: center; text-align: center; gap: 8px; padding: 12px; }
.mx-card--ring .ring-card { padding: 0; gap: 8px; }
.mx-card[data-public] { border-color: color-mix(in srgb, var(--apex-status-pos) 40%, var(--apex-border)); }
.mx-card-label { font-size: 11.5px; color: var(--apex-plat-low); text-transform: uppercase; letter-spacing: 0.06em; }
.mx-card-value { font-size: 22px; color: var(--apex-plat-hi); font-family: var(--apex-font); }
.mx-vis { margin-top: 4px; align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid var(--apex-border); color: var(--apex-plat-low); font-family: var(--apex-font); font-size: 11px; padding: 3px 8px; cursor: pointer; }
.mx-vis-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--apex-plat-low); }
.mx-vis[data-on] { color: var(--apex-status-pos); border-color: color-mix(in srgb, var(--apex-status-pos) 45%, transparent); }
.mx-vis[data-on] .mx-vis-dot { background: var(--apex-status-pos); }
`
