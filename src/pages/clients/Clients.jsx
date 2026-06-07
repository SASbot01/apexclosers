import { useState, useEffect, useRef } from 'react'
import FloatingHeader from '../../components/FloatingHeader'
import { listSales, saveSale, deleteSale as apiDeleteSale, verifySale, uploadProof, fileToDataUrl } from '../../lib/salesApi'

/*
 * Ventas — tabla de ventas EDITABLE (sustituye a la antigua lista de clientes).
 * Las ventas entran a mano (+ Venta), o solas desde la transcripción de la
 * llamada (source='transcription') como "venta cerrada (pendiente)". Para que
 * una venta cuente en Métricas hay que subir un justificante y verificarla.
 */
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const intf = (v) => new Intl.NumberFormat('es-ES').format(Math.round(v || 0))
const fmtDay = (iso) => { try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }) } catch { return iso } }
const PAY_TYPES = ['Pago único', 'Cuotas']
const STATUS_META = {
  pending:  { label: 'Pendiente', color: '#F2A765' },
  verified: { label: 'Verificada', color: '#6FCF9C' },
  rejected: { label: 'Rechazada', color: '#E58371' },
}

export default function Clients() {
  const [sales, setSales] = useState([])
  const [state, setState] = useState('loading') // loading | live | error
  const [busy, setBusy] = useState({})           // id → 'proof' | 'verify'
  const saveTimers = useRef({})
  const fileInputs = useRef({})

  const load = () => {
    setState('loading')
    listSales()
      .then(rows => { setSales(rows); setState('live') })
      .catch(() => setState('error'))
  }
  useEffect(load, [])

  const verified = sales.filter(s => s.status === 'verified')
  const pending = sales.filter(s => s.status === 'pending')
  const kpis = [
    { label: 'Revenue verificado', value: money(verified.reduce((a, s) => a + Number(s.revenue || 0), 0)) },
    { label: 'Cash verificado', value: money(verified.reduce((a, s) => a + Number(s.cash_collected || 0), 0)) },
    { label: 'Cierres verificados', value: intf(verified.length) },
    { label: 'Pendientes', value: intf(pending.length) },
  ]

  // Edita una celda → estado local + guardado en backend (debounce por id).
  const patchSale = (id, patch) => {
    setSales(ss => ss.map(s => s.id === id ? { ...s, ...patch } : s))
    clearTimeout(saveTimers.current[id])
    const current = sales.find(s => s.id === id)
    const next = { ...current, ...patch }
    saveTimers.current[id] = setTimeout(() => {
      saveSale(next).then(saved => {
        if (saved && saved.id !== id) setSales(ss => ss.map(s => s.id === id ? saved : s))
      }).catch(() => { /* offline */ })
    }, 500)
  }

  const addSale = () => {
    const draft = { date: new Date().toISOString(), product: '', closer: '', revenue: 0, cash_collected: 0, payment_method: '', payment_type: 'Pago único', source: 'manual', status: 'pending' }
    saveSale(draft).then(saved => { if (saved) setSales(ss => [saved, ...ss]) }).catch(() => alert('No pude crear la venta (¿backend?).'))
  }
  const removeSale = (id) => {
    if (!window.confirm('¿Eliminar esta venta?')) return
    setSales(ss => ss.filter(s => s.id !== id))
    apiDeleteSale(id).catch(() => { /* offline */ })
  }

  const onProofPick = async (id, file) => {
    if (!file) return
    setBusy(b => ({ ...b, [id]: 'proof' }))
    try {
      const dataUrl = await fileToDataUrl(file)
      const saved = await uploadProof(id, dataUrl, file.name)
      setSales(ss => ss.map(s => s.id === id ? saved : s))
    } catch { alert('No pude subir el justificante.') }
    finally { setBusy(b => ({ ...b, [id]: null })) }
  }
  const onVerify = async (id) => {
    setBusy(b => ({ ...b, [id]: 'verify' }))
    try {
      const saved = await verifySale(id)
      setSales(ss => ss.map(s => s.id === id ? saved : s))
    } catch (e) { alert(/proof/.test(e.message) ? 'Sube primero el justificante.' : 'No pude verificar la venta.') }
    finally { setBusy(b => ({ ...b, [id]: null })) }
  }

  return (
    <>
      <FloatingHeader title="Ventas" eyebrow="TABLA DE VENTAS" actions={
        <button className="ac-btn" onClick={addSale}>+ Venta</button>
      } />

      <section className="apex-section">
        <div className="apex-card kpi-strip">
          {kpis.map(k => <div className="kpi" key={k.label}><span className="kpi-label">{k.label}</span><span className="kpi-value">{k.value}</span></div>)}
        </div>
      </section>

      <section className="apex-section">
        {state === 'error' && <div className="apex-card" style={{ padding: 16, marginBottom: 12, color: 'var(--apex-plat-mid)' }}>No pude cargar las ventas (¿backend local arrancado?).</div>}
        <p className="set-note" style={{ margin: '0 0 12px' }}>
          Las ventas que se cierran en una llamada entran solas aquí como <b>pendientes</b>. Sube el justificante y pulsa <b>Verificar</b> para que cuenten en Métricas.
        </p>
        <div className="apex-card" style={{ padding: 0 }}>
          <div className="tbl-wrap">
            <table className="tbl sales-tbl">
              <thead>
                <tr>
                  <th>Fecha</th><th>Producto</th><th>Closer</th><th>Método</th><th>Tipo</th>
                  <th className="num">Revenue</th><th className="num">Cash</th><th>Origen</th><th>Estado</th><th>Justificante</th><th></th>
                </tr>
              </thead>
              <tbody>
                {sales.map(s => {
                  const st = STATUS_META[s.status] || STATUS_META.pending
                  const isBusy = busy[s.id]
                  return (
                    <tr key={s.id}>
                      <td><input className="tbl-edit" type="date" value={(s.date || '').slice(0, 10)} onChange={e => patchSale(s.id, { date: e.target.value })} /></td>
                      <td><input className="tbl-edit" value={s.product || ''} placeholder="Producto" onChange={e => patchSale(s.id, { product: e.target.value })} /></td>
                      <td><input className="tbl-edit" value={s.closer || ''} placeholder="Closer" onChange={e => patchSale(s.id, { closer: e.target.value })} /></td>
                      <td><input className="tbl-edit" value={s.payment_method || ''} placeholder="—" onChange={e => patchSale(s.id, { payment_method: e.target.value })} /></td>
                      <td>
                        <select className="tbl-edit" value={s.payment_type || 'Pago único'} onChange={e => patchSale(s.id, { payment_type: e.target.value })}>
                          {PAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="num"><input className="tbl-edit num" type="number" value={s.revenue ?? 0} onChange={e => patchSale(s.id, { revenue: e.target.value })} /></td>
                      <td className="num"><input className="tbl-edit num" type="number" value={s.cash_collected ?? 0} onChange={e => patchSale(s.id, { cash_collected: e.target.value })} /></td>
                      <td>{s.source === 'transcription' ? <span className="sales-origin" title="Entró desde la transcripción de la llamada">desde llamada</span> : (s.source || 'manual')}</td>
                      <td><span className="sales-badge" style={{ '--c': st.color }}>{st.label}</span></td>
                      <td>
                        {s.proof_url
                          ? <a className="crm-link" href={s.proof_url} target="_blank" rel="noreferrer">Ver{s.proof_name ? ` · ${s.proof_name.slice(0, 14)}` : ''}</a>
                          : <span style={{ color: 'var(--apex-plat-low)', fontSize: 11 }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          {s.status !== 'verified' && (
                            <>
                              <button className="sales-mini" disabled={isBusy === 'proof'} onClick={() => fileInputs.current[s.id]?.click()}>
                                {isBusy === 'proof' ? '…' : (s.proof_url ? 'Cambiar' : 'Justificante')}
                              </button>
                              <input ref={el => (fileInputs.current[s.id] = el)} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                                onChange={e => { onProofPick(s.id, e.target.files?.[0]); e.target.value = '' }} />
                              <button className="sales-mini sales-mini--go" disabled={!s.proof_url || isBusy === 'verify'} onClick={() => onVerify(s.id)} title={s.proof_url ? 'Verificar la venta' : 'Sube primero el justificante'}>
                                {isBusy === 'verify' ? '…' : 'Verificar'}
                              </button>
                            </>
                          )}
                          <button className="sales-mini sales-mini--del" onClick={() => removeSale(s.id)} title="Eliminar">✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {state === 'live' && sales.length === 0 && <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--apex-plat-low)', padding: 24 }}>Sin ventas todavía. Pulsa “+ Venta” o cierra una en una llamada.</td></tr>}
                {state === 'loading' && <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--apex-plat-low)', padding: 24 }}>Cargando…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <style>{SALES_CSS}</style>
    </>
  )
}

const SALES_CSS = `
.sales-tbl .tbl-edit { width: 100%; min-width: 70px; background: transparent; border: 1px solid transparent; color: var(--apex-plat-hi); font-family: var(--apex-font); font-size: 12px; padding: 4px 6px; outline: none; border-radius: 2px; }
.sales-tbl .tbl-edit:hover { border-color: var(--apex-border); }
.sales-tbl .tbl-edit:focus { border-color: var(--apex-plat-mid); background: var(--apex-trigger-bg); }
.sales-tbl .tbl-edit.num { text-align: right; }
.sales-tbl td { vertical-align: middle; }
.sales-badge { display: inline-block; font-size: 10.5px; padding: 2px 8px; border: 1px solid var(--c); color: var(--c); border-radius: 2px; white-space: nowrap; }
.sales-origin { font-size: 10.5px; color: #8AC8E0; border: 1px solid color-mix(in srgb, #8AC8E0 45%, transparent); padding: 2px 6px; border-radius: 2px; }
.sales-mini { background: transparent; border: 1px solid var(--apex-border); color: var(--apex-plat-mid); font-family: var(--apex-font); font-size: 11px; padding: 4px 8px; cursor: pointer; white-space: nowrap; }
.sales-mini:hover:not(:disabled) { color: var(--apex-plat-hi); border-color: var(--apex-plat-mid); }
.sales-mini:disabled { opacity: 0.4; cursor: not-allowed; }
.sales-mini--go { border-color: color-mix(in srgb, #6FCF9C 45%, transparent); color: #6FCF9C; }
.sales-mini--del { border-color: transparent; color: var(--apex-plat-low); padding: 4px 6px; }
.sales-mini--del:hover { color: #E58371; }
`
