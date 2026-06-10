import { useState, useEffect } from 'react'
import FloatingHeader from '../../components/FloatingHeader'
import { listOffers } from '../../lib/offersApi'

/*
 * Tablón de ofertas — empresas (cuentas de cliente) que buscan closers. Los
 * closers NO se "aplican": las empresas los contactan (reservando llamada en su
 * CV, por chat o invitándolos). Aquí el closer ve quién está contratando.
 */
const initials = (n) => (n || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()

export default function Offers() {
  const [offers, setOffers] = useState([])
  const [state, setState] = useState('loading')
  useEffect(() => { listOffers().then(o => { setOffers(o); setState('live') }).catch(() => setState('error')) }, [])

  return (
    <>
      <FloatingHeader title="Ofertas" eyebrow="EMPLEO PARA CLOSERS" />
      <section className="apex-section">
        <p className="set-note" style={{ margin: 0 }}>Empresas que buscan closers. <b>No te registras tú</b>: ellas te contactan. Mantén tu perfil, tu CV y tu disponibilidad al día para que te encuentren.</p>
      </section>
      <section className="apex-section">
        {state === 'error' && <div className="apex-card" style={{ padding: 16, color: 'var(--apex-plat-mid)' }}>No pude cargar las ofertas.</div>}
        {state === 'live' && offers.length === 0 && <div className="apex-card" style={{ padding: 18, color: 'var(--apex-plat-low)' }}>Aún no hay ofertas publicadas.</div>}
        <div style={{ display: 'grid', gap: 12 }}>
          {offers.map(o => (
            <div className="apex-card" style={{ padding: 20 }} key={o.id}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span className="rk-av" style={{ flex: '0 0 40px', width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', overflow: 'hidden', background: 'var(--apex-trigger-bg)', border: '1px solid var(--apex-border)', fontSize: 13, color: 'var(--apex-plat-hi)' }}>
                  {o.company?.photo_url ? <img src={o.company.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(o.company?.name)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, color: 'var(--apex-plat-hi)' }}>{o.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--apex-accent, var(--apex-plat-mid))', marginTop: 2 }}>{o.company?.name || 'Empresa'}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--apex-plat-low)', marginTop: 6 }}>{[o.product, o.comp, o.location].filter(Boolean).join(' · ')}</div>
                  {o.description && <p style={{ fontSize: 13.5, color: 'var(--apex-plat-mid)', margin: '10px 0 0', lineHeight: 1.55 }}>{o.description}</p>}
                  {o.link && <a className="crm-link" href={o.link} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>Más info →</a>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
