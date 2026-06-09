import { useState, useMemo, useRef, useEffect } from 'react'
import FloatingHeader from '../../components/FloatingHeader'
import FilterBar, { SelectFilter } from '../../components/Filters'
import SegTabs from '../../components/SegTabs'
import { CLIENT_OPTIONS } from '../../data/mock/clients'
import { inWindow } from '../../lib/filters'
import { importReportsCsv, addReportEntry } from '../../lib/metrics'
import { listReports } from '../../lib/reportsApi'

/*
 * Reports (vista "Embudo") — Agendadas→Realizadas→Ofertas→Depósitos→Cierres.
 * Tasas SOBRE LLAMADAS REALIZADAS (close% = cierres/realizadas) + Commitment
 * ((cierres+depósitos)/realizadas). Suma lo registrado (guion/CSV/manual).
 */
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0
const fmtDay = (iso) => { try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) } catch { return iso } }
const METRICS_TABS = [{ to: '/finanzas', label: 'Ventas' }, { to: '/reports', label: 'Embudo' }]
const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }
const today = () => new Date().toISOString().slice(0, 10)

export default function Reports() {
  const [time, setTime] = useState('this_quarter')
  const [client, setClient] = useState('all')
  const [tick, setTick] = useState(0)
  const [form, setForm] = useState(null)
  const fileRef = useRef(null)

  const [allRows, setAllRows] = useState([])
  useEffect(() => { listReports(client).then(setAllRows).catch(() => setAllRows([])) }, [client, tick])
  const rows = useMemo(() => allRows
    .filter(r => inWindow(r.date, time))
    .sort((a, b) => b.date.localeCompare(a.date)), [allRows, time])

  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0)
  const scheduled = sum('scheduled'), realizadas = sum('realizadas'), offers = sum('offers'), deposits = sum('deposits'), closes = sum('closes')

  const kpis = [
    { label: 'Agendadas', value: scheduled }, { label: 'Realizadas', value: realizadas },
    { label: 'Ofertas', value: offers }, { label: 'Depósitos', value: deposits }, { label: 'Cierres', value: closes },
  ]
  const funnel = kpis
  const max = Math.max(...funnel.map(f => f.value), 1)
  // Todas las tasas sobre REALIZADAS (salvo show rate). + Commitment.
  const rates = [
    { label: 'Show rate', value: pct(realizadas, scheduled) },
    { label: 'Oferta', value: pct(offers, realizadas) },
    { label: 'Depósito', value: pct(deposits, realizadas) },
    { label: 'Cierre', value: pct(closes, realizadas) },
    { label: 'Commitment', value: pct(closes + deposits, realizadas) },
  ]

  function onCsv(e) {
    const f = e.target.files?.[0]; if (!f) return
    f.text().then(t => { const n = importReportsCsv(t); setTick(x => x + 1); alert(`Importadas ${n} filas de reportes.`) })
    e.target.value = ''
  }
  function addManual() {
    addReportEntry({ client_id: form.client === 'all' ? null : form.client, date: form.date, scheduled: +form.scheduled || 0, realizadas: +form.realizadas || 0, offers: +form.offers || 0, deposits: +form.deposits || 0, closes: +form.closes || 0 })
    setForm(null); setTick(x => x + 1)
  }

  return (
    <>
      <FloatingHeader title="Métricas" eyebrow="MÉTRICAS" actions={
        <>
          <SegTabs tabs={METRICS_TABS} />
          <FilterBar time={time} onTime={setTime}>
            <SelectFilter label="Cliente" value={client} options={CLIENT_OPTIONS} onChange={setClient} />
          </FilterBar>
        </>
      } />

      <section className="apex-section">
        <div className="crm-filters">
          <button className="ac-btn" style={ghost} onClick={() => fileRef.current?.click()}>Importar CSV</button>
          <button className="ac-btn" style={ghost} onClick={() => setForm(form ? null : { date: today(), client, scheduled: '', realizadas: '', offers: '', deposits: '', closes: '' })}>Reportar día</button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={onCsv} />
          <span className="crm-count">CSV: date,scheduled,realizadas,offers,deposits,closes</span>
        </div>
        {form && (
          <div className="apex-card mx-form">
            <input className="ac-input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            {['scheduled', 'realizadas', 'offers', 'deposits', 'closes'].map(k => (
              <input key={k} className="ac-input" type="number" placeholder={k} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
            ))}
            <button className="ac-btn" onClick={addManual}>Añadir</button>
          </div>
        )}

        <div className="apex-card fx-grid">
          {kpis.map(k => (<div className="fx-kpi" key={k.label}><span className="fx-kpi-label">{k.label}</span><span className="fx-kpi-value">{k.value}</span></div>))}
        </div>
      </section>

      <section className="apex-section apex-grid-2">
        <div className="apex-card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontWeight: 400 }}>Embudo</h3>
          <div className="rp-funnel">
            {funnel.map((f, i) => {
              const prev = i > 0 ? funnel[i - 1].value : null
              const conv = prev ? pct(f.value, prev) : null
              return (
                <div className="rp-stage" key={f.label}>
                  <div className="rp-stage-top"><span>{f.label}</span><span className="rp-stage-val">{f.value}{conv != null && <span className="rp-conv"> · {conv}%</span>}</span></div>
                  <div className="rp-bar"><div className="rp-bar-fill" style={{ width: `${Math.round((f.value / max) * 100)}%` }} /></div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="apex-card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontWeight: 400 }}>Tasas (sobre realizadas)</h3>
          {rates.map(r => (
            <div className="goal" key={r.label} style={{ marginBottom: 16 }}>
              <div className="goal-top"><span className="goal-label">{r.label}</span><span className="goal-nums">{r.value}%</span></div>
              <div className="goal-bar"><div className="goal-bar-fill" style={{ width: `${Math.min(100, r.value)}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="apex-section">
        <div className="apex-card" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Fecha</th><th className="num">Agendadas</th><th className="num">Realizadas</th><th className="num">Ofertas</th><th className="num">Depósitos</th><th className="num">Cierres</th><th className="num">Cierre %</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{fmtDay(r.date)}</td>
                    <td className="num">{r.scheduled}</td><td className="num">{r.realizadas}</td>
                    <td className="num">{r.offers}</td><td className="num">{r.deposits}</td>
                    <td className="num tbl-strong">{r.closes}</td>
                    <td className="num">{pct(r.closes, r.realizadas)}%</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--apex-plat-low)', padding: 24 }}>Sin datos en el periodo.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
