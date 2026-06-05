import { useParams, Link } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import StatusBadge from '../../components/StatusBadge'
import { useCall } from '../../data/hooks/useCall'

/*
 * Detalle de llamada — VÍDEO + resumen + feedback (Claude) + transcripción.
 * Aquí vive la transcripción (no hay sección aparte). El vídeo es imperativo:
 * lo provee Recall (recording_url) tras la grabación.
 */
function Prose({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  const out = []
  let list = null
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

function exportTranscript(call) {
  const lines = (call.transcript || []).map(s => `${s.speaker}: ${s.text}`)
  const body = `${call.title || 'Llamada'}\n${call.started_at || ''}\n\n` + lines.join('\n\n')
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `transcripcion-${call.id}.txt`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export default function CallDetail() {
  const { id } = useParams()
  const { call, loading } = useCall(id)

  if (loading) {
    return (<><FloatingHeader title="Detalle de llamada" eyebrow="LLAMADA" /><section className="apex-section"><div className="apex-card ac-empty">Cargando…</div></section></>)
  }
  if (!call) {
    return (<><FloatingHeader title="Detalle de llamada" eyebrow="LLAMADA" /><section className="apex-section"><div className="apex-card ac-empty">No se encontró la llamada. <Link to="/llamadas">Volver a Llamadas</Link></div></section></>)
  }

  const hasTr = Array.isArray(call.transcript) && call.transcript.length > 0

  return (
    <>
      <FloatingHeader title={call.title || 'Detalle de llamada'} eyebrow="LLAMADA" actions={<StatusBadge call={call} />} />

      {/* Vídeo de la grabación */}
      <section className="apex-section">
        <div className="apex-card cd-video-card">
          {call.recording_url
            ? <video className="cd-video" src={call.recording_url} controls preload="metadata" />
            : <div className="cd-video-empty">El vídeo de la llamada aparecerá aquí cuando termine la grabación.</div>}
        </div>
      </section>

      <section className="apex-section apex-grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="apex-card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontWeight: 400 }}>Resumen</h3>
            {call.summary ? <Prose text={call.summary} /> : <p className="ac-empty" style={{ padding: 0 }}>Sin resumen todavía. Se genera al terminar la llamada.</p>}
          </div>
          <div className="apex-card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontWeight: 400 }}>Feedback</h3>
            {call.feedback ? <Prose text={call.feedback} /> : <p className="ac-empty" style={{ padding: 0 }}>Sin feedback todavía.</p>}
          </div>
        </div>
        <div className="apex-card" style={{ padding: 24 }}>
          <div className="home-head" style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontWeight: 400 }}>Transcripción</h3>
            {hasTr && <button className="set-btn" onClick={() => exportTranscript(call)}>Exportar</button>}
          </div>
          {hasTr
            ? <div className="tr">{call.transcript.map((s, i) => (
                <div className="tr-seg" key={i}>
                  <div className="tr-speaker">{s.speaker}</div>
                  <div className="tr-text">{s.text}</div>
                </div>
              ))}</div>
            : <p className="ac-empty" style={{ padding: 0 }}>Sin transcripción.</p>}
        </div>
      </section>
    </>
  )
}
