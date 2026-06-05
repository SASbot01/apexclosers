import { useState, useMemo, useRef } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import FloatingHeader from '../../components/FloatingHeader'
import FilterBar, { SelectFilter } from '../../components/Filters'
import SegTabs from '../../components/SegTabs'
import { MOCK_SALES, SALES_CLOSERS } from '../../data/mock/sales'
import { CLIENT_OPTIONS } from '../../data/mock/clients'
import { inWindow } from '../../lib/filters'
import { getManualSales, importSalesCsv, addSale } from '../../lib/metrics'

const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }
const today = () => new Date().toISOString().slice(0, 10)

const METRICS_TABS = [{ to: '/finanzas', label: 'Ventas' }, { to: '/reports', label: 'Embudo' }]

/*
 * Finanzas — gráfico dinámico (revenue/cash/deals por día) + KPIs + tabla de
 * ventas. Filtros de periodo y closer.
 */
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const METRICS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'cash',    label: 'Cash collected' },
  { key: 'deals',   label: 'Cierres' },
]
const fmtDay = (iso) => { try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) } catch { return iso } }

export default function Finance() {
  const [time, setTime] = useState('this_quarter')
  const [client, setClient] = useState('all')
  const [closer, setCloser] = useState('all')
  const [metric, setMetric] = useState('revenue')
  const [tick, setTick] = useState(0)
  const [form, setForm] = useState(null)
  const fileRef = useRef(null)

  const rows = useMemo(() => [...MOCK_SALES, ...getManualSales()]
    .filter(s => inWindow(s.date, time))
    .filter(s => client === 'all' || s.client_id === client)
    .filter(s => closer === 'all' || s.closer === closer)
    .sort((a, b) => new Date(b.date) - new Date(a.date)), [time, client, closer, tick])

  const revenue = rows.reduce((a, s) => a + s.revenue, 0)
  const cash = rows.reduce((a, s) => a + s.cash_collected, 0)
  const deals = rows.length
  const avg = deals ? revenue / deals : 0

  const series = useMemo(() => {
    const m = new Map()
    for (const s of rows) {
      const d = s.date.slice(0, 10)
      const cur = m.get(d) || { date: d, revenue: 0, cash: 0, deals: 0 }
      cur.revenue += s.revenue; cur.cash += s.cash_collected; cur.deals += 1
      m.set(d, cur)
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [rows])

  const kpis = [
    { label: 'Revenue', value: money(revenue) },
    { label: 'Cash collected', value: money(cash) },
    { label: '% Recollected', value: revenue ? `${Math.round((cash / revenue) * 100)}%` : '—' },
    { label: 'Cierres', value: deals },
    { label: 'Ticket medio', value: money(avg) },
  ]

  const closerOpts = SALES_CLOSERS.map(c => ({ key: c, label: c }))

  function onCsv(e) {
    const f = e.target.files?.[0]; if (!f) return
    f.text().then(t => { const n = importSalesCsv(t); setTick(x => x + 1); alert(`Importadas ${n} ventas.`) })
    e.target.value = ''
  }
  function addManual() {
    addSale({ date: form.date, client_id: form.client === 'all' ? null : form.client, product: form.product, revenue: +form.revenue || 0, cash_collected: +form.cash || 0 })
    setForm(null); setTick(x => x + 1)
  }

  return (
    <>
      <FloatingHeader
        title="Métricas"
        eyebrow="MÉTRICAS"
        actions={
          <>
            <SegTabs tabs={METRICS_TABS} />
            <FilterBar time={time} onTime={setTime}>
              <SelectFilter label="Cliente" value={client} options={CLIENT_OPTIONS} onChange={setClient} />
              <SelectFilter label="Closer" value={closer} options={closerOpts} onChange={setCloser} />
            </FilterBar>
          </>
        }
      />

      <section className="apex-section">
        <div className="crm-filters">
          <button className="ac-btn" style={ghost} onClick={() => fileRef.current?.click()}>Importar CSV</button>
          <button className="ac-btn" style={ghost} onClick={() => setForm(form ? null : { date: today(), client, product: '', revenue: '', cash: '' })}>Reportar venta</button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={onCsv} />
          <span className="crm-count">CSV: date,revenue,cash_collected,product</span>
        </div>
        {form && (
          <div className="apex-card mx-form">
            <input className="ac-input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input className="ac-input" placeholder="Producto" value={form.product} onChange={e => setForm({ ...form, product: e.target.value })} />
            <input className="ac-input" type="number" placeholder="Revenue €" value={form.revenue} onChange={e => setForm({ ...form, revenue: e.target.value })} />
            <input className="ac-input" type="number" placeholder="Cash €" value={form.cash} onChange={e => setForm({ ...form, cash: e.target.value })} />
            <button className="ac-btn" onClick={addManual}>Añadir</button>
          </div>
        )}

        <div className="apex-card fx-grid">
          {kpis.map(k => (
            <div className="fx-kpi" key={k.label}>
              <span className="fx-kpi-label">{k.label}</span>
              <span className="fx-kpi-value">{k.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="apex-section">
        <div className="apex-card fx-chart-card">
          <div className="fx-chart-head">
            <h3>Evolución</h3>
            <div style={{ display: 'inline-flex', gap: 6 }}>
              {METRICS.map(m => (
                <button key={m.key} className="ac-btn" data-ghost={metric !== m.key || undefined}
                  style={metric === m.key ? undefined : { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }}
                  onClick={() => setMetric(m.key)}>{m.label}</button>
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
                <Tooltip
                  contentStyle={{ background: '#0d0f15', border: '1px solid #2a2f3a', color: '#FAFBFE', fontSize: 12 }}
                  labelFormatter={fmtDay}
                  formatter={(v) => metric === 'deals' ? [v, 'Cierres'] : [money(v), METRICS.find(m => m.key === metric)?.label]}
                />
                <Area type="monotone" dataKey={metric} stroke="#D5DAE3" strokeWidth={1.5} fill="url(#fxFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="apex-section">
        <div className="apex-card" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fecha</th><th>Closer</th><th>Producto</th><th>Método</th><th>Tipo</th>
                  <th className="num">Revenue</th><th className="num">Cash</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id}>
                    <td>{fmtDay(s.date)}</td>
                    <td className="tbl-strong">{s.closer}</td>
                    <td>{s.product}</td>
                    <td>{s.payment_method}</td>
                    <td>{s.payment_type}</td>
                    <td className="num tbl-strong">{money(s.revenue)}</td>
                    <td className="num">{money(s.cash_collected)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--apex-plat-low)', padding: 24 }}>Sin ventas en el periodo.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
