import { Lock, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { clientName } from '../data/mock/clients'

/*
 * Indicador de "vista bloqueada a un cliente" (acceso vía equipo). Sustituye al
 * selector de cliente: solo se ven los datos de esa cuenta, no se puede cambiar a
 * otra. Aparece cuando la página recibe `?client=<id>`.
 */
export default function ClientLock({ clientId }) {
  const navigate = useNavigate()
  return (
    <span className="client-lock" title="Acceso vía equipo · solo esta cuenta">
      <Lock size={12} strokeWidth={2} />
      <span className="client-lock-name">{clientName(clientId)}</span>
      <button type="button" className="client-lock-back" onClick={() => navigate(-1)}><ArrowLeft size={12} strokeWidth={2} /> Volver</button>
    </span>
  )
}
