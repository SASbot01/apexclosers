import { Link } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import { CLIENTS, clientInitials } from '../../data/mock/clients'
import { MOCK_CALLS } from '../../data/mock/calls'
import { MOCK_SALES } from '../../data/mock/sales'
import { MOCK_LEADS } from '../../data/mock/leads'

/*
 * Clientes (= proyectos). Cada cliente agrupa llamadas, leads, ventas, reports
 * y conversaciones. Aquí la lista con stats; el detalle en /clientes/:id.
 */
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)

function statsFor(id) {
  const sales = MOCK_SALES.filter(s => s.client_id === id)
  return {
    calls: MOCK_CALLS.filter(c => c.client_id === id).length,
    cierres: sales.length,
    cash: sales.reduce((a, s) => a + s.cash_collected, 0),
    leads: MOCK_LEADS.filter(l => l.client_id === id).length,
  }
}

export default function Clients() {
  return (
    <>
      <FloatingHeader title="Clientes" eyebrow="PROYECTOS" />
      <section className="apex-section">
        <div className="cl-grid">
          {CLIENTS.map(c => {
            const s = statsFor(c.id)
            return (
              <Link to={`/clientes/${c.id}`} key={c.id} className="apex-card cl-card">
                <div className="cl-card-head">
                  <span className="cl-avatar">{clientInitials(c.id)}</span>
                  <div><div className="cl-name">{c.name}</div><div className="cl-sector">{c.sector}</div></div>
                </div>
                <div className="cl-stats">
                  <div><span className="cl-stat-v">{s.calls}</span><span className="cl-stat-l">Llamadas</span></div>
                  <div><span className="cl-stat-v">{s.cierres}</span><span className="cl-stat-l">Cierres</span></div>
                  <div><span className="cl-stat-v">{money(s.cash)}</span><span className="cl-stat-l">Cash</span></div>
                  <div><span className="cl-stat-v">{s.leads}</span><span className="cl-stat-l">Leads</span></div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </>
  )
}
