// Datos registrados por el usuario (resultados del guion · import CSV · reporte
// manual). Se suman al baseline mock en Reports y Finanzas. Persistido en
// localStorage (demo); en producción → tablas call_results/sales/reports.
const RKEY = 'apex_closer_manual_reports' // [{id,client_id,date,scheduled,realizadas,offers,deposits,closes}]
const SKEY = 'apex_closer_manual_sales'   // [{id,client_id,date,closer,product,revenue,cash_collected,payment_method,payment_type}]
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || [] } catch { return [] } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* off */ } }
const uid = (p) => p + Date.now().toString(36) + Math.floor(performance.now())

export const getManualReports = () => read(RKEY)
export const getManualSales = () => read(SKEY)

// Suma contadores a la fila del MISMO día (+ cliente). Si no existe, la crea.
// → "si es de un día que ya tiene, simplemente se añade a lo del día".
export function addReportEntry({ client_id = null, date, scheduled = 0, realizadas = 0, offers = 0, deposits = 0, closes = 0 }) {
  const rows = read(RKEY)
  const day = (date || new Date().toISOString()).slice(0, 10)
  let row = rows.find(r => r.client_id === client_id && r.date === day)
  if (!row) { row = { id: uid('mr'), client_id, date: day, scheduled: 0, realizadas: 0, offers: 0, deposits: 0, closes: 0 }; rows.push(row) }
  row.scheduled += scheduled; row.realizadas += realizadas; row.offers += offers; row.deposits += deposits; row.closes += closes
  write(RKEY, rows)
  return row
}

export function addSale(sale) {
  const rows = read(SKEY)
  rows.push({ id: uid('ms'), date: sale.date || new Date().toISOString(), client_id: sale.client_id || null, closer: sale.closer || '', product: sale.product || '', revenue: Number(sale.revenue || 0), cash_collected: Number(sale.cash_collected || 0), payment_method: sale.payment_method || '', payment_type: sale.payment_type || 'Pago único' })
  write(SKEY, rows)
  return rows
}

// ── CSV ──
function parseCsv(text) {
  const lines = (text || '').trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const head = lines[0].split(',').map(h => h.trim().toLowerCase())
  return lines.slice(1).map(line => {
    const cells = line.split(',')
    const o = {}; head.forEach((h, i) => { o[h] = (cells[i] || '').trim() })
    return o
  })
}

// CSV ventas: date,revenue,cash_collected[,product,closer,payment_method,payment_type,client_id]
export function importSalesCsv(text) {
  const rows = parseCsv(text); let n = 0
  for (const r of rows) {
    if (!r.date && !r.revenue) continue
    addSale({
      date: r.date || new Date().toISOString(), client_id: r.client_id || null,
      closer: r.closer || '', product: r.product || '',
      revenue: Number(r.revenue || 0), cash_collected: Number(r.cash_collected || r.cash || r.revenue || 0),
      payment_method: r.payment_method || '', payment_type: r.payment_type || 'Pago único',
    }); n++
  }
  return n
}

// CSV reportes: date,scheduled,realizadas,offers,deposits,closes[,client_id]
export function importReportsCsv(text) {
  const rows = parseCsv(text); let n = 0
  for (const r of rows) {
    if (!r.date) continue
    addReportEntry({
      client_id: r.client_id || null, date: r.date,
      scheduled: Number(r.scheduled || r.agendadas || 0),
      realizadas: Number(r.realizadas || 0),
      offers: Number(r.offers || r.ofertas || 0),
      deposits: Number(r.deposits || r.depositos || 0),
      closes: Number(r.closes || r.cierres || 0),
    }); n++
  }
  return n
}
