import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import FilterBar, { SelectFilter } from '../../components/Filters'
import SegTabs from '../../components/SegTabs'
import StatusBadge from '../../components/StatusBadge'
import { useCalls } from '../../data/hooks/useCalls'
import { startRecording } from '../../lib/api'
import { fmtDateTime, PLATFORM_LABEL } from '../../lib/format'
import { CLIENT_OPTIONS } from '../../data/mock/clients'

const CALLS_TABS = [{ to: '/llamadas', label: 'Llamadas' }, { to: '/scripts', label: 'Guion' }, { to: '/calendario', label: 'Calendario' }]

/*
 * Llamadas — lista + barra para lanzar el Notetaker (Recall.ai).
 * Datos reales vía /api/recall; en dev sin backend cae a mock (badge "datos demo").
 */
export default function Calls() {
  const { calls, loading, source, refresh } = useCalls()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [client, setClient] = useState('all')
  const navigate = useNavigate()

  const visible = calls.filter(c => client === 'all' || c.client_id === client)

  async function start(e) {
    e.preventDefault()
    const m = url.trim()
    if (!m || busy) return
    setBusy(true); setMsg(null)
    try {
      const r = await startRecording(m, title.trim() || undefined)
      setMsg({ ok: true, text: `Bot lanzado (${r.botId}). Entrando a la reunión…` })
      setUrl(''); setTitle('')
      setTimeout(refresh, 1500)
    } catch {
      setMsg({ ok: false, text: 'No se pudo lanzar el bot. Necesita el backend desplegado (Vercel + RECALL_API_KEY + Supabase). En local sin API los datos de abajo son de ejemplo.' })
    } finally {
      setBusy(false)
    }
  }

  const sourceLabel = source === 'mock' ? 'datos demo' : source === 'live' ? 'en vivo' : ''

  return (
    <>
      <FloatingHeader
        title="Llamadas"
        eyebrow="VENTAS"
        actions={
          <>
            <SegTabs tabs={CALLS_TABS} />
            <FilterBar>
              <SelectFilter label="Cliente" value={client} options={CLIENT_OPTIONS} onChange={setClient} />
              <span className="ac-source" data-source={source}>{sourceLabel}</span>
            </FilterBar>
          </>}
      />
      <section className="apex-section">
        <div className="apex-card" style={{ padding: 20 }}>
          <form className="ac-start" onSubmit={start}>
            <input className="ac-input" placeholder="Pega el enlace de la reunión (Meet / Zoom)…" value={url} onChange={e => setUrl(e.target.value)} />
            <input className="ac-input" style={{ flex: '0 0 200px' }} placeholder="Título (opcional)" value={title} onChange={e => setTitle(e.target.value)} />
            <button className="ac-btn" disabled={busy || !url.trim()}>{busy ? 'Lanzando…' : 'Grabar llamada'}</button>
          </form>
          {msg
            ? <p className="ac-hint" style={msg.ok ? undefined : { color: 'var(--apex-status-neg, #E58371)' }}>{msg.text}</p>
            : <p className="ac-hint">El Notetaker entra a la reunión, graba y transcribe. Solo graba si la reunión se realiza (se va solo si hay no-show).</p>}
        </div>

        <div className="ac-list">
          {loading && <div className="apex-card ac-empty">Cargando…</div>}
          {!loading && visible.length === 0 && (
            <div className="apex-card ac-empty">Aún no hay llamadas. Lanza la primera con el enlace de arriba.</div>
          )}
          {visible.map(c => (
            <div
              key={c.id}
              className="apex-card ac-item"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/llamadas/${c.id}`)}
              onKeyDown={e => { if (e.key === 'Enter') navigate(`/llamadas/${c.id}`) }}
            >
              <div className="ac-item-main">
                <h4>{c.title || 'Llamada sin título'}</h4>
                <div className="ac-meta">
                  <span>{fmtDateTime(c.started_at || c.scheduled_at)}</span>
                  {c.platform && <span>{PLATFORM_LABEL[c.platform] || c.platform}</span>}
                  {c.has_transcript && <span>· con transcripción</span>}
                </div>
                {c.next_step && <p className="ac-next">→ {c.next_step}</p>}
              </div>
              <div className="ac-item-side">
                <StatusBadge call={c} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
