import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ShieldCheck, Trophy, Calendar, Share2, Play, ArrowLeft, MapPin } from 'lucide-react'
import { useApexTheme } from '../../shell/ThemeContext'
import { API_BASE, getUserId } from '../../lib/config'
import { getProfile, getProfileById } from '../../lib/profileApi'
import { getRanking } from '../../lib/workflowApi'
import { CLIENTS } from '../../data/mock/clients'
import ProgressRing from '../../components/ProgressRing'
import AnimatedValue from '../../components/AnimatedValue'
import AvailabilityDot from '../../components/AvailabilityDot'

/*
 * CV web — carta de presentación pública del closer, en la URL /cv/:userId.
 * Dinámica (lee perfil + métricas + ranking, se actualiza en tiempo real),
 * estética Apex Neón. Pensada para compartir el link: foto, badges, ranking,
 * resultados verificados, clientes, redes, reservar llamada y 3 calls.
 * Vive FUERA del AuthGate (App.jsx) para que cualquiera con el link la vea.
 */
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const initials = (name) => (name || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()
const SAMPLE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
const outcomeLabel = (o) => ({ won: 'Cerrada', follow_up: 'Seguimiento', lost: 'No cerrada', no_show: 'No-show', deposit: 'Depósito' }[o] || 'Llamada')

const Stat = ({ label, value, fmt }) => value == null ? null : (
  <div className="cv-stat"><span className="cv-stat-v"><AnimatedValue value={value} fmt={fmt} /></span><span className="cv-stat-l">{label}</span></div>
)
const RingStat = ({ label, value }) => value == null ? null : (
  <div className="cv-ring"><ProgressRing value={value} size={108} stroke={9} card={false} /><span className="cv-ring-l">{label}</span></div>
)

export default function CV() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { theme } = useApexTheme()
  const targetId = userId || getUserId()
  const isOwn = targetId === getUserId()
  const [data, setData] = useState(null)
  const [rank, setRank] = useState(null)
  const [calls, setCalls] = useState([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const p = (userId && userId !== getUserId()) ? getProfileById(targetId) : getProfile()
    p.then(setData).catch(() => setData(false))
    getRanking('global').then(d => setRank((d.ranking || []).find(r => r.user_id === targetId) || null)).catch(() => { })
    // Llamadas destacadas REALES del closer (las 3 últimas cerradas/realizadas).
    fetch(`${API_BASE}/api/recall?action=list&userId=${encodeURIComponent(targetId)}`)
      .then(r => r.json())
      .then(d => setCalls((d.calls || []).filter(c => c.status === 'done' && c.title).slice(0, 3)))
      .catch(() => setCalls([]))
  }, [targetId, userId])

  const share = () => { try { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* off */ } }

  if (data === null) return <div className="apex-ops" data-theme={theme}><div className="cv-page"><div className="cv-loading">Cargando currículum…</div></div></div>
  if (!data) return <div className="apex-ops" data-theme={theme}><div className="cv-page"><div className="cv-loading">No se encontró este perfil.</div></div></div>

  const { profile, metrics = [] } = data
  const m = Object.fromEntries(metrics.map(x => [x.key, x]))
  const agenda = (profile.links || []).find(l => /agenda|calendly|reserv|cita|book/i.test(`${l.label} ${l.url}`))
  const otherLinks = (profile.links || []).filter(l => l !== agenda)
  const levelName = !rank ? null : rank.rank <= 3 ? 'Leyenda' : rank.rank <= 10 ? 'Élite' : rank.rank <= 30 ? 'Pro' : 'Retador'

  return (
    <div className="apex-ops" data-theme={theme}>
      <div className="cv-page">
        <div className="cv-bar">
          {isOwn
            ? <button type="button" className="cv-ghost" onClick={() => navigate('/perfil')}><ArrowLeft size={14} /> Volver al perfil</button>
            : <span className="cv-brand">▲ Apex Closers</span>}
          <button type="button" className="cv-ghost" onClick={share}>{copied ? 'Link copiado ✓' : <><Share2 size={14} /> Compartir</>}</button>
        </div>

        <article className="apex-card cv-card">
          <div className="cv-hero">
            <div className="cv-photo">{profile.photo_url ? <img src={profile.photo_url} alt="" /> : <span>{initials(profile.display_name || profile.nickname)}</span>}</div>
            <div className="cv-hero-id">
              <div className="cv-badges">
                <span className="cv-badge cv-badge--green"><ShieldCheck size={12} strokeWidth={2} /> Closer verificado</span>
                {rank && <span className="cv-badge"><Trophy size={12} strokeWidth={2} /> #{rank.rank} global</span>}
                {levelName && <span className="cv-badge">Nivel {levelName}</span>}
                <span className="cv-badge"><AvailabilityDot status={profile.status} /></span>
              </div>
              <h1 className="cv-name">{profile.display_name || profile.nickname || 'Closer'}</h1>
              {profile.headline && <div className="cv-headline">{profile.headline}</div>}
              <div className="cv-loc">
                {profile.location && <span><MapPin size={12} strokeWidth={2} /> {profile.location}</span>}
                {profile.nickname && <span>@{profile.nickname}</span>}
              </div>
              <div className="cv-cta">
                <a className="cv-btn cv-btn--primary" href={agenda ? agenda.url : '#'} target="_blank" rel="noreferrer"><Calendar size={15} strokeWidth={1.9} /> Reservar llamada</a>
                {otherLinks.map((l, i) => <a key={i} className="cv-btn" href={l.url} target="_blank" rel="noreferrer">{l.label || l.url}</a>)}
              </div>
            </div>
          </div>

          {profile.bio && <p className="cv-bio">{profile.bio}</p>}

          <section className="cv-sec">
            <h2 className="cv-h">Resultados verificados</h2>
            <div className="cv-stats">
              <Stat label="Revenue" value={m.revenue?.value} fmt="money" />
              <Stat label="Cash collected" value={m.cash_collected?.value} fmt="money" />
              <Stat label="Cierres" value={m.deals?.value} fmt="int" />
              <Stat label="Ticket medio" value={m.avg_ticket?.value} fmt="money" />
            </div>
            <div className="cv-rings">
              <RingStat label="Close rate" value={m.close_rate?.value} />
              <RingStat label="Show rate" value={m.show_rate?.value} />
              <RingStat label="% Recollected" value={m.recollected?.value} />
            </div>
          </section>

          <section className="cv-sec">
            <h2 className="cv-h">Ha cerrado para</h2>
            <div className="cv-clients">
              {CLIENTS.map(c => (
                <div className="cv-client" key={c.id}>
                  <span className="cv-client-av">{initials(c.name)}</span>
                  <span className="cv-client-id"><span className="cv-client-name">{c.name}</span><span className="cv-client-sector">{c.sector}</span></span>
                </div>
              ))}
            </div>
          </section>

          {calls.length > 0 && <section className="cv-sec">
            <h2 className="cv-h">Llamadas destacadas</h2>
            <p className="cv-note">Grabaciones seleccionadas para que veas cómo cierra en directo.</p>
            <div className="cv-calls">
              {calls.map(c => (
                <a key={c.id} className="cv-call" href={c.recording_url || SAMPLE} target="_blank" rel="noreferrer">
                  <span className="cv-call-play"><Play size={16} strokeWidth={2} fill="currentColor" /></span>
                  <span className="cv-call-id">
                    <span className="cv-call-title">{c.title}</span>
                    <span className="cv-call-meta">{outcomeLabel(c.outcome)}{c.deal_amount ? ` · ${money(c.deal_amount)}` : ''}</span>
                  </span>
                  <span className="cv-call-go">Ver →</span>
                </a>
              ))}
            </div>
          </section>}

          <footer className="cv-foot">Currículum dinámico · se actualiza en tiempo real con sus resultados · <b>Apex Closers</b></footer>
        </article>
      </div>
      <style>{CV_CSS}</style>
    </div>
  )
}

const CV_CSS = `
.cv-page { min-height: 100vh; max-width: 960px; margin: 0 auto; padding: 28px 20px 60px; display: flex; flex-direction: column; gap: 16px; position: relative; z-index: 10; }
.cv-loading { padding: 80px 20px; text-align: center; color: var(--apex-plat-low); }
.cv-bar { display: flex; align-items: center; justify-content: space-between; }
.cv-brand { font-size: 13px; letter-spacing: 0.06em; color: var(--apex-accent, var(--apex-plat-hi)); }
.cv-ghost { display: inline-flex; align-items: center; gap: 6px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); color: var(--apex-plat-mid); font-family: var(--apex-font); font-size: 12.5px; padding: 8px 12px; border-radius: var(--apex-radius-pill, 0); cursor: pointer; }
.cv-ghost:hover { color: var(--apex-plat-hi); border-color: var(--apex-plat-mid); }

.cv-card { padding: 32px; display: flex; flex-direction: column; gap: 26px; }
.cv-hero { display: flex; gap: 26px; align-items: center; }
.cv-photo { width: 132px; height: 132px; flex: 0 0 132px; border-radius: 50%; overflow: hidden; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border-strong); display: inline-flex; align-items: center; justify-content: center; color: var(--apex-plat-mid); font-size: 40px; box-shadow: 0 10px 28px rgba(0,0,0,0.4); }
.cv-photo img { width: 100%; height: 100%; object-fit: cover; }
.cv-hero-id { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.cv-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 2px; }
.cv-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--apex-plat-mid); border: 1px solid var(--apex-border); padding: 4px 9px; border-radius: var(--apex-radius-pill, 0); }
.cv-badge--green { color: var(--apex-accent, var(--apex-plat-hi)); border-color: color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 45%, transparent); }
.cv-badge svg { color: var(--apex-accent, var(--apex-plat-mid)); }
.cv-name { margin: 2px 0 0; font-weight: 400; font-size: 30px; letter-spacing: -0.02em; color: var(--apex-plat-hi); }
.cv-headline { font-size: 15px; color: var(--apex-plat-mid); }
.cv-loc { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--apex-plat-low); }
.cv-loc span { display: inline-flex; align-items: center; gap: 5px; }
.cv-cta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.cv-btn { display: inline-flex; align-items: center; gap: 7px; font-family: var(--apex-font); font-size: 13px; padding: 9px 16px; border-radius: var(--apex-radius-sm, 0); border: 1px solid var(--apex-border); color: var(--apex-plat-mid); background: var(--apex-trigger-bg); cursor: pointer; text-decoration: none; transition: border-color 0.18s, color 0.18s; }
.cv-btn:hover { color: var(--apex-plat-hi); border-color: var(--apex-plat-mid); }
.cv-btn--primary { background: var(--apex-accent, var(--apex-plat-hi)); color: var(--apex-accent-ink, var(--apex-bg)); border-color: var(--apex-accent, var(--apex-plat-hi)); font-weight: 500; }
.cv-btn--primary:hover { color: var(--apex-accent-ink, var(--apex-bg)); filter: brightness(1.06); }

.cv-bio { margin: 0; font-size: 14px; line-height: 1.65; color: var(--apex-plat-mid); max-width: 70ch; }
.cv-sec { display: flex; flex-direction: column; gap: 14px; padding-top: 22px; border-top: 1px solid var(--apex-alpha-3); }
.cv-h { margin: 0; font-family: var(--apex-font-mono); font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--apex-plat-low); }
.cv-note { margin: -6px 0 0; font-size: 12.5px; color: var(--apex-plat-low); }

.cv-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.cv-stat { display: flex; flex-direction: column; gap: 5px; padding: 16px 18px; background: var(--apex-card-bg); border: 1px solid var(--apex-border); border-radius: var(--apex-radius, 0); }
.cv-stat-v { font-size: 24px; color: var(--apex-plat-hi); font-variant-numeric: tabular-nums; line-height: 1; }
.cv-stat-l { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apex-plat-low); }
.cv-rings { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.cv-ring { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px; background: var(--apex-card-bg); border: 1px solid var(--apex-border); border-radius: var(--apex-radius, 0); }
.cv-ring .ring-card { padding: 0; gap: 0; }
.cv-ring-l { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--apex-plat-low); }

.cv-clients { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.cv-client { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: var(--apex-radius, 0); }
.cv-client-av { width: 38px; height: 38px; flex: 0 0 38px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--apex-surface-hi); border: 1px solid var(--apex-border); font-size: 12px; color: var(--apex-plat-hi); }
.cv-client-id { display: flex; flex-direction: column; min-width: 0; }
.cv-client-name { font-size: 13.5px; color: var(--apex-plat-hi); }
.cv-client-sector { font-size: 11.5px; color: var(--apex-plat-low); }

.cv-calls { display: flex; flex-direction: column; gap: 10px; }
.cv-call { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: var(--apex-radius, 0); text-decoration: none; transition: border-color 0.18s, background 0.18s; }
.cv-call:hover { border-color: color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 40%, var(--apex-border)); background: var(--apex-trigger-bg-h); }
.cv-call-play { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; flex: 0 0 38px; border-radius: 50%; background: var(--apex-accent-soft, var(--apex-alpha-2)); color: var(--apex-accent, var(--apex-plat-hi)); }
.cv-call-id { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cv-call-title { font-size: 13.5px; color: var(--apex-plat-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cv-call-meta { font-size: 11.5px; color: var(--apex-plat-low); }
.cv-call-go { font-size: 12px; color: var(--apex-accent, var(--apex-plat-mid)); flex: 0 0 auto; }

.cv-foot { margin-top: 6px; font-size: 11.5px; color: var(--apex-plat-low); text-align: center; }
.cv-foot b { color: var(--apex-plat-mid); }

@media (max-width: 720px) {
  .cv-hero { flex-direction: column; text-align: center; align-items: center; }
  .cv-loc, .cv-cta, .cv-badges { justify-content: center; }
  .cv-stats { grid-template-columns: repeat(2, 1fr); }
  .cv-rings { grid-template-columns: repeat(3, 1fr); }
  .cv-clients { grid-template-columns: 1fr; }
}
`
