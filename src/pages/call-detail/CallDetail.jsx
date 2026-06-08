import { useParams, Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check } from 'lucide-react'
import FloatingHeader from '../../components/FloatingHeader'
import StatusBadge from '../../components/StatusBadge'
import ProgressRing from '../../components/ProgressRing'
import { useCall } from '../../data/hooks/useCall'

/*
 * Detalle de llamada — VÍDEO + análisis IA (resumen automático) + transcripción.
 * Los paneles de IA (score, objeciones, próximos pasos, dimensiones) solo se
 * pintan si vienen en los datos de la llamada — en producción los provee el
 * backend de IA; en demo vienen de los datos de ejemplo. Si no hay análisis,
 * se cae al layout simple (resumen + feedback + transcripción).
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

const fmtMs = (ms) => { const s = Math.floor((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const scoreLabel = (v) => v >= 0.85 ? 'Excelente' : v >= 0.7 ? 'Bueno' : v >= 0.5 ? 'Mejorable' : 'A mejorar'
const pct = (v) => `${Math.round((v || 0) * 100)}%`

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

function TranscriptCard({ call, hasTr }) {
  return (
    <div className="apex-card cd-card">
      <div className="home-head" style={{ marginBottom: 12 }}>
        <span className="cd-h" style={{ margin: 0 }}>Transcripción</span>
        {hasTr && <button className="set-btn" onClick={() => exportTranscript(call)}>Exportar</button>}
      </div>
      {hasTr
        ? <div className="cd-tr-body">{call.transcript.map((s, i) => (
            <div className="tr-seg" key={i}>
              <div className="tr-seg-head">
                <span className="tr-chip" data-me={/closer/i.test(s.speaker) || undefined}>{s.speaker}</span>
                {s.startMs != null && <span className="tr-time">{fmtMs(s.startMs)}</span>}
              </div>
              <div className="tr-text">{s.text}</div>
            </div>
          ))}</div>
        : <p className="ac-empty" style={{ padding: 0 }}>Sin transcripción.</p>}
    </div>
  )
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
  const objections = Array.isArray(call.objections) ? call.objections : []
  const dimensions = Array.isArray(call.dimensions) ? call.dimensions : []
  const nextSteps = Array.isArray(call.next_steps) ? call.next_steps : []
  const hasAnalysis = call.score != null || objections.length > 0 || dimensions.length > 0 || nextSteps.length > 0

  const SummaryCard = (
    <div className="apex-card" style={{ padding: 24 }}>
      <h3 style={{ margin: '0 0 12px', fontWeight: 400 }}>Resumen</h3>
      {call.summary ? <Prose text={call.summary} /> : <p className="ac-empty" style={{ padding: 0 }}>Sin resumen todavía. Se genera al terminar la llamada.</p>}
    </div>
  )
  const FeedbackCard = (
    <div className="apex-card" style={{ padding: 24 }}>
      <h3 style={{ margin: '0 0 12px', fontWeight: 400 }}>Feedback</h3>
      {call.feedback ? <Prose text={call.feedback} /> : <p className="ac-empty" style={{ padding: 0 }}>Sin feedback todavía.</p>}
    </div>
  )

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

      {hasAnalysis ? (
        <>
          <section className="apex-section">
            <div className="cd-grid">
              <TranscriptCard call={call} hasTr={hasTr} />

              <div className="cd-stack">
                {call.score != null && (
                  <div className="apex-card cd-card">
                    <span className="cd-h">Análisis con IA</span>
                    <div className="cd-score">
                      <ProgressRing value={call.score} size={120} stroke={10} card={false} />
                      <div>
                        <div className="cd-score-label">{scoreLabel(call.score)}</div>
                        <div className="cd-score-sub">Puntuación de la llamada</div>
                      </div>
                    </div>
                  </div>
                )}
                {objections.length > 0 && (
                  <div className="apex-card cd-card">
                    <span className="cd-h">Objeciones identificadas</span>
                    {objections.map((o, i) => (
                      <div className="cd-obj" key={i}>
                        <span className="cd-obj-ic"><AlertTriangle size={15} strokeWidth={1.8} /></span>
                        <div><div className="cd-obj-t">{o.label}</div>{o.note && <div className="cd-obj-n">{o.note}</div>}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="cd-stack">
                {nextSteps.length > 0 && (
                  <div className="apex-card cd-card">
                    <span className="cd-h">Próximos pasos acordados</span>
                    {nextSteps.map((s, i) => (
                      <div className="cd-step" key={i}>
                        <span className="cd-step-ic"><Check size={13} strokeWidth={2.4} /></span>
                        <span className="cd-step-t">{s}</span>
                        <ArrowRight size={14} className="cd-step-go" />
                      </div>
                    ))}
                  </div>
                )}
                {dimensions.length > 0 && (
                  <div className="apex-card cd-card">
                    <span className="cd-h">Rendimiento por dimensión</span>
                    {dimensions.map((d, i) => (
                      <div className="cd-dim" key={i}>
                        <div className="cd-dim-top"><span>{d.label}</span><span className="cd-dim-v">{pct(d.value)}</span></div>
                        <div className="cd-dim-bar"><div className="cd-dim-fill" style={{ width: pct(d.value) }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="apex-section apex-grid-2">
            {SummaryCard}
            {FeedbackCard}
          </section>
        </>
      ) : (
        <section className="apex-section apex-grid-2">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {SummaryCard}
            {FeedbackCard}
          </div>
          <TranscriptCard call={call} hasTr={hasTr} />
        </section>
      )}

      <style>{CD_CSS}</style>
    </>
  )
}

const CD_CSS = `
.cd-grid { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 1024px) { .cd-grid { grid-template-columns: 1fr; } }
.cd-stack { display: flex; flex-direction: column; gap: 16px; }
.cd-card { padding: 20px 22px; }
.cd-h { display: block; font-family: var(--apex-font-mono); font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--apex-plat-low); margin-bottom: 14px; }

.cd-tr-body { display: flex; flex-direction: column; gap: 14px; max-height: 560px; overflow-y: auto; padding-right: 4px; }
.tr-seg-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tr-chip { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--apex-plat-low); border: 1px solid var(--apex-border); padding: 2px 8px; border-radius: var(--apex-radius-pill, 0); }
.tr-chip[data-me] { color: var(--apex-accent, var(--apex-plat-hi)); border-color: color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 45%, transparent); }
.tr-time { font-size: 10.5px; color: var(--apex-plat-shad); font-variant-numeric: tabular-nums; }

.cd-score { display: flex; align-items: center; gap: 18px; }
.cd-score-label { font-size: 18px; color: var(--apex-plat-hi); }
.cd-score-sub { font-size: 11.5px; color: var(--apex-plat-low); margin-top: 2px; }

.cd-obj { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid var(--apex-alpha-3); }
.cd-obj:first-of-type { border-top: 0; }
.cd-obj-ic { color: var(--apex-status-neg); flex: 0 0 auto; margin-top: 1px; display: inline-flex; }
.cd-obj-t { font-size: 13px; color: var(--apex-plat-hi); }
.cd-obj-n { font-size: 12px; color: var(--apex-plat-low); line-height: 1.45; margin-top: 2px; }

.cd-step { display: flex; align-items: center; gap: 10px; padding: 11px 12px; margin-bottom: 8px; border: 1px solid color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 28%, var(--apex-border)); background: var(--apex-accent-soft, transparent); border-radius: var(--apex-radius-sm, 0); }
.cd-step:last-child { margin-bottom: 0; }
.cd-step-ic { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex: 0 0 20px; border-radius: 50%; background: var(--apex-accent, var(--apex-plat-hi)); color: var(--apex-accent-ink, var(--apex-bg)); }
.cd-step-t { flex: 1; font-size: 12.5px; color: var(--apex-plat-hi); line-height: 1.4; }
.cd-step-go { color: var(--apex-plat-low); flex: 0 0 auto; }

.cd-dim { margin-bottom: 12px; }
.cd-dim:last-child { margin-bottom: 0; }
.cd-dim-top { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--apex-plat-mid); margin-bottom: 5px; }
.cd-dim-v { color: var(--apex-plat-hi); font-variant-numeric: tabular-nums; }
.cd-dim-bar { height: 6px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); overflow: hidden; border-radius: var(--apex-radius-pill, 0); }
.cd-dim-fill { height: 100%; background: var(--apex-accent, var(--apex-plat-hi)); border-radius: var(--apex-radius-pill, 0); transition: width 0.5s var(--apex-ease-editorial); }
`
