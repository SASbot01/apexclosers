import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import FloatingHeader from '../../components/FloatingHeader'
import { getUserId } from '../../lib/config'
import {
  getProfile, getProfileById, updateProfile, uploadPhoto, searchProfiles, getCV, fileToDataUrl,
  listFriends, invite, respondInvite, removeFriend, listGroups, createGroup, deleteGroup, groupAdd, groupRemove,
} from '../../lib/profileApi'
import { openCV } from './cv'

const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const intf = (v) => new Intl.NumberFormat('es-ES').format(Math.round(v || 0))
const pct = (v) => v == null ? '—' : `${Math.round(v * 100)}%`
const fmtVal = (m) => m.fmt === 'money' ? money(m.value) : m.fmt === 'pct' ? pct(m.value) : intf(m.value)
const initials = (name) => (name || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()

export default function Profile() {
  const { userId: routeUserId } = useParams()
  const navigate = useNavigate()
  const targetId = routeUserId || getUserId()
  const isOwn = targetId === getUserId()

  const [data, setData] = useState(null)     // { profile, metrics, isOwner, friendship }
  const [state, setState] = useState('loading')
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState('amigos')

  const load = useCallback(() => {
    setState('loading')
    const p = isOwn ? getProfile() : getProfileById(targetId)
    p.then(d => { setData(d); setState('live') }).catch(() => setState('error'))
  }, [isOwn, targetId])
  useEffect(load, [load])

  if (state === 'loading') return <><FloatingHeader title="Perfil" eyebrow="PERFIL" /><section className="apex-section"><div className="apex-card" style={{ padding: 28, textAlign: 'center', color: 'var(--apex-plat-low)' }}>Cargando…</div></section></>
  if (state === 'error' || !data) return <><FloatingHeader title="Perfil" eyebrow="PERFIL" /><section className="apex-section"><div className="apex-card" style={{ padding: 28, color: 'var(--apex-plat-mid)' }}>No pude cargar el perfil (¿backend local arrancado?).</div></section></>

  const { profile, metrics } = data

  return (
    <>
      <FloatingHeader title="Perfil" eyebrow="PERFIL" actions={
        <div style={{ display: 'inline-flex', gap: 8 }}>
          {!isOwn && <button className="ac-btn" style={ghost} onClick={() => navigate('/perfil')}>← Mi perfil</button>}
          {isOwn && <button className="ac-btn" style={ghost} onClick={() => navigate('/ranking')}>Ranking</button>}
          <button className="ac-btn" style={ghost} onClick={async () => { const cv = await getCV(targetId).catch(() => null); if (cv) openCV(cv); else alert('No pude generar el CV.') }}>Currículum</button>
          {isOwn && !editing && <button className="ac-btn" onClick={() => setEditing(true)}>Editar perfil</button>}
        </div>
      } />

      {editing && isOwn ? (
        <EditProfile profile={profile} onDone={() => { setEditing(false); load() }} />
      ) : (
        <>
          <ProfileHeader profile={profile} />

          {isOwn && (!profile.nickname || !profile.bio || !profile.photo_url) && (
            <section className="apex-section">
              <div className="apex-card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderColor: 'color-mix(in srgb, #8AC8E0 40%, var(--apex-border))' }}>
                <span style={{ fontSize: 13, color: 'var(--apex-plat-mid)' }}>
                  Completa tu perfil: {[!profile.photo_url && 'foto', !profile.nickname && 'nickname', !profile.bio && 'descripción'].filter(Boolean).join(' · ')} y añade tus enlaces.
                </span>
                <button className="ac-btn" onClick={() => setEditing(true)}>Completar perfil</button>
              </div>
            </section>
          )}

          {isOwn && (
            <>
              <section className="apex-section">
                <div className="seg" style={{ width: 'fit-content' }}>
                  {[['amigos', 'Amigos e invitar'], ['grupos', 'Grupos']].map(([k, l]) => (
                    <button key={k} className="seg-btn" data-active={tab === k || undefined} onClick={() => setTab(k)}>{l}</button>
                  ))}
                </div>
              </section>
              {tab === 'amigos' && <FriendsPanel onOpen={(id) => navigate(`/perfil/${id}`)} />}
              {tab === 'grupos' && <GroupsPanel />}
            </>
          )}

          {/* Métricas SIEMPRE abajo del todo del perfil. */}
          <MetricsSection metrics={metrics} isOwn={isOwn} onManage={() => navigate('/ajustes')} onEvolucion={() => navigate('/finanzas')} />
        </>
      )}
      <style>{PF_CSS}</style>
    </>
  )
}

const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }

function ProfileHeader({ profile }) {
  return (
    <section className="apex-section">
      <div className="apex-card pf-head">
        <div className="pf-avatar">{profile.photo_url ? <img src={profile.photo_url} alt="" /> : <span>{initials(profile.display_name || profile.nickname)}</span>}</div>
        <div className="pf-id">
          <h2 className="pf-name">{profile.display_name || profile.nickname || 'Sin nombre'}</h2>
          {profile.nickname && <span className="pf-nick">@{profile.nickname}</span>}
          {profile.headline && <div className="pf-headline">{profile.headline}</div>}
          {profile.location && <div className="pf-loc">{profile.location}</div>}
          {profile.bio && <p className="pf-bio">{profile.bio}</p>}
          {(profile.links || []).length > 0 && (
            <div className="pf-links">
              {profile.links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noreferrer" className="pf-link">{l.label || l.url}</a>)}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// Sección de métricas, abajo del todo del perfil. El dueño las ve TODAS (con su
// etiqueta pública/privada); un visitante (amigo/grupo/invitado) ve solo las
// públicas. Quién es público/privado se gestiona en Ajustes.
function MetricsSection({ metrics, isOwn, onManage, onEvolucion }) {
  const items = (metrics || []).filter(m => m.value != null)
  return (
    <section className="apex-section">
      <div className="home-head" style={{ alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontWeight: 400 }}>Métricas</h3>
        {isOwn && (
          <span style={{ display: 'inline-flex', gap: 14 }}>
            <button className="crm-link" onClick={onEvolucion}>Evolución →</button>
            <button className="crm-link" onClick={onManage}>Gestionar pública/privada →</button>
          </span>
        )}
      </div>
      <p className="set-note" style={{ margin: '0 0 6px' }}>
        {isOwn
          ? 'Las ves todas. Las marcadas como Pública las pueden ver tus amigos, grupos y la gente que invites; las Privadas, no.'
          : 'Métricas públicas de este perfil.'}
      </p>
      {items.length === 0
        ? <div className="apex-card" style={{ padding: 18, color: 'var(--apex-plat-low)' }}>{isOwn ? 'Aún no tienes métricas. Cierra y verifica ventas para que aparezcan.' : 'Este perfil no tiene métricas públicas.'}</div>
        : (
          <div className="pf-metrics">
            {items.map(m => (
              <div className="apex-card pf-metric" key={m.key} data-public={m.public || undefined}>
                <span className="pf-metric-v">{fmtVal(m)}</span>
                <span className="pf-metric-l">{m.label}</span>
                {isOwn && <span className="pf-metric-vis" data-on={m.public || undefined}>{m.public ? 'Pública' : 'Privada'}</span>}
              </div>
            ))}
          </div>
        )}
    </section>
  )
}

function EditProfile({ profile, onDone }) {
  const [form, setForm] = useState({
    display_name: profile.display_name || '', nickname: profile.nickname || '', headline: profile.headline || '',
    bio: profile.bio || '', location: profile.location || '', links: profile.links?.length ? profile.links : [{ label: '', url: '' }],
  })
  const [photo, setPhoto] = useState(profile.photo_url)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const fileRef = useRef(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setLink = (i, k, v) => setForm(f => ({ ...f, links: f.links.map((l, j) => j === i ? { ...l, [k]: v } : l) }))

  const onPhoto = async (file) => {
    if (!file) return
    try { const url = await uploadPhoto(await fileToDataUrl(file), file.name); setPhoto(url.photo_url) }
    catch { setErr('No pude subir la foto.') }
  }
  const save = async () => {
    setSaving(true); setErr(null)
    try {
      const links = form.links.filter(l => l.url.trim())
      await updateProfile({ ...form, links })
      onDone()
    } catch (e) { setErr(e.message === 'nickname_taken' ? 'Ese nickname ya está cogido.' : 'No pude guardar.'); setSaving(false) }
  }

  return (
    <section className="apex-section">
      <div className="apex-card" style={{ padding: 24, display: 'grid', gap: 14, maxWidth: 640 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div className="pf-avatar">{photo ? <img src={photo} alt="" /> : <span>{initials(form.display_name || form.nickname)}</span>}</div>
          <div>
            <button className="ac-btn" style={ghost} onClick={() => fileRef.current?.click()}>Cambiar foto</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { onPhoto(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        </div>
        <Field label="Nombre"><input className="ac-input" value={form.display_name} onChange={e => set('display_name', e.target.value)} /></Field>
        <Field label="Nickname (te buscan por aquí)"><input className="ac-input" value={form.nickname} onChange={e => set('nickname', e.target.value)} placeholder="ej. alejandro_closer" /></Field>
        <Field label="Titular"><input className="ac-input" value={form.headline} onChange={e => set('headline', e.target.value)} placeholder="Closer high-ticket · 7 años cerrando" /></Field>
        <Field label="Ubicación"><input className="ac-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Madrid, España" /></Field>
        <Field label="Descripción"><textarea className="ac-input" rows={4} value={form.bio} onChange={e => set('bio', e.target.value)} placeholder="Quién eres, qué cierras, tu enfoque…" /></Field>
        <div>
          <label className="sc-lbl">Links</label>
          {form.links.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, marginBottom: 8 }}>
              <input className="ac-input" placeholder="Etiqueta" value={l.label} onChange={e => setLink(i, 'label', e.target.value)} />
              <input className="ac-input" placeholder="https://…" value={l.url} onChange={e => setLink(i, 'url', e.target.value)} />
              <button className="sales-mini sales-mini--del" onClick={() => setForm(f => ({ ...f, links: f.links.filter((_, j) => j !== i) }))}>✕</button>
            </div>
          ))}
          <button className="ac-btn" style={ghost} onClick={() => setForm(f => ({ ...f, links: [...f.links, { label: '', url: '' }] }))}>+ Añadir link</button>
        </div>
        {err && <div className="cal2-err" style={{ marginTop: 0 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ac-btn" style={ghost} onClick={onDone} disabled={saving}>Cancelar</button>
          <button className="ac-btn" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
      <style>{PF_CSS}</style>
    </section>
  )
}
const Field = ({ label, children }) => <div><label className="sc-lbl">{label}</label>{children}</div>

function FriendsPanel({ onOpen }) {
  const [d, setD] = useState({ friends: [], incoming: [], outgoing: [] })
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [msg, setMsg] = useState(null)
  const load = () => listFriends().then(setD).catch(() => {})
  useEffect(() => { load() }, [])

  const doSearch = async () => { if (!q.trim()) return setResults([]); setResults(await searchProfiles(q).catch(() => [])) }
  const doInvite = async (nickOrEmail) => {
    setMsg(null)
    try {
      const isEmail = nickOrEmail.includes('@')
      const r = await invite(isEmail ? { email: nickOrEmail } : { nick: nickOrEmail })
      setMsg(r.already ? `Ya existe (${r.already}).` : 'Invitación enviada.'); load()
    } catch (e) { setMsg(e.message === 'user_not_found' ? 'No encontré a nadie con ese nick/email.' : 'No pude invitar.') }
  }

  return (
    <>
      <section className="apex-section">
        <div className="apex-card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 4px', fontWeight: 400 }}>Buscar perfiles e invitar</h3>
          <p className="set-note" style={{ margin: '0 0 12px' }}>Encuentra a otros closers por su nickname (o invita por email) y conéctate para ver sus métricas públicas.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="ac-input" style={{ maxWidth: 280 }} placeholder="Buscar por nickname o email…" value={q}
              onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} />
            <button className="ac-btn" style={ghost} onClick={doSearch}>Buscar</button>
            {q.includes('@') && <button className="ac-btn" onClick={() => doInvite(q)}>Invitar a {q}</button>}
          </div>
          {msg && <p className="set-note" style={{ marginTop: 10 }}>{msg}</p>}
          {results.length > 0 && (
            <div className="pf-friend-list" style={{ marginTop: 12 }}>
              {results.map(r => (
                <div className="pf-friend" key={r.user_id}>
                  <FriendAvatar p={r} />
                  <div className="pf-friend-id"><span className="pf-friend-name" onClick={() => onOpen(r.user_id)}>{r.display_name}</span>{r.nickname && <span className="pf-friend-nick">@{r.nickname}</span>}</div>
                  <button className="sales-mini sales-mini--go" onClick={() => doInvite(r.nickname || r.user_id)}>Invitar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {d.incoming.length > 0 && (
        <section className="apex-section"><div className="apex-card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontWeight: 400 }}>Solicitudes recibidas</h3>
          <div className="pf-friend-list">
            {d.incoming.map(f => (
              <div className="pf-friend" key={f.requestId}>
                <FriendAvatar p={f} />
                <div className="pf-friend-id"><span className="pf-friend-name" onClick={() => onOpen(f.user_id)}>{f.display_name}</span>{f.nickname && <span className="pf-friend-nick">@{f.nickname}</span>}</div>
                <button className="sales-mini sales-mini--go" onClick={() => respondInvite(f.requestId, true).then(load)}>Aceptar</button>
                <button className="sales-mini" onClick={() => respondInvite(f.requestId, false).then(load)}>Rechazar</button>
              </div>
            ))}
          </div>
        </div></section>
      )}

      <section className="apex-section"><div className="apex-card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontWeight: 400 }}>Amigos · {d.friends.length}</h3>
        {d.friends.length === 0 && d.outgoing.length === 0 && <p className="ac-empty" style={{ padding: 0 }}>Aún no tienes amigos. Búscalos por su nickname e invítalos.</p>}
        <div className="pf-friend-list">
          {d.friends.map(f => (
            <div className="pf-friend" key={f.user_id}>
              <FriendAvatar p={f} />
              <div className="pf-friend-id"><span className="pf-friend-name" onClick={() => onOpen(f.user_id)}>{f.display_name}</span>{f.nickname && <span className="pf-friend-nick">@{f.nickname}</span>}</div>
              <button className="sales-mini" onClick={() => onOpen(f.user_id)}>Ver perfil</button>
              <button className="sales-mini sales-mini--del" onClick={() => removeFriend(f.user_id).then(load)}>✕</button>
            </div>
          ))}
          {d.outgoing.map(f => (
            <div className="pf-friend" key={f.requestId} style={{ opacity: 0.6 }}>
              <FriendAvatar p={f} />
              <div className="pf-friend-id"><span className="pf-friend-name">{f.display_name}</span>{f.nickname && <span className="pf-friend-nick">@{f.nickname}</span>}</div>
              <span className="sales-badge" style={{ '--c': '#F2A765' }}>Pendiente</span>
            </div>
          ))}
        </div>
      </div></section>
      <style>{PF_CSS}</style>
    </>
  )
}

function GroupsPanel() {
  const [groups, setGroups] = useState([])
  const [friends, setFriends] = useState([])
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🔥')
  const load = () => { listGroups().then(setGroups).catch(() => {}); listFriends().then(d => setFriends(d.friends)).catch(() => {}) }
  useEffect(() => { load() }, [])

  const add = async () => { if (!name.trim()) return; await createGroup(name, emoji).catch(() => {}); setName(''); load() }

  return (
    <section className="apex-section">
      <div className="apex-card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontWeight: 400 }}>Crear grupo de amigos</h3>
        <p className="set-note" style={{ margin: '0 0 12px' }}>Grupos tipo club para compartir tus highlights y métricas con quien tú elijas.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="ac-input" style={{ width: 60, textAlign: 'center' }} value={emoji} onChange={e => setEmoji(e.target.value.slice(0, 2))} />
          <input className="ac-input" style={{ maxWidth: 280 }} placeholder="Nombre del grupo (ej. Closers Élite)" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <button className="ac-btn" onClick={add}>Crear grupo</button>
        </div>
      </div>

      {groups.length === 0 && <div className="apex-card" style={{ padding: 18, color: 'var(--apex-plat-low)' }}>Sin grupos todavía.</div>}
      {groups.map(g => (
        <div className="apex-card" key={g.id} style={{ padding: 20, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontWeight: 400 }}>{g.emoji} {g.name} <span style={{ color: 'var(--apex-plat-low)', fontSize: 12 }}>· {g.members.length}</span></h3>
            <button className="sales-mini sales-mini--del" onClick={() => deleteGroup(g.id).then(load)}>Eliminar grupo</button>
          </div>
          <div className="pf-friend-list">
            {g.members.map(m => (
              <div className="pf-friend" key={m.user_id}>
                <FriendAvatar p={m} />
                <div className="pf-friend-id"><span className="pf-friend-name">{m.display_name}</span>{m.nickname && <span className="pf-friend-nick">@{m.nickname}</span>}</div>
                <button className="sales-mini sales-mini--del" onClick={() => groupRemove(g.id, m.user_id).then(load)}>✕</button>
              </div>
            ))}
            {g.members.length === 0 && <p className="ac-empty" style={{ padding: 0 }}>Grupo vacío. Añade amigos abajo.</p>}
          </div>
          {friends.filter(f => !g.members.some(m => m.user_id === f.user_id)).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <label className="sc-lbl">Añadir amigo al grupo</label>
              <select className="ac-input" style={{ maxWidth: 280 }} value="" onChange={e => e.target.value && groupAdd(g.id, e.target.value).then(load)}>
                <option value="">— elige —</option>
                {friends.filter(f => !g.members.some(m => m.user_id === f.user_id)).map(f => <option key={f.user_id} value={f.user_id}>{f.display_name}{f.nickname ? ` (@${f.nickname})` : ''}</option>)}
              </select>
            </div>
          )}
        </div>
      ))}
      <style>{PF_CSS}</style>
    </section>
  )
}

const FriendAvatar = ({ p }) => <div className="pf-friend-av">{p.photo_url ? <img src={p.photo_url} alt="" /> : <span>{initials(p.display_name || p.nickname)}</span>}</div>

const PF_CSS = `
.pf-head { padding: 24px; display: flex; gap: 20px; align-items: flex-start; }
.pf-avatar { width: 88px; height: 88px; flex: 0 0 88px; border-radius: 50%; overflow: hidden; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); display: inline-flex; align-items: center; justify-content: center; color: var(--apex-plat-mid); font-size: 28px; }
.pf-avatar img { width: 100%; height: 100%; object-fit: cover; }
.pf-id { min-width: 0; }
.pf-name { margin: 0; font-weight: 400; font-size: 22px; color: var(--apex-plat-hi); }
.pf-nick { font-size: 13px; color: var(--apex-plat-low); }
.pf-headline { font-size: 14px; color: var(--apex-plat-mid); margin-top: 6px; }
.pf-loc { font-size: 12px; color: var(--apex-plat-low); margin-top: 2px; }
.pf-bio { font-size: 13.5px; color: var(--apex-plat-mid); line-height: 1.55; margin: 10px 0 0; max-width: 60ch; }
.pf-links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.pf-link { font-size: 12px; color: var(--apex-plat-hi); border: 1px solid var(--apex-border); padding: 4px 10px; text-decoration: none; }
.pf-link:hover { border-color: var(--apex-plat-mid); }
.pf-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.pf-metric { padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.pf-metric[data-public] { border-color: color-mix(in srgb, #6FCF9C 40%, var(--apex-border)); }
.pf-metric-v { font-size: 22px; color: var(--apex-plat-hi); }
.pf-metric-l { font-size: 11.5px; color: var(--apex-plat-low); text-transform: uppercase; letter-spacing: 0.06em; }
.pf-metric-vis { margin-top: 6px; align-self: flex-start; font-size: 10px; padding: 2px 7px; border: 1px solid var(--apex-border); color: var(--apex-plat-low); border-radius: 2px; }
.pf-metric-vis[data-on] { color: #6FCF9C; border-color: color-mix(in srgb, #6FCF9C 45%, transparent); }
.pf-friend-list { display: flex; flex-direction: column; gap: 8px; }
.pf-friend { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--apex-border); background: var(--apex-card-bg, rgba(255,255,255,0.02)); }
.pf-friend-av { width: 36px; height: 36px; flex: 0 0 36px; border-radius: 50%; overflow: hidden; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); display: inline-flex; align-items: center; justify-content: center; color: var(--apex-plat-mid); font-size: 13px; }
.pf-friend-av img { width: 100%; height: 100%; object-fit: cover; }
.pf-friend-id { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pf-friend-name { font-size: 13px; color: var(--apex-plat-hi); cursor: pointer; }
.pf-friend-name:hover { text-decoration: underline; }
.pf-friend-nick { font-size: 11px; color: var(--apex-plat-low); }
`
