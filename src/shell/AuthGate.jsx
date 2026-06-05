import { useSession, AuthContext } from '../lib/auth'
import { useApexTheme } from './ThemeContext'
import Landing from '../pages/landing/Landing'

/*
 * AuthGate — si no hay sesión, muestra la landing pública (con login Google).
 * Si hay sesión, monta la app y expone el usuario vía AuthContext.
 */
export default function AuthGate({ children }) {
  const { theme } = useApexTheme()
  const { loading, user } = useSession()

  if (loading) {
    return <div className="apex-ops" data-theme={theme} style={{ minHeight: '100vh' }} />
  }
  if (!user) {
    return <Landing />
  }
  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>
}
