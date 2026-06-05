// Ventas demo (~36 cierres en los últimos 90 días). Forma pensada para Finanzas
// (revenue, cash, método, closer, producto). Determinista para visual estable.
import { CLIENT_CYCLE } from './clients'

const CLOSERS = ['Alex', 'Laurent', 'María', 'Diego']
const PRODUCTS = ['Programa High Ticket', 'Mentoría', 'Setup SaaS', 'Consultoría']
const METHODS = ['Stripe', 'Transferencia', 'PayPal', 'Crypto']
const AMOUNTS = [900, 1200, 1500, 1800, 2400, 3000, 1500, 1200]

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d }

function gen() {
  const rows = []
  for (let i = 0; i < 36; i++) {
    const day = (i * 83) % 90
    const amount = AMOUNTS[i % AMOUNTS.length]
    const installments = i % 3 === 0
    rows.push({
      id: 's' + (i + 1),
      client_id: CLIENT_CYCLE[i % CLIENT_CYCLE.length],
      date: daysAgo(day).toISOString(),
      closer: CLOSERS[i % CLOSERS.length],
      product: PRODUCTS[i % PRODUCTS.length],
      revenue: amount,
      cash_collected: installments ? Math.round(amount / 2) : amount,
      payment_method: METHODS[i % METHODS.length],
      payment_type: installments ? 'Cuotas' : 'Pago único',
    })
  }
  return rows
}

export const MOCK_SALES = gen()
export const SALES_CLOSERS = CLOSERS
