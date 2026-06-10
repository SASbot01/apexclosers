import { useSession, AuthContext, signOut } from '../lib/auth'
import { useApexTheme } from './ThemeContext'
import Landing from '../pages/landing/Landing'

/*
 * AuthGate — sin sesión: landing pública (login Google). Con sesión: si el acceso
 * aún no está aprobado (software de pago → el admin da el OK) o está bloqueado,
 * muestra la pantalla de acceso; si está aprobado, monta la app.
 */
export default function AuthGate({ children }) {
  const { theme } = useApexTheme()
  const { loading, user } = useSession()

  if (loading) return <div className="apex-ops" data-theme={theme} style={{ minHeight: '100vh' }} />
  if (!user) return <Landing />
  // El admin entra siempre; los demás necesitan acceso aprobado.
  if (user.account_type !== 'admin' && user.access && user.access !== 'approved') {
    return <AccessGate theme={theme} user={user} />
  }
  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>
}

function AccessGate({ theme, user }) {
  const blocked = user.access === 'blocked'
  return (
    <div className="apex-ops" data-theme={theme} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <img src="/apex-mark-platinum.svg" alt="Apex" width={48} height={48} style={{ marginBottom: 20, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))' }} />
        <h1 style={{ fontWeight: 400, fontSize: 24, color: 'var(--apex-plat-hi)', margin: '0 0 12px' }}>
          {blocked ? 'Cuenta bloqueada' : 'Cuenta pendiente de aprobación'}
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--apex-plat-mid)', margin: '0 0 24px' }}>
          {blocked
            ? 'Tu acceso a Apex ha sido bloqueado. Si crees que es un error, contacta con el equipo.'
            : 'Tu cuenta está registrada pero aún no tiene acceso activo. En cuanto el equipo de Apex la apruebe, podrás entrar. Te avisaremos.'}
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--apex-plat-low)', margin: '0 0 18px' }}>Conectado como {user.email}</p>
        <button className="ac-btn" style={{ background: 'transparent', color: 'var(--apex-plat-mid)', border: '1px solid var(--apex-border)' }} onClick={signOut}>Cerrar sesión</button>
      </div>
    </div>
  )
}
