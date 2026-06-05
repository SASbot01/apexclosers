import FloatingHeader from '../../components/FloatingHeader'
import SegTabs from '../../components/SegTabs'
import { useCurrentUser } from '../../lib/auth'

/*
 * Calendario — Google Calendar embebido DENTRO de la app (parte del UX/UI),
 * en hora de España (Europe/Madrid). Bidireccional: es tu calendario real, lo
 * editas aquí mismo (si estás logueado con tu Google en el navegador) y los
 * eventos de venta crean leads solos vía api/calendar.js (sync).
 */
const CALLS_TABS = [
  { to: '/llamadas', label: 'Llamadas' },
  { to: '/scripts', label: 'Guion' },
  { to: '/calendario', label: 'Calendario' },
]

export default function Calendar() {
  const user = useCurrentUser() || {}
  const src = encodeURIComponent(user.email || 'primary')
  // ctz fija la zona horaria a España; mode=WEEK + lunes; muestra tu agenda real.
  const url = `https://calendar.google.com/calendar/embed?src=${src}&ctz=Europe%2FMadrid&mode=WEEK&wkst=2&showTitle=0&showPrint=0&showCalendars=0`

  return (
    <>
      <FloatingHeader title="Calendario" eyebrow="LLAMADAS" actions={
        <>
          <SegTabs tabs={CALLS_TABS} />
          <span className="ac-source">hora España</span>
        </>
      } />
      <section className="apex-section">
        <div className="apex-card cal-card">
          <iframe title="Google Calendar" className="cal-iframe" src={url} loading="lazy" />
        </div>
        <p className="set-note">
          Vista en vivo de tu Google Calendar (Europe/Madrid). Edita aquí directamente: los cambios
          van a tu calendario y viceversa. Las llamadas de venta crean leads solos (sync). Si no
          carga, inicia sesión con tu Google en este navegador o comparte el calendario.
        </p>
      </section>
    </>
  )
}
