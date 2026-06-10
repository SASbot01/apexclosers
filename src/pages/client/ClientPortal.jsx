import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import {
  getProfile, updateProfile, uploadPhoto, fileToDataUrl, searchProfiles,
  listTeams, createTeam, deleteTeam, teamAdd, teamRemove,
} from '../../lib/profileApi'
import { signOut } from '../../lib/auth'
import { getUserId } from '../../lib/config'

/*
 * Portal del CLIENTE (empresa). Su perfil = la empresa (descripción/redes/web).
 * Monta su EQUIPO e INVITA a closers: la invitación le llega al closer como
 * notificación + recuadro en su perfil, y la acepta o rechaza (como un amigo).
 * Sin tablón de ofertas — se mantiene simple.
 */
const initials = (n) => (n || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)

export default function ClientPortal() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('equipo')
  const loadProfile = () => getProfile().then(d => setProfile(d.profile)).catch(() => setProfile({}))
  useEffect(() => { loadProfile() }, [])

  if (!profile) return <><FloatingHeader title="Empresa" eyebrow="CLIENTE" /><section className="apex-section"><div className="apex-card" style={{ padding: 24, color: 'var(--apex-plat-low)' }}>Cargando…</div></section></>

  return (
    <>
      <FloatingHeader title={profile.display_name || 'Tu empresa'} eyebrow="CUENTA DE CLIENTE" actions={
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <button className="ac-btn" style={ghost} onClick={() => navigate('/ranking')}>Buscar closers</button>
          <button className="ac-btn" style={ghost} onClick={signOut}>Salir</button>
        </div>
      } />

      <section className="apex-section">
        <div className="seg" style={{ width: 'fit-content' }}>
          {[['equipo', 'Mi equipo'], ['empresa', 'Perfil de empresa']].map(([k, l]) => (
            <button key={k} className="seg-btn" data-active={tab === k || undefined} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </section>

      {tab === 'equipo' && <ClientTeams onOpenMember={(id) => navigate(`/perfil/${id}?client=${getUserId()}`)} />}
      {tab === 'empresa' && <CompanyProfile profile={profile} onSaved={loadProfile} />}
    </>
  )
}

function ClientTeams({ onOpenMember }) {
  const [teams, setTeams] = useState([])
  const [name, setName] = useState(''); const [emoji, setEmoji] = useState('🎯')
  const [q, setQ] = useState(''); const [results, setResults] = useState([])
  const [target, setTarget] = useState(null)   // equipo al que se invita
  const load = () => listTeams().then(setTeams).catch(() => setTeams([]))
  useEffect(() => { load() }, [])

  // Buscador de closers (en vivo) para invitar.
  useEffect(() => {
    const t = q.trim(); if (t.length < 2) { setResults([]); return }
    const id = setTimeout(() => searchProfiles(t).then(setResults).catch(() => setResults([])), 220)
    return () => clearTimeout(id)
  }, [q])

  const add = async () => { if (!name.trim()) return; await createTeam(name.trim(), emoji, getUserId()).catch(() => {}); setName(''); load() }
  const invite = async (closerId) => { if (!target) return; await teamAdd(target, closerId).catch(() => {}); setQ(''); setResults([]); load() }

  return (
    <section className="apex-section">
      <div className="apex-card" style={{ padding: 20, marginBottom: 12 }}>
        <h3 style={{ margin: '0 0 4px', fontWeight: 400 }}>Crear equipo</h3>
        <p className="set-note" style={{ margin: '0 0 12px' }}>Monta un equipo y <b>invita closers</b>. Les llega la invitación a su perfil y la aceptan o rechazan. Solo verás las métricas de los que acepten.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="ac-input" style={{ width: 60, textAlign: 'center' }} value={emoji} onChange={e => setEmoji(e.target.value.slice(0, 2))} />
          <input className="ac-input" style={{ maxWidth: 260 }} placeholder="Nombre del equipo" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <button className="ac-btn" onClick={add}>Crear equipo</button>
        </div>
      </div>

      {teams.length === 0 && <div className="apex-card" style={{ padding: 18, color: 'var(--apex-plat-low)' }}>Aún no tienes equipos. Crea uno arriba.</div>}
      {teams.map(t => (
        <div className="apex-card" key={t.id} style={{ padding: 20, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontWeight: 400 }}><span style={{ marginRight: 8 }}>{t.emoji}</span>{t.name} <span style={{ color: 'var(--apex-plat-low)', fontSize: 12 }}>· {t.members.filter(m => m.status === 'accepted').length} closers</span></h3>
            <div style={{ display: 'inline-flex', gap: 6 }}>
              <button className="sales-mini sales-mini--go" onClick={() => setTarget(target === t.id ? null : t.id)}>{target === t.id ? 'Cerrar' : '+ Invitar closer'}</button>
              <button className="sales-mini sales-mini--del" onClick={() => deleteTeam(t.id).then(load)}>Eliminar</button>
            </div>
          </div>

          {target === t.id && (
            <div style={{ marginTop: 12 }}>
              <input className="ac-input" style={{ maxWidth: 280 }} placeholder="Buscar closer por nombre o nickname…" value={q} onChange={e => setQ(e.target.value)} />
              <div className="pf-friend-list" style={{ marginTop: 8 }}>
                {results.map(r => (
                  <div className="pf-friend" key={r.user_id}>
                    <span style={avatar}>{r.photo_url ? <img src={r.photo_url} alt="" style={avImg} /> : initials(r.display_name)}</span>
                    <div className="pf-friend-id"><span className="pf-friend-name">{r.display_name}</span>{r.nickname && <span className="pf-friend-nick">@{r.nickname}</span>}</div>
                    {t.members.some(m => m.user_id === r.user_id)
                      ? <span className="sales-mini" style={{ opacity: 0.7 }}>{t.members.find(m => m.user_id === r.user_id)?.status === 'pending' ? 'Invitado' : 'En el equipo'}</span>
                      : <button className="sales-mini sales-mini--go" onClick={() => invite(r.user_id)}>Invitar</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pf-friend-list" style={{ marginTop: 12 }}>
            {t.members.map(m => (
              <div className="pf-friend" key={m.user_id}>
                <span style={avatar}>{m.photo_url ? <img src={m.photo_url} alt="" style={avImg} /> : initials(m.display_name)}</span>
                <div className="pf-friend-id" style={{ cursor: 'pointer' }} onClick={() => onOpenMember(m.user_id)}>
                  <span className="pf-friend-name">{m.display_name}</span>
                  <span className="pf-friend-nick">{m.status === 'pending' ? 'Invitación pendiente' : `${money(m.stats?.revenue)} · ${m.stats?.deals || 0} cierres`}</span>
                </div>
                <button className="sales-mini sales-mini--del" onClick={() => teamRemove(t.id, m.user_id).then(load)}>✕</button>
              </div>
            ))}
            {t.members.length === 0 && <p className="ac-empty" style={{ padding: 0 }}>Equipo vacío. Pulsa “+ Invitar closer”.</p>}
          </div>
        </div>
      ))}
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
  const save = async () => { setSaving(true); await updateProfile({ ...form, links: form.links.filter(l => l.url) }).catch(() => {}); setSaving(false); onSaved() }

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
            <input className="ac-input" style={{ flex: '0 0 130px' }} placeholder="Etiqueta" value={l.label} onChange={e => setLink(i, 'label', e.target.value)} />
            <input className="ac-input" style={{ flex: 1 }} placeholder="https://…" value={l.url} onChange={e => setLink(i, 'url', e.target.value)} />
          </div>
        ))}
        <button className="ac-btn" style={{ ...ghost, justifySelf: 'start' }} onClick={addLink}>+ Añadir link</button>
        <button className="ac-btn" style={{ justifySelf: 'start' }} onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar perfil'}</button>
      </div>
    </section>
  )
}

const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }
const avatar = { width: 38, height: 38, flex: '0 0 38px', borderRadius: '50%', overflow: 'hidden', background: 'var(--apex-trigger-bg)', border: '1px solid var(--apex-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--apex-plat-hi)' }
const avImg = { width: '100%', height: '100%', objectFit: 'cover' }
