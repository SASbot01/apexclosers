import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import { useCurrentUser, signOut } from '../../lib/auth'
import { getMetrics, getVisibility, setVisibility as apiSetVisibility } from '../../lib/salesApi'

const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const intf = (v) => new Intl.NumberFormat('es-ES').format(Math.round(v || 0))
const pctv = (v) => v == null ? '—' : `${Math.round(v * 100)}%`
const fmtVal = (m) => m.fmt === 'money' ? money(m.value) : m.fmt === 'pct' ? pctv(m.value) : intf(m.value)

/*
 * Ajustes — cuenta · perfil · métricas públicas/privadas · calendario · uso.
 */
export default function Settings() {
  const user = useCurrentUser() || {}
  const navigate = useNavigate()
  const used = 18, quota = 30 // horas transcritas este mes (mock)
  const pct = Math.min(100, Math.round((used / quota) * 100))

  return (
    <>
      <FloatingHeader title="Ajustes" eyebrow="CUENTA" />
      <section className="apex-section">
        <div className="apex-card set-card">
          <h3>Cuenta</h3>
          <div className="set-row">
            <span className="set-k">Conectado como</span>
            <span className="set-v">{user.name || 'Usuario'}{user.demo ? ' · demo' : ''}</span>
          </div>
          <div className="set-row"><span className="set-k">Email</span><span className="set-v">{user.email || '—'}</span></div>
          <div className="set-row">
            <span className="set-k">Sesión</span>
            <button className="set-btn" onClick={signOut}>Cerrar sesión</button>
          </div>
        </div>

        <div className="apex-card set-card">
          <h3>Perfil</h3>
          <p className="set-note" style={{ margin: '0 0 12px' }}>Tu perfil público: foto, nickname, descripción, links, métricas públicas, amigos y grupos. También puedes generar tu currículum.</p>
          <div className="set-row">
            <span className="set-k">Tu perfil</span>
            <button className="set-btn" onClick={() => navigate('/perfil')}>Abrir perfil</button>
          </div>
          <div className="set-row">
            <span className="set-k">Amigos y grupos</span>
            <button className="set-btn" onClick={() => navigate('/perfil')}>Gestionar</button>
          </div>
          <div className="set-row"><span className="set-k">Idioma</span><span className="set-v">Español (ES)</span></div>
        </div>

        <div className="apex-card set-card">
          <h3>Workflow y seguimiento</h3>
          <p className="set-note" style={{ margin: '0 0 12px' }}>Secuencias de seguimiento por estado de llamada (Email/WhatsApp/SMS) y ranking global de closers.</p>
          <div className="set-row"><span className="set-k">Secuencias</span><button className="set-btn" onClick={() => navigate('/secuencias')}>Configurar</button></div>
          <div className="set-row"><span className="set-k">Ranking global</span><button className="set-btn" onClick={() => navigate('/ranking')}>Ver ranking</button></div>
        </div>

        <MetricsVisibilityCard />

        <div className="apex-card set-card">
          <h3>Calendario</h3>
          <div className="set-row">
            <span className="set-k">Google Calendar</span>
            <button className="set-btn" disabled>Conectar (al desplegar)</button>
          </div>
          <p className="set-note">Conecta tu calendario para que el Notetaker entre solo a tus llamadas de venta.</p>
        </div>

        <div className="apex-card set-card">
          <h3>Uso este mes</h3>
          <div className="set-meter"><div className="set-meter-fill" style={{ width: `${pct}%` }} /></div>
          <p className="set-note">{used} h de {quota} h de transcripción incluidas. El exceso se factura por tokens (overage).</p>
        </div>

        <div className="apex-card set-card">
          <h3>Tema</h3>
          <p className="set-note">Cambia el tema (dark · light · obsidian · pizarra) desde el logo Apex, arriba a la izquierda.</p>
        </div>
      </section>
    </>
  )
}

// Métricas públicas/privadas — el control vive en Ajustes. Lo que marques como
// Pública se ve en tu Perfil (lo ven tus amigos, grupos y la gente que invites).
function MetricsVisibilityCard() {
  const [list, setList] = useState([])
  const [visible, setVisible] = useState({})
  const [state, setState] = useState('loading')

  useEffect(() => {
    Promise.all([getMetrics(), getVisibility()])
      .then(([m, v]) => { setList(m.list || []); setVisible(v || {}); setState('live') })
      .catch(() => setState('error'))
  }, [])

  const toggle = (key) => {
    const next = { ...visible, [key]: !visible[key] }
    setVisible(next)
    apiSetVisibility(next).catch(() => { /* offline */ })
  }

  return (
    <div className="apex-card set-card">
      <h3>Métricas públicas</h3>
      <p className="set-note" style={{ margin: '0 0 12px' }}>
        Elige qué métricas se ven en tu perfil. Las <b>Públicas</b> las pueden ver tus amigos, grupos y la gente que invites; las <b>Privadas</b>, solo tú.
      </p>
      {state === 'error' && <p className="set-note">No pude cargar las métricas (¿backend?).</p>}
      {state === 'loading' && <p className="set-note">Cargando…</p>}
      <div className="set-metrics">
        {list.map(m => (
          <div className="set-metric-row" key={m.key}>
            <div className="set-metric-id">
              <span className="set-metric-name">{m.label}</span>
              <span className="set-metric-val">{fmtVal(m)}</span>
            </div>
            <button type="button" className="set-vis" data-on={visible[m.key] || undefined} onClick={() => toggle(m.key)}>
              <span className="set-vis-dot" />{visible[m.key] ? 'Pública' : 'Privada'}
            </button>
          </div>
        ))}
      </div>
      <style>{`
        .set-metrics { display: flex; flex-direction: column; gap: 6px; }
        .set-metric-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--apex-alpha-3); }
        .set-metric-row:last-child { border-bottom: 0; }
        .set-metric-id { display: flex; align-items: baseline; gap: 10px; }
        .set-metric-name { font-size: 13px; color: var(--apex-plat-hi); }
        .set-metric-val { font-size: 12px; color: var(--apex-plat-low); font-family: var(--apex-font); }
        .set-vis { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid var(--apex-border); color: var(--apex-plat-low); font-family: var(--apex-font); font-size: 11.5px; padding: 4px 10px; cursor: pointer; }
        .set-vis-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--apex-plat-low); }
        .set-vis[data-on] { color: #6FCF9C; border-color: color-mix(in srgb, #6FCF9C 45%, transparent); }
        .set-vis[data-on] .set-vis-dot { background: #6FCF9C; }
      `}</style>
    </div>
  )
}
