// Reports demo — embudo diario del closer (últimos 45 días). Determinista.
// Embudo: Agendadas → Realizadas → Ofertas → Depósitos → Cierres.
import { CLIENT_CYCLE } from './clients'

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

function gen() {
  const rows = []
  for (let i = 0; i < 45; i++) {
    const scheduled = 2 + ((i * 3) % 3)                 // 2..4 agendadas
    const realizadas = Math.max(0, scheduled - (i % 2)) // algún no-show
    const offers = Math.max(0, realizadas - ((i + 1) % 2))
    const deposits = (i % 2 === 0) ? Math.min(offers, 1) : 0
    const closes = (i % 3 === 0) ? deposits : 0          // cierres ≤ depósitos
    rows.push({
      id: 'r' + i, client_id: CLIENT_CYCLE[i % CLIENT_CYCLE.length], date: daysAgo(i),
      scheduled, realizadas, offers, deposits, closes,
    })
  }
  return rows
}

export const MOCK_REPORTS = gen()
