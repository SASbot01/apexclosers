import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import { getProfile, updateProfile, uploadPhoto, fileToDataUrl } from '../../lib/profileApi'
import { listOffers, saveOffer, deleteOffer } from '../../lib/offersApi'
import { signOut } from '../../lib/auth'
import { getUserId } from '../../lib/config'

/*
 * Portal del CLIENTE (empresa que ofrece trabajo a closers). Su perfil es la
 * empresa: descripción, redes, web, foto. Publica OFERTAS públicas para closers.
 * Los closers NO se registran a las ofertas: el cliente los contacta (agenda del
 * CV / chat / invitación). El cliente también puede buscar closers en el ranking.
 */
const initials = (n) => (n || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()

export default function ClientPortal() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [offers, setOffers] = useState([])
  const [tab, setTab] = useState('ofertas')

  const loadProfile = () => getProfile().then(d => setProfile(d.profile)).catch(() => setProfile({}))
  const loadOffers = () => listOffers(getUserId()).then(setOffers).catch(() => setOffers([]))
  useEffect(() => { loadProfile(); loadOffers() }, [])

  if (!profile) return <><FloatingHeader title="Empresa" eyebrow="CLIENTE" /><section className="apex-section"><div className="apex-card" style={{ padding: 24, color: 'var(--apex-plat-low)' }}>Cargando…</div></section></>

  return (
    <>
      <FloatingHeader title={profile.display_name || 'Tu empresa'} eyebrow="CUENTA DE CLIENTE" actions={
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <button className="ac-btn" style={{ background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }} onClick={() => navigate('/ranking')}>Buscar closers</button>
          <button className="ac-btn" style={{ background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }} onClick={signOut}>Salir</button>
        </div>
      } />

      <section className="apex-section">
        <div className="seg" style={{ width: 'fit-content' }}>
          {[['ofertas', 'Mis ofertas'], ['empresa', 'Perfil de empresa']].map(([k, l]) => (
            <button key={k} className="seg-btn" data-active={tab === k || undefined} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </section>

      {tab === 'ofertas' && <OffersManager offers={offers} onChange={loadOffers} />}
      {tab === 'empresa' && <CompanyProfile profile={profile} onSaved={loadProfile} />}

      <section className="apex-section">
        <div className="apex-card" style={{ padding: 16, color: 'var(--apex-plat-low)', fontSize: 13 }}>
          Para contactar a un closer: abre su perfil desde <b>Buscar closers</b> y reserva una llamada en su currículum, invítalo a tu equipo o como amigo para chatear.
        </div>
      </section>
    </>
  )
}

const EMPTY_OFFER = { title: '', product: '', comp: '', location: '', description: '', link: '', status: 'open' }

function OffersManager({ offers, onChange }) {
  const [form, setForm] = useState(null)   // null | offer (nuevo o edición)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const save = async () => { if (!form.title.trim()) return; await saveOffer(form).catch(() => {}); setForm(null); onChange() }
  const remove = async (id) => { if (window.confirm('¿Borrar esta oferta?')) { await deleteOffer(id).catch(() => {}); onChange() } }

  return (
    <section className="apex-section">
      <div className="apex-card" style={{ padding: 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontWeight: 400 }}>Tus ofertas para closers</h3>
          {!form && <button className="ac-btn" onClick={() => setForm({ ...EMPTY_OFFER })}>+ Nueva oferta</button>}
        </div>
        {form && (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <input className="ac-input" placeholder="Título (ej. Closer high-ticket fitness)" value={form.title} onChange={e => set('title', e.target.value)} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input className="ac-input" style={{ flex: 1, minWidth: 160 }} placeholder="Producto que se vende" value={form.product} onChange={e => set('product', e.target.value)} />
              <input className="ac-input" style={{ flex: 1, minWidth: 160 }} placeholder="Comisión / pago (ej. 20%)" value={form.comp} onChange={e => set('comp', e.target.value)} />
              <input className="ac-input" style={{ flex: 1, minWidth: 140 }} placeholder="Ubicación / remoto" value={form.location} onChange={e => set('location', e.target.value)} />
            </div>
            <textarea className="ac-input" rows={4} placeholder="Descripción: qué buscas, requisitos, condiciones…" value={form.description} onChange={e => set('description', e.target.value)} />
            <input className="ac-input" placeholder="Link a más info (opcional)" value={form.link} onChange={e => set('link', e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ac-btn" onClick={save}>{form.id ? 'Guardar' : 'Publicar oferta'}</button>
              <button className="ac-btn" style={{ background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }} onClick={() => setForm(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {offers.length === 0 && !form && <div className="apex-card" style={{ padding: 18, color: 'var(--apex-plat-low)' }}>Aún no has publicado ofertas. Pulsa “+ Nueva oferta”.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {offers.map(o => (
          <div className="apex-card" style={{ padding: 18 }} key={o.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, color: 'var(--apex-plat-hi)' }}>{o.title} {o.status === 'closed' && <span style={{ fontSize: 11, color: 'var(--apex-plat-low)' }}>· cerrada</span>}</div>
                <div style={{ fontSize: 12.5, color: 'var(--apex-plat-low)', marginTop: 3 }}>{[o.product, o.comp, o.location].filter(Boolean).join(' · ')}</div>
                {o.description && <p style={{ fontSize: 13, color: 'var(--apex-plat-mid)', margin: '8px 0 0', lineHeight: 1.5 }}>{o.description}</p>}
              </div>
              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'flex-start' }}>
                <button className="sales-mini sales-mini--go" onClick={() => setForm({ ...o })}>Editar</button>
                <button className="sales-mini sales-mini--del" onClick={() => remove(o.id)}>Borrar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function CompanyProfile({ profile, onSaved }) {
  const [form, setForm] = useState({
    display_name: profile.display_name || '', headline: profile.headline || '',
    bio: profile.bio || '', location: profile.location || '',
    links: profile.links?.length ? profile.links : [{ label: 'Web', url: '' }],
  })
  const [photo, setPhoto] = useState(profile.photo_url || null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setLink = (i, k, v) => setForm(f => ({ ...f, links: f.links.map((l, j) => j === i ? { ...l, [k]: v } : l) }))
  const addLink = () => setForm(f => ({ ...f, links: [...f.links, { label: '', url: '' }] }))

  const onPhoto = async (file) => { if (!file) return; const url = await fileToDataUrl(file); setPhoto(url); await uploadPhoto(url, file.name).catch(() => {}) }
  const save = async () => {
    setSaving(true)
    await updateProfile({ ...form, links: form.links.filter(l => l.url) }).catch(() => {})
    setSaving(false); onSaved()
  }

  return (
    <section className="apex-section">
      <div className="apex-card" style={{ padding: 22, display: 'grid', gap: 14, maxWidth: 640 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <label style={{ cursor: 'pointer' }}>
            <span className="pf-avatar">{photo ? <img src={photo} alt="" /> : <span>{initials(form.display_name)}</span>}</span>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onPhoto(e.target.files?.[0])} />
          </label>
          <div style={{ fontSize: 12.5, color: 'var(--apex-plat-low)' }}>Logo / foto de la empresa</div>
        </div>
        <label className="sc-lbl">Nombre de la empresa</label>
        <input className="ac-input" value={form.display_name} onChange={e => set('display_name', e.target.value)} placeholder="Tu empresa" />
        <label className="sc-lbl">Titular corto</label>
        <input className="ac-input" value={form.headline} onChange={e => set('headline', e.target.value)} placeholder="Ej. Infoproductos de fitness · buscamos closers" />
        <label className="sc-lbl">Descripción</label>
        <textarea className="ac-input" rows={4} value={form.bio} onChange={e => set('bio', e.target.value)} placeholder="Quiénes sois, qué vendéis, qué buscáis…" />
        <label className="sc-lbl">Ubicación</label>
        <input className="ac-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Ciudad / país / remoto" />
        <label className="sc-lbl">Redes y web</label>
        {form.links.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 8 }}>
            <input className="ac-input" style={{ flex: '0 0 130px' }} placeholder="Etiqueta (Web, IG…)" value={l.label} onChange={e => setLink(i, 'label', e.target.value)} />
            <input className="ac-input" style={{ flex: 1 }} placeholder="https://…" value={l.url} onChange={e => setLink(i, 'url', e.target.value)} />
          </div>
        ))}
        <button className="ac-btn" style={{ background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)', justifySelf: 'start' }} onClick={addLink}>+ Añadir link</button>
        <button className="ac-btn" style={{ justifySelf: 'start' }} onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar perfil'}</button>
      </div>
    </section>
  )
}
