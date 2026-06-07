import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import FloatingHeader from '../../components/FloatingHeader'
import SegTabs from '../../components/SegTabs'
import { getMetrics, getVisibility, setVisibility as apiSetVisibility, listSales } from '../../lib/salesApi'
import { inWindow } from '../../lib/filters'

const METRICS_TABS = [{ to: '/finanzas', label: 'Ventas' }, { to: '/reports', label: 'Embudo' }]

/*
 * Métricas — KPIs desde el backend (api/metrics), contando SOLO ventas
 * verificadas. Cada métrica tiene un check Pública/Privada: lo público se ve en
 * tu Perfil (lo que pueden ver tus amigos). La tabla de ventas vive ahora en
 * "Ventas" (antes Clientes). El gráfico se alimenta de tus ventas verificadas.
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
  const [visible, setVisible] = useState({})
  const [sales, setSales] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
    Promise.all([getMetrics(), getVisibility(), listSales('verified')])
      .then(([m, v, s]) => { setList(m.list || []); setVisible(v || {}); setSales(s || []); setState('live') })
      .catch(() => setState('error'))
  }, [])

  const togglePublic = (key) => {
    const next = { ...visible, [key]: !visible[key] }
    setVisible(next)
    setList(l => l.map(x => x.key === key ? { ...x, public: next[key] } : x))
    apiSetVisibility(next).catch(() => { /* offline */ })
  }

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
          Marca cada métrica como <b>Pública</b> (se ve en tu perfil, para tus amigos) o <b>Privada</b>. Solo cuentan ventas verificadas — la tabla está en <Link to="/clientes" className="crm-link">Ventas</Link>.
        </p>
        {state === 'error' && <div className="apex-card" style={{ padding: 16, color: 'var(--apex-plat-mid)' }}>No pude cargar las métricas (¿backend?).</div>}
        <div className="mx-cards">
          {list.map(m => (
            <div className="apex-card mx-card" key={m.key} data-public={m.public || undefined}>
              <span className="mx-card-label">{m.label}</span>
              <span className="mx-card-value">{fmtVal(m.fmt, m.value)}</span>
              <button type="button" className="mx-vis" data-on={m.public || undefined} onClick={() => togglePublic(m.key)} title="Pública = visible en tu perfil">
                <span className="mx-vis-dot" />{m.public ? 'Pública' : 'Privada'}
              </button>
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
                    <stop offset="0%" stopColor="#D5DAE3" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#D5DAE3" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(154,163,178,0.12)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: '#7A8494', fontSize: 11 }} stroke="rgba(154,163,178,0.2)" />
                <YAxis tick={{ fill: '#7A8494', fontSize: 11 }} stroke="rgba(154,163,178,0.2)" width={48} />
                <Tooltip contentStyle={{ background: '#0d0f15', border: '1px solid #2a2f3a', color: '#FAFBFE', fontSize: 12 }} labelFormatter={fmtDay}
                  formatter={(v) => metric === 'deals' ? [v, 'Cierres'] : [money(v), CHART_METRICS.find(m => m.key === metric)?.label]} />
                <Area type="monotone" dataKey={metric} stroke="#D5DAE3" strokeWidth={1.5} fill="url(#fxFill)" />
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
.mx-card { padding: 16px; display: flex; flex-direction: column; gap: 6px; position: relative; }
.mx-card[data-public] { border-color: color-mix(in srgb, #6FCF9C 40%, var(--apex-border)); }
.mx-card-label { font-size: 11.5px; color: var(--apex-plat-low); text-transform: uppercase; letter-spacing: 0.06em; }
.mx-card-value { font-size: 22px; color: var(--apex-plat-hi); font-family: var(--apex-font); }
.mx-vis { margin-top: 4px; align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid var(--apex-border); color: var(--apex-plat-low); font-family: var(--apex-font); font-size: 11px; padding: 3px 8px; cursor: pointer; }
.mx-vis-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--apex-plat-low); }
.mx-vis[data-on] { color: #6FCF9C; border-color: color-mix(in srgb, #6FCF9C 45%, transparent); }
.mx-vis[data-on] .mx-vis-dot { background: #6FCF9C; }
`
