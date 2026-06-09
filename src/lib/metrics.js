// Datos que el usuario registra a mano (resultados del guion · import CSV ·
// reporte manual). Ahora van AL BACKEND: los reportes a la tabla `reports`
// (/api/reports) y las ventas a la tabla `sales` (/api/sales, como 'manual'
// pendiente de verificar). Mantenemos un espejo en localStorage como caché para
// render instantáneo / offline; las escrituras son write-through (best-effort).
import { addReportEntry as apiAddReport } from './reportsApi'
import { saveSale } from './salesApi'

const RKEY = 'apex_closer_manual_reports'
const SKEY = 'apex_closer_manual_sales'
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || [] } catch { return [] } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* off */ } }
const uid = (p) => p + Date.now().toString(36) + Math.floor(performance.now())

export const getManualReports = () => read(RKEY)
export const getManualSales = () => read(SKEY)

// Reporte de embudo de un día (+cliente). Caché local + backend (/api/reports).
export function addReportEntry({ client_id = null, date, scheduled = 0, realizadas = 0, offers = 0, deposits = 0, closes = 0 }) {
  const rows = read(RKEY)
  const day = (date || new Date().toISOString()).slice(0, 10)
  let row = rows.find(r => r.client_id === client_id && r.date === day)
  if (!row) { row = { id: uid('mr'), client_id, date: day, scheduled: 0, realizadas: 0, offers: 0, deposits: 0, closes: 0 }; rows.push(row) }
  row.scheduled += scheduled; row.realizadas += realizadas; row.offers += offers; row.deposits += deposits; row.closes += closes
  write(RKEY, rows)
  apiAddReport({ client_id, date: day, scheduled, realizadas, offers, deposits, closes }).catch(() => { /* offline → solo caché */ })
  return row
}

// Venta registrada a mano → tabla de ventas real (pendiente de verificar) + caché.
export function addSale(sale) {
  const rows = read(SKEY)
  const local = { id: uid('ms'), date: sale.date || new Date().toISOString(), client_id: sale.client_id || null, closer: sale.closer || '', product: sale.product || '', revenue: Number(sale.revenue || 0), cash_collected: Number(sale.cash_collected || 0), payment_method: sale.payment_method || '', payment_type: sale.payment_type || 'Pago único' }
  rows.push(local)
  write(SKEY, rows)
  saveSale({
    client_id: local.client_id, date: local.date, closer: local.closer, product: local.product,
    revenue: local.revenue, cash_collected: local.cash_collected, payment_method: local.payment_method,
    payment_type: local.payment_type, source: 'manual', status: 'pending',
  }).catch(() => { /* offline → solo caché */ })
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
