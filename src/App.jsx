import { Routes, Route, Navigate } from 'react-router-dom'
import { ApexThemeProvider, useApexTheme } from './shell/ThemeContext'
import AuthGate from './shell/AuthGate'
import AtmosphericCanvas from './shell/AtmosphericCanvas'
import ApexOrb from './shell/ApexOrb'
import ApexLayout from './shell/ApexLayout'
import Calls from './pages/calls/Calls'
import CallDetail from './pages/call-detail/CallDetail'
import Clients from './pages/clients/Clients'
import ClientDetail from './pages/clients/ClientDetail'
import Scripts from './pages/scripts/Scripts'
import LiveScript from './pages/scripts/LiveScript'
import Roleplay from './pages/scripts/Roleplay'
import Calendar from './pages/calendar/Calendar'
import Leads from './pages/leads/Leads'
import Finance from './pages/finance/Finance'
import Reports from './pages/reports/Reports'
import Settings from './pages/settings/Settings'
import Profile from './pages/profile/Profile'
import Sequences from './pages/sequences/Sequences'
import Ranking from './pages/ranking/Ranking'
import Workshop from './pages/workshop/Workshop'
import CV from './pages/cv/CV'
import ClientPortal from './pages/client/ClientPortal'
import Offers from './pages/offers/Offers'
import Admin from './pages/admin/Admin'
import { useCurrentUser } from './lib/auth'

/*
 * Shell de la app (software sin nombre · marca = logo Apex).
 * IA limpia: Home · Llamadas · Pipeline · Ajustes.
 *   - La transcripción vive DENTRO del detalle de la llamada (/llamadas/:id).
 *   - Los seguimientos viven DENTRO del Pipeline.
 */
export default function App() {
  return (
    <ApexThemeProvider>
      <Routes>
        {/* Panel de administración — login propio, fuera del AuthGate. */}
        <Route path="/admin" element={<Admin />} />
        {/* Currículum web público (compartible) — fuera del AuthGate. */}
        <Route path="/cv/:userId" element={<CV />} />
        <Route path="/cv" element={<CV />} />
        <Route path="/*" element={<AuthGate><Shell /></AuthGate>} />
      </Routes>
    </ApexThemeProvider>
  )
}

function Shell() {
  const { theme } = useApexTheme()
  const user = useCurrentUser()
  const isClient = user?.account_type === 'client'
  return (
    <div className="apex-ops" data-theme={theme}>
      <AtmosphericCanvas />
      <Routes>
        <Route element={<ApexLayout />}>
          <Route index element={<Navigate to={isClient ? '/cliente' : '/perfil'} replace />} />
          <Route path="cliente" element={<ClientPortal />} />
          <Route path="ofertas" element={<Offers />} />
          <Route path="workshop" element={<Workshop />} />
          <Route path="llamadas" element={<Calls />} />
          <Route path="llamadas/:id" element={<CallDetail />} />
          <Route path="clientes" element={<Clients />} />
          <Route path="clientes/:id" element={<ClientDetail />} />
          <Route path="scripts" element={<Scripts />} />
          <Route path="scripts/live/:clientId" element={<LiveScript />} />
          <Route path="scripts/roleplay/:clientId" element={<Roleplay />} />
          <Route path="calendario" element={<Calendar />} />
          <Route path="pipeline" element={<Leads />} />
          <Route path="leads" element={<Leads />} />
          <Route path="finanzas" element={<Finance />} />
          <Route path="reports" element={<Reports />} />
          <Route path="ajustes" element={<Settings />} />
          <Route path="perfil" element={<Profile />} />
          <Route path="perfil/:userId" element={<Profile />} />
          <Route path="secuencias" element={<Sequences />} />
          <Route path="ranking" element={<Ranking />} />
          {/* Rutas viejas → fusionadas */}
          <Route path="transcripciones" element={<Navigate to="/llamadas" replace />} />
          <Route path="seguimientos" element={<Navigate to="/pipeline" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ApexOrb />
    </div>
  )
}
