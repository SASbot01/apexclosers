import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import StatusBadge from '../../components/StatusBadge'
import { getClient } from '../../data/mock/clients'
import { MOCK_CALLS } from '../../data/mock/calls'
import { MOCK_SALES } from '../../data/mock/sales'
import { MOCK_LEADS } from '../../data/mock/leads'
import { useClientConversations } from '../../lib/conversations'
import { fmtDateTime } from '../../lib/format'

/*
 * Detalle de cliente — todo del cliente en un sitio: KPIs, conversación (que
 * aprende), resumen + feedback generables, y sus llamadas y leads.
 */
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)

function Prose({ text }) {
  if (!text) return null
  const lines = text.split('\n'); const out = []; let list = null
  const flush = (k) => { if (list) { out.push(<ul key={'u' + k}>{list}</ul>); list = null } }
  lines.forEach((ln, i) => {
    const t = ln.trim()
    if (t.startsWith('## ')) { flush(i); out.push(<h4 key={i}>{t.slice(3)}</h4>) }
    else if (t.startsWith('- ')) { (list = list || []).push(<li key={'l' + i}>{t.slice(2)}</li>) }
    else if (t) { flush(i); out.push(<p key={i}>{t}</p>) }
  })
  flush('end')
  return <div className="prose">{out}</div>
}

function buildSummary(name, calls, sales, leads) {
  const cash = sales.reduce((a, s) => a + s.cash_collected, 0)
  const pend = leads.filter(l => l.next_step && l.stage !== 'cerrado')
  const steps = pend.slice(0, 5).map(l => `- ${l.name}: ${l.next_step}`).join('\n') || '- Sin seguimientos pendientes'
  return `## Resumen de ${name}\n${calls.length} llamadas · ${sales.length} cierres · ${money(cash)} cash · ${leads.length} leads (${pend.length} con seguimiento pendiente).\n\n## Próximos pasos\n${steps}`
}
function buildFeedback(name, calls, leads) {
  const won = calls.filter(c => c.outcome === 'won').length
  const lost = calls.filter(c => c.outcome === 'lost').length
  const noShow = calls.filter(c => c.outcome === 'no_show').length
  const hot = leads.filter(l => l.stage === 'propuesta' || l.stage === 'agendada').map(l => l.name).join(', ') || '—'
  return `## Feedback para ${name}\n- Resultado: ${won} cierres · ${lost} perdidas · ${noShow} no-shows.\n- Recomendación: reforzar la confirmación de llamadas (bajar no-shows) y trabajar la objeción de precio en el seguimiento.\n- Leads calientes: ${hot}.`
}

export default function ClientDetail() {
  const { id } = useParams()
  const client = getClient(id)
  const calls = MOCK_CALLS.filter(c => c.client_id === id)
  const sales = MOCK_SALES.filter(s => s.client_id === id)
  const leads = MOCK_LEADS.filter(l => l.client_id === id)
  const chat = useClientConversations(id)
  const [input, setInput] = useState('')
  const [doc, setDoc] = useState(null)

  if (!client) {
    return (<><FloatingHeader title="Cliente" eyebrow="PROYECTO" /><section className="apex-section"><div className="apex-card ac-empty">No existe ese cliente. <Link to="/clientes">Volver a Clientes</Link></div></section></>)
  }

  const cash = sales.reduce((a, s) => a + s.cash_collected, 0)
  const kpis = [
    { label: 'Llamadas', value: calls.length },
    { label: 'Cierres', value: sales.length },
    { label: 'Cash', value: money(cash) },
    { label: 'Leads', value: leads.length },
  ]
  const submit = (e) => { e.preventDefault(); if (input.trim()) { chat.send(input); setInput('') } }

  return (
    <>
      <FloatingHeader title={client.name} eyebrow="CLIENTE" actions={<Link to="/clientes" className="home-link">← Clientes</Link>} />

      <section className="apex-section">
        <div className="apex-card fx-grid">
          {kpis.map(k => (<div className="fx-kpi" key={k.label}><span className="fx-kpi-label">{k.label}</span><span className="fx-kpi-value">{k.value}</span></div>))}
        </div>
      </section>

      <section className="apex-section apex-grid-2">
        <div className="apex-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', minHeight: 380 }}>
          <div className="cl-chat-head">
            <h3>Conversación</h3>
            <button className="set-btn" onClick={chat.newConversation}>Nueva</button>
          </div>
          <div className="cl-chat-body">
            {chat.active.messages.length === 0 && <p className="ac-empty" style={{ padding: '8px 0' }}>Habla sobre {client.name} para ir aprendiendo. En vivo, el Orbe recuerda todo del cliente.</p>}
            {chat.active.messages.map((m, i) => (
              <div key={i} className={`apex-orb-msg apex-orb-msg--${m.role}`}><div className="apex-orb-msg-bubble">{m.body}</div></div>
            ))}
          </div>
          <form className="apex-orb-form" onSubmit={submit}>
            <textarea className="apex-orb-input" rows={1} placeholder={`Habla sobre ${client.name}…`} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit(e) }} />
            <button className="apex-orb-send" type="submit" aria-label="Enviar">→</button>
          </form>
        </div>

        <div className="apex-card" style={{ padding: 24 }}>
          <div className="home-head"><h3>Resumen y feedback</h3></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className="ac-btn" onClick={() => setDoc({ type: 'res', text: buildSummary(client.name, calls, sales, leads) })}>Generar resumen</button>
            <button className="ac-btn" style={{ background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }} onClick={() => setDoc({ type: 'fb', text: buildFeedback(client.name, calls, leads) })}>Feedback para el cliente</button>
          </div>
          {doc ? <Prose text={doc.text} /> : <p className="ac-empty" style={{ padding: 0 }}>Genera un resumen del cliente o un feedback en base a sus llamadas y leads. En vivo lo redacta el Orbe con IA.</p>}
        </div>
      </section>

      <section className="apex-section apex-grid-2">
        <div className="apex-card" style={{ padding: 24 }}>
          <div className="home-head"><h3>Llamadas</h3><Link to="/llamadas" className="home-link">Llamadas →</Link></div>
          <div className="home-list">
            {calls.slice(0, 6).map(c => (
              <Link to={`/llamadas/${c.id}`} key={c.id} className="home-row home-row--split">
                <span className="home-row-title">{c.title}</span>
                <span className="home-row-meta"><span className="home-row-date">{fmtDateTime(c.started_at)}</span><StatusBadge call={c} /></span>
              </Link>
            ))}
            {calls.length === 0 && <p className="ac-empty" style={{ padding: 0 }}>Sin llamadas.</p>}
          </div>
        </div>
        <div className="apex-card" style={{ padding: 24 }}>
          <div className="home-head"><h3>Leads</h3><Link to="/pipeline" className="home-link">Leads →</Link></div>
          <div className="home-list">
            {leads.map(l => (
              <div key={l.id} className="home-row home-row--split">
                <span className="home-row-title">{l.name}</span>
                <span className="home-row-date">{l.next_step || '—'}</span>
              </div>
            ))}
            {leads.length === 0 && <p className="ac-empty" style={{ padding: 0 }}>Sin leads.</p>}
          </div>
        </div>
      </section>
    </>
  )
}
