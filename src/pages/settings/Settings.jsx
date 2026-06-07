import { useNavigate } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import { useCurrentUser, signOut } from '../../lib/auth'

/*
 * Ajustes — cuenta · perfil · calendario · uso (tokens).
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
