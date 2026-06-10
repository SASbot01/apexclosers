import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Trophy, ShieldCheck, Flame, Phone, ArrowLeft } from 'lucide-react'
import FloatingHeader from '../../components/FloatingHeader'
import ProgressRing from '../../components/ProgressRing'
import AnimatedValue from '../../components/AnimatedValue'
import StatusBadge from '../../components/StatusBadge'
import { fmtDateTime } from '../../lib/format'
import { getUserId } from '../../lib/config'
import { getRanking } from '../../lib/workflowApi'
import { CLIENTS, clientName } from '../../data/mock/clients'
import { listClients, createClient, deleteClient } from '../../lib/clientsApi'
import {
  getProfile, getProfileById, updateProfile, uploadPhoto, searchProfiles, getCV, fileToDataUrl, setProfileStatus,
  listFriends, invite, respondInvite, removeFriend, listGroups, createGroup, deleteGroup, groupAdd, groupRemove,
  listTeams, createTeam, deleteTeam, teamAdd, teamRemove,
  teamInvites, teamRespond, myTeams,
} from '../../lib/profileApi'
import AvailabilityDot, { STATUS_NEXT } from '../../components/AvailabilityDot'
import TeamChat from '../../components/TeamChat'
import { useCurrentUser } from '../../lib/auth'
import { openCV } from './cv'

const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const intf = (v) => new Intl.NumberFormat('es-ES').format(Math.round(v || 0))
const pct = (v) => v == null ? '—' : `${Math.round(v * 100)}%`
const fmtVal = (m) => m.fmt === 'money' ? money(m.value) : m.fmt === 'pct' ? pct(m.value) : intf(m.value)

// Etiqueta de tipo de cuenta junto al nombre: Closer (verde) o Empresa.
function RoleChip({ type }) {
  if (!type) return null
  const client = type === 'client'
  return <span style={{ fontSize: 9.5, padding: '1px 7px', borderRadius: 999, marginLeft: 6, border: '1px solid var(--apex-border)', color: client ? 'var(--apex-accent, var(--apex-plat-mid))' : 'var(--apex-plat-low)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{client ? 'Empresa' : 'Closer'}</span>
}
const initials = (name) => (name || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()

export default function Profile() {
  const { userId: routeUserId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const scopedClient = searchParams.get('client') || null   // perfil filtrado a un cliente (vía equipo)
  const targetId = routeUserId || getUserId()
  const isOwn = targetId === getUserId() && !scopedClient
  const me = useCurrentUser() || {}

  const [data, setData] = useState(null)     // { profile, metrics, isOwner, friendship }
  const [state, setState] = useState('loading')
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState(searchParams.get('tab') || 'amigos')

  const [rank, setRank] = useState(null)
  const [clients, setClients] = useState([])   // clientes reales del dueño del perfil (para "Cerrando para")
  const reloadClients = useCallback(() => { listClients(targetId).then(setClients).catch(() => setClients([])) }, [targetId])
  useEffect(() => { reloadClients() }, [reloadClients])

  const load = useCallback(() => {
    setState('loading')
    const p = (routeUserId && routeUserId !== getUserId()) ? getProfileById(targetId, scopedClient) : getProfile(scopedClient)
    p.then(d => { setData(d); setState('live') }).catch(() => setState('error'))
  }, [routeUserId, targetId, scopedClient])
  useEffect(load, [load])

  useEffect(() => {
    if (scopedClient) { setRank(null); return }   // en vista filtrada no mostramos ranking global
    getRanking('global')
      .then(d => setRank((d.ranking || []).find(r => r.user_id === targetId) || (isOwn ? d.me : null) || null))
      .catch(() => setRank(null))
  }, [targetId, isOwn, scopedClient])

  if (state === 'loading') return <><FloatingHeader title="Perfil" eyebrow="PERFIL" /><section className="apex-section"><div className="apex-card" style={{ padding: 28, textAlign: 'center', color: 'var(--apex-plat-low)' }}>Cargando…</div></section></>
  if (state === 'error' || !data) return <><FloatingHeader title="Perfil" eyebrow="PERFIL" /><section className="apex-section"><div className="apex-card" style={{ padding: 28, color: 'var(--apex-plat-mid)' }}>No pude cargar el perfil (¿backend local arrancado?).</div></section></>

  const { profile, metrics } = data

  return (
    <>
      <FloatingHeader title="Perfil" eyebrow={scopedClient ? 'PERFIL · CLIENTE' : 'PERFIL'} actions={
        <div style={{ display: 'inline-flex', gap: 8 }}>
          {scopedClient
            ? <button className="ac-btn" style={ghost} onClick={() => navigate(-1)}>← Volver al equipo</button>
            : <>
                {!isOwn && <button className="ac-btn" style={ghost} onClick={() => navigate('/perfil')}>← Volver</button>}
                {!isOwn && me.account_type === 'client' && <InviteToTeam targetId={targetId} />}
                {isOwn && <button className="ac-btn" style={ghost} onClick={() => navigate('/ranking')}>Ranking</button>}
                <button className="ac-btn" style={ghost} onClick={() => navigate(`/cv/${targetId}`)}>Currículum</button>
                {isOwn && !editing && <button className="ac-btn" onClick={() => setEditing(true)}>Editar perfil</button>}
              </>}
        </div>
      } />

      {editing && isOwn ? (
        <EditProfile profile={profile} onDone={() => { setEditing(false); load() }} />
      ) : (
        <>
          {scopedClient && (
            <section className="apex-section">
              <div className="apex-card pf-scope">
                <span className="pf-scope-dot" />
                <span className="pf-scope-txt">Acceso vía equipo · viendo <b>solo los datos de {clientName(scopedClient)}</b></span>
                <button className="pf-scope-go" onClick={() => navigate(-1)}><ArrowLeft size={13} strokeWidth={2} /> Volver</button>
              </div>
            </section>
          )}

          <ProfileHeader profile={profile} targetId={targetId} metrics={metrics} rank={rank} scopedClient={scopedClient} clients={clients} streak={data.streak} isOwn={isOwn} onRanking={() => navigate('/ranking')} />

          {/* Métricas — justo debajo del perfil, encima de amigos/grupos. */}
          <MetricsSection metrics={metrics} isOwn={isOwn} scopedClient={scopedClient} onManage={() => navigate('/ajustes')} onEvolucion={() => navigate('/finanzas')} />

          {scopedClient && data.activity && (
            <ScopedActivity activity={data.activity} clientId={scopedClient} onOpenCall={(id) => navigate(`/llamadas/${id}`)} />
          )}

          {isOwn && (!profile.nickname || !profile.bio || !profile.photo_url) && (
            <section className="apex-section">
              <div className="apex-card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderColor: 'color-mix(in srgb, var(--apex-accent, #8AC8E0) 40%, var(--apex-border))' }}>
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
                  {[['amigos', 'Amigos e invitar'], ['grupos', 'Grupos'], ['equipo', 'Equipo'], ['clientes', 'Clientes']].map(([k, l]) => (
                    <button key={k} className="seg-btn" data-active={tab === k || undefined} onClick={() => setTab(k)}>{l}</button>
                  ))}
                </div>
              </section>
              {tab === 'amigos' && <FriendsPanel onOpen={(id) => navigate(`/perfil/${id}`)} />}
              {tab === 'grupos' && <GroupsPanel />}
              {tab === 'equipo' && <TeamsPanel clients={clients} onOpenMember={(id, cl) => navigate(`/perfil/${id}?client=${cl}`)} />}
              {tab === 'clientes' && <ClientsManager clients={clients} onChange={reloadClients} />}
            </>
          )}
        </>
      )}
      <style>{PF_CSS}</style>
    </>
  )
}

const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }

function RankBanner({ rank, isOwn, onOpen }) {
  if (!rank) return null
  return (
    <section className="apex-section">
      <button type="button" className="apex-card pf-rank" onClick={onOpen}>
        <span className="pf-rank-pos"><Trophy size={16} strokeWidth={1.8} /> #{rank.rank}</span>
        <span className="pf-rank-txt">{isOwn ? 'Tu posición en el ranking global' : 'Posición en el ranking global'}</span>
        <span className="pf-rank-meta">{money(rank.revenue)} · {intf(rank.deals)} cierres</span>
        <span className="pf-rank-go">Ver ranking →</span>
      </button>
    </section>
  )
}

function ProfileHeader({ profile, targetId, metrics = [], rank, onRanking, scopedClient, clients = [], streak = false, isOwn = false }) {
  const [status, setStatus] = useState(profile.status || 'available')
  const cycleStatus = () => { const next = STATUS_NEXT[status] || 'available'; setStatus(next); setProfileStatus(next).catch(() => {}) }
  const rev = metrics.find(m => m.key === 'revenue' && m.value != null)
  const cash = metrics.find(m => m.key === 'cash_collected' && m.value != null)
  const calls = metrics.find(m => m.key === 'calls')?.value || 0
  // Datos REALES para nivel y medallas: revenue y cierres verificados (del
  // ranking, públicos), llamadas y racha (venta verificada en los últimos 30 días).
  const revenue = (rank?.revenue ?? rev?.value) || 0
  const deals = (rank?.deals ?? metrics.find(m => m.key === 'deals')?.value) || 0
  // Nivel por REVENUE verificado (logro real, no por posición en el ranking).
  const LEVELS = [
    { min: 100000, name: 'Leyenda' }, { min: 50000, name: 'Élite' },
    { min: 20000, name: 'Pro' }, { min: 5000, name: 'Retador' }, { min: 0, name: 'Closer' },
  ]
  const li = LEVELS.findIndex(l => revenue >= l.min)
  const levelName = LEVELS[li].name
  const nextLevel = li > 0 ? LEVELS[li - 1] : null
  const nextName = nextLevel?.name || null
  const levelPct = nextLevel ? Math.max(0.04, Math.min(0.99, (revenue - LEVELS[li].min) / (nextLevel.min - LEVELS[li].min))) : 1
  // Medallas: solo las que se ha ganado de verdad.
  const badges = [
    ...(deals > 0 ? [{ Icon: ShieldCheck, label: 'Closer verificado' }] : []),
    ...(rank && revenue > 0 && rank.rank <= 10 ? [{ Icon: Trophy, label: rank.rank <= 3 ? 'Top 3' : 'Top 10' }] : []),
    ...(calls >= 100 ? [{ Icon: Phone, label: '+100 llamadas' }] : []),
    ...(streak ? [{ Icon: Flame, label: 'En racha' }] : []),
  ]
  if (!badges.length) badges.push({ Icon: ShieldCheck, label: 'Nuevo closer' })
  return (
    <section className="apex-section">
      <div className="pf-top">
        <div className="pf-avatar-xl">{profile.photo_url ? <img src={profile.photo_url} alt="" /> : <span>{initials(profile.display_name || profile.nickname)}</span>}</div>

        <div className="apex-card pf-id-card">
          <div className="pf-id-grid">
            <div className="pf-col-main">
              <h2 className="pf-name">{profile.display_name || profile.nickname || 'Sin nombre'}</h2>
              {profile.nickname && <span className="pf-nick">@{profile.nickname}</span>}
              {!scopedClient && <div style={{ marginTop: 6 }}><AvailabilityDot status={status} onClick={isOwn ? cycleStatus : undefined} /></div>}
              {profile.headline && <div className="pf-headline">{profile.headline}</div>}
              {profile.location && <div className="pf-loc">{profile.location}</div>}
              {(clients.length > 0 || scopedClient) && (
                <div className="pf-clients">
                  <span className="pf-clients-lbl">Cerrando para</span>
                  <span className="pf-clients-list">{(scopedClient ? clients.filter(c => c.id === scopedClient) : clients).map(c => <span className="pf-client-chip" key={c.id} data-active={scopedClient === c.id || undefined}>{c.name}</span>)}</span>
                </div>
              )}
              {profile.bio && <p className="pf-bio">{profile.bio}</p>}
              <div className="pf-merits">
                {!scopedClient && (
                  <div className="pf-merit">
                    <span className="pf-side-lbl">Nivel · <b className="pf-merit-name">{levelName}</b></span>
                    <div className="pf-level-bar"><div className="pf-level-fill" style={{ width: `${Math.round(levelPct * 100)}%` }} /></div>
                    <span className="pf-side-hint">{nextName ? `Faltan ${money(nextLevel.min - revenue)} para ${nextName}` : 'Nivel máximo alcanzado'}</span>
                  </div>
                )}
                <div className="pf-badges-list">
                  {badges.map((b, i) => <span className="pf-badge" key={i}><b.Icon size={12} strokeWidth={1.8} /> {b.label}</span>)}
                </div>
              </div>
              {(profile.links || []).length > 0 && (
                <div className="pf-links">
                  {profile.links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noreferrer" className="pf-link">{l.label || l.url}</a>)}
                </div>
              )}
            </div>

            <div className="pf-col-side">
              {(rev || cash) && (
                <div className="pf-altar">
                  {cash && <div className="pf-altar-hero"><span className="pf-altar-v"><AnimatedValue value={cash.value * 0.15} fmt="money" /></span><span className="pf-altar-l">Tu comisión</span></div>}
                  {cash && <div className="pf-altar-line"><span className="pf-altar-v2"><AnimatedValue value={cash.value} fmt="money" /></span><span className="pf-altar-l">Cash collected</span></div>}
                  {rev && <div className="pf-altar-line"><span className="pf-altar-v2"><AnimatedValue value={rev.value} fmt="money" /></span><span className="pf-altar-l">Revenue</span></div>}
                </div>
              )}
              {rank && (
                <button type="button" className="pf-rankrow" onClick={onRanking}>
                  <span className="pf-rankrow-pos"><Trophy size={15} strokeWidth={1.8} /> #{rank.rank}</span>
                  <span className="pf-rankrow-lbl">Ranking global</span>
                  <span className="pf-rankrow-go">Ver →</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// Sección de métricas, abajo del todo del perfil. El dueño las ve TODAS (con su
// etiqueta pública/privada); un visitante (amigo/grupo/invitado) ve solo las
// públicas. Quién es público/privado se gestiona en Ajustes.
function MetricsSection({ metrics, isOwn, onManage, onEvolucion, scopedClient }) {
  // Revenue/Cash/Comisión van arriba (cabecera). Aquí: embudo en 2 filas.
  const byKey = Object.fromEntries((metrics || []).map(m => [m.key, m]))
  const v = (k) => byKey[k]?.value ?? 0
  const pub = (k) => !!byKey[k]?.public
  const ratio = (n, d) => (d ? n / d : 0)
  const calls = v('calls'), held = v('held'), offers = v('offers'), deals = v('deals'), deposits = v('deposits')
  const hasData = calls || held || offers || deals

  // Fila 1 — conteos del embudo.
  const counts = [
    { key: 'calls', label: 'Llamadas', value: calls, public: pub('calls') },
    { key: 'held', label: 'Realizadas', value: held, public: pub('held') },
    { key: 'offers', label: 'Ofertas', value: offers, public: pub('offers') },
    { key: 'deposits', label: 'Depósitos', value: deposits, public: pub('deposits') },
    { key: 'deals', label: 'Cierres', value: deals, public: pub('deals') },
  ]
  // Fila 2 — porcentajes (todos sobre Realizadas salvo el Show, que es sobre el total).
  const rates = [
    { key: 'show', label: '% Show', value: ratio(held, calls), public: pub('show_rate') },
    { key: 'offer', label: '% Oferta', value: ratio(offers, held), public: pub('offers') },
    { key: 'offerclose', label: '% Oferta/Cierre', value: ratio(deals, offers), public: true },
    { key: 'commitment', label: '% Commitment', value: ratio(deposits + deals, held), public: true },
    { key: 'close', label: '% Cierre', value: ratio(deals, held), public: pub('close_rate') },
  ]
  const Pill = ({ on }) => isOwn ? <span className="pf-metric-vis" data-on={on || undefined}>{on ? 'Pública' : 'Privada'}</span> : null

  return (
    <section className="apex-section">
      <div className="home-head" style={{ alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontWeight: 400 }}>Métricas{scopedClient ? <span style={{ color: 'var(--apex-accent, var(--apex-plat-mid))', fontSize: 13 }}> · {clientName(scopedClient)}</span> : ''}</h3>
        {isOwn && (
          <span style={{ display: 'inline-flex', gap: 14 }}>
            <button className="crm-link" onClick={onEvolucion}>Evolución →</button>
            <button className="crm-link" onClick={onManage}>Gestionar pública/privada →</button>
          </span>
        )}
      </div>
      <p className="set-note" style={{ margin: '0 0 6px' }}>
        {scopedClient
          ? `Embudo completo de este closer en ${clientName(scopedClient)}.`
          : isOwn
            ? 'Las ves todas. Las marcadas como Pública las pueden ver tus amigos, grupos y la gente que invites; las Privadas, no.'
            : 'Métricas públicas de este perfil.'}
      </p>
      {!hasData
        ? <div className="apex-card" style={{ padding: 18, color: 'var(--apex-plat-low)' }}>{isOwn ? 'Aún no tienes métricas. Cierra y verifica ventas para que aparezcan.' : 'Este perfil no tiene métricas públicas.'}</div>
        : (
          <div className="pf-metrics-rows">
            <div className="pf-metrics-row">
              {counts.map(m => (
                <div className="pf-metric" key={m.key} data-public={m.public || undefined}>
                  <span className="pf-metric-v"><AnimatedValue value={m.value} fmt="int" /></span>
                  <span className="pf-metric-l">{m.label}</span>
                  <Pill on={m.public} />
                </div>
              ))}
            </div>
            <div className="pf-metrics-row">
              {rates.map(m => (
                <div className="pf-metric pf-metric--ring" key={m.key} data-public={m.public || undefined}>
                  <ProgressRing value={m.value} size={94} stroke={8} card={false} />
                  <span className="pf-metric-l">{m.label}</span>
                  <Pill on={m.public} />
                </div>
              ))}
            </div>
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

export function FriendsPanel({ onOpen }) {
  const [d, setD] = useState({ friends: [], incoming: [], outgoing: [] })
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [msg, setMsg] = useState(null)
  const load = () => listFriends().then(setD).catch(() => {})
  useEffect(() => { load() }, [])

  // Búsqueda EN VIVO (typeahead): desde 2 caracteres, con debounce. Ya no hace
  // falta el nombre completo ni pulsar Enter — aparecen las coincidencias solas.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    const t = setTimeout(() => { searchProfiles(term).then(setResults).catch(() => setResults([])) }, 220)
    return () => clearTimeout(t)
  }, [q])
  const doSearch = async () => { if (!q.trim()) return setResults([]); setResults(await searchProfiles(q).catch(() => [])) }
  const doInvite = async (payload) => {
    setMsg(null)
    try {
      const r = await invite(payload)
      setMsg(r.already ? `Ya conectados (${r.already}).` : 'Invitación enviada.'); load(); doSearch()
    } catch (e) { setMsg(e.message === 'user_not_found' ? 'No encontré a ese usuario.' : 'No pude invitar.') }
  }

  return (
    <>
      <section className="apex-section">
        <div className="apex-card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 4px', fontWeight: 400 }}>Buscar perfiles e invitar</h3>
          <p className="set-note" style={{ margin: '0 0 12px' }}>Empieza a escribir un nombre o nickname y aparecen las coincidencias. También puedes invitar por email. Conéctate para ver sus métricas públicas.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="ac-input" style={{ maxWidth: 280 }} placeholder="Escribe un nombre o nickname…" value={q}
              onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} />
            <button className="ac-btn" style={ghost} onClick={doSearch}>Buscar</button>
            {q.includes('@') && <button className="ac-btn" onClick={() => doInvite({ email: q })}>Invitar a {q}</button>}
          </div>
          {msg && <p className="set-note" style={{ marginTop: 10 }}>{msg}</p>}
          {results.length > 0 && (
            <div className="pf-friend-list" style={{ marginTop: 12 }}>
              {results.map(r => (
                <div className="pf-friend" key={r.user_id}>
                  <FriendAvatar p={r} />
                  <div className="pf-friend-id"><span className="pf-friend-name" onClick={() => onOpen(r.user_id)}>{r.display_name}</span>{r.nickname && <span className="pf-friend-nick">@{r.nickname}</span>}<AvailabilityDot status={r.status} /><RoleChip type={r.account_type} /></div>
                  {r.relation === 'friends'
                    ? <span className="sales-mini" style={{ opacity: 0.7 }}>Amigo ✓</span>
                    : r.relation === 'pending_out'
                      ? <span className="sales-mini" style={{ opacity: 0.7 }}>Pendiente</span>
                      : r.relation === 'pending_in'
                        ? <span className="sales-mini" style={{ opacity: 0.7 }}>Te invitó →</span>
                        : <button className="sales-mini sales-mini--go" onClick={() => doInvite({ targetId: r.user_id })}>Invitar</button>}
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
                <div className="pf-friend-id"><span className="pf-friend-name" onClick={() => onOpen(f.user_id)}>{f.display_name}</span>{f.nickname && <span className="pf-friend-nick">@{f.nickname}</span>}<RoleChip type={f.account_type} /></div>
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
              <div className="pf-friend-id"><span className="pf-friend-name" onClick={() => onOpen(f.user_id)}>{f.display_name}</span>{f.nickname && <span className="pf-friend-nick">@{f.nickname}</span>}<RoleChip type={f.account_type} /></div>
              <button className="sales-mini" onClick={() => onOpen(f.user_id)}>Ver perfil</button>
              <button className="sales-mini sales-mini--del" onClick={() => removeFriend(f.user_id).then(load)}>✕</button>
            </div>
          ))}
          {d.outgoing.map(f => (
            <div className="pf-friend" key={f.requestId} style={{ opacity: 0.6 }}>
              <FriendAvatar p={f} />
              <div className="pf-friend-id"><span className="pf-friend-name">{f.display_name}</span>{f.nickname && <span className="pf-friend-nick">@{f.nickname}</span>}<RoleChip type={f.account_type} /></div>
              <span className="sales-badge" style={{ '--c': '#F2A765' }}>Pendiente</span>
            </div>
          ))}
        </div>
      </div></section>
      <style>{PF_CSS}</style>
    </>
  )
}

export function GroupsPanel() {
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
                <div className="pf-friend-id"><span className="pf-friend-name">{m.display_name}</span>{m.nickname && <span className="pf-friend-nick">@{m.nickname}</span>}<RoleChip type={m.account_type} /></div>
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

// Actividad del closer FILTRADA al cliente (vía equipo): sus llamadas (clicables
// → detalle) y sus ventas verificadas en esa cuenta. Solo aparece en modo scoped.
function ScopedActivity({ activity, clientId, onOpenCall }) {
  const calls = activity.calls || []
  const sales = activity.sales || []
  return (
    <section className="apex-section">
      <div className="pf-act-grid">
        <div className="apex-card pf-act">
          <div className="pf-act-head">
            <h3>Llamadas en {clientName(clientId)}</h3>
            <Link className="crm-link pf-act-all" to={`/llamadas?client=${clientId}`}>Ver todas →</Link>
          </div>
          {calls.length === 0 && <p className="ac-empty" style={{ padding: 0 }}>Sin llamadas registradas en esta cuenta.</p>}
          <div className="pf-act-list">
            {calls.map(c => (
              <button type="button" className="pf-act-row pf-act-call" key={c.id} onClick={() => onOpenCall(c.id)} title="Ver detalle de la llamada">
                <div className="pf-act-row-main">
                  <span className="pf-act-row-title">{c.title || 'Llamada sin título'}</span>
                  <span className="pf-act-row-meta">{fmtDateTime(c.started_at || c.scheduled_at)}{c.has_transcript ? ' · con transcripción' : ''}</span>
                </div>
                <StatusBadge call={c} />
              </button>
            ))}
          </div>
        </div>

        <div className="apex-card pf-act">
          <div className="pf-act-head">
            <h3>Ventas en {clientName(clientId)}</h3>
            <Link className="crm-link pf-act-all" to={`/clientes?client=${clientId}`}>Ver todas →</Link>
          </div>
          {sales.length === 0 && <p className="ac-empty" style={{ padding: 0 }}>Sin ventas verificadas en esta cuenta.</p>}
          <div className="pf-act-list">
            {sales.map(s => (
              <div className="pf-act-row" key={s.id}>
                <div className="pf-act-row-main">
                  <span className="pf-act-row-title">{s.product}</span>
                  <span className="pf-act-row-meta">{fmtDateTime(s.date)} · {s.payment_method} · {s.payment_type}</span>
                </div>
                <div className="pf-act-sale-amt">
                  <span className="pf-act-rev">{money(s.revenue)}</span>
                  {s.cash_collected !== s.revenue && <span className="pf-act-cash">cobrado {money(s.cash_collected)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{PF_CSS}</style>
    </section>
  )
}

// Equipos de cliente: cada equipo trabaja UNA cuenta; sus datos se ven filtrados a
// ese cliente (revenue/cierres/llamadas del equipo en esa cuenta + aporte de cada
// miembro). Crear equipo = nombre + emoji + cliente; luego se añaden closers amigos.
function ClientsManager({ clients = [], onChange }) {
  const [name, setName] = useState('')
  const [sector, setSector] = useState('')
  const add = async () => { if (!name.trim()) return; await createClient(name.trim(), sector.trim() || null).catch(() => {}); setName(''); setSector(''); onChange?.() }
  const remove = async (id) => { if (window.confirm('¿Quitar este cliente?')) { await deleteClient(id).catch(() => {}); onChange?.() } }
  return (
    <section className="apex-section">
      <div className="apex-card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 4px', fontWeight: 400 }}>Tus clientes</h3>
        <p className="set-note" style={{ margin: '0 0 12px' }}>Añade a mano las cuentas/clientes para los que cierras. Aparecen en tu perfil ("Cerrando para") y sirven para etiquetar ventas y montar equipos con métricas por cliente.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input className="ac-input" style={{ maxWidth: 240 }} placeholder="Nombre del cliente (ej. Enforma con Hugo)" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <input className="ac-input" style={{ maxWidth: 180 }} placeholder="Sector (opcional)" value={sector} onChange={e => setSector(e.target.value)} />
          <button className="ac-btn" onClick={add}>Añadir cliente</button>
        </div>
        {clients.length === 0
          ? <p className="ac-empty" style={{ padding: 0 }}>Aún no tienes clientes. Añade el primero arriba.</p>
          : <div className="pf-friend-list">
              {clients.map(c => (
                <div className="pf-friend" key={c.id}>
                  <FriendAvatar p={{ display_name: c.name }} />
                  <div className="pf-friend-id"><span className="pf-friend-name">{c.name}</span>{c.sector && <span className="pf-friend-nick">{c.sector}</span>}</div>
                  <button className="sales-mini sales-mini--del" onClick={() => remove(c.id)}>Quitar</button>
                </div>
              ))}
            </div>}
      </div>
    </section>
  )
}

// Botón para que una EMPRESA invite a este closer a uno de sus equipos (desde el
// perfil del closer). La invitación le llega al closer como notificación + recuadro.
function InviteToTeam({ targetId }) {
  const [teams, setTeams] = useState([])
  const [msg, setMsg] = useState(null)
  useEffect(() => { listTeams().then(setTeams).catch(() => {}) }, [])
  const invite = async (teamId) => { if (!teamId) return; await teamAdd(teamId, targetId).catch(() => {}); setMsg('Invitación enviada ✓') }
  if (msg) return <span className="ac-btn" style={{ ...ghost, cursor: 'default' }}>{msg}</span>
  if (!teams.length) return null
  return (
    <select className="ac-input" style={{ padding: '7px 10px', fontSize: 12.5, maxWidth: 200 }} defaultValue="" onChange={e => invite(e.target.value)}>
      <option value="">Invitar a un equipo…</option>
      {teams.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
    </select>
  )
}

function TeamsPanel({ onOpenMember, clients = [] }) {
  const [teams, setTeams] = useState([])
  const [friends, setFriends] = useState([])
  const [invites, setInvites] = useState([])   // invitaciones de equipo pendientes (closer)
  const [mine, setMine] = useState([])          // equipos donde estoy (closer)
  const [chatTeam, setChatTeam] = useState(null) // equipo cuyo chat está abierto
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎯')
  const [clientId, setClientId] = useState('')
  const cname = (id) => clients.find(c => c.id === id)?.name || clientName(id)
  const load = () => {
    listTeams().then(setTeams).catch(() => {}); listFriends().then(d => setFriends(d.friends)).catch(() => {})
    teamInvites().then(setInvites).catch(() => {}); myTeams().then(setMine).catch(() => {})
  }
  const respond = async (teamId, accept) => { await teamRespond(teamId, accept).catch(() => {}); load() }
  useEffect(() => { load() }, [])

  const add = async () => { if (!name.trim() || !clientId) return; await createTeam(name, emoji, clientId).catch(() => {}); setName(''); load() }
  const me = useCurrentUser() || {}
  const canCreate = me.account_type === 'client'   // solo las cuentas de cliente crean equipos

  return (
    <section className="apex-section">
      {invites.length > 0 && (
        <div className="apex-card" style={{ padding: 18, marginBottom: 16, borderColor: 'color-mix(in srgb, var(--apex-accent, #8AC8E0) 40%, var(--apex-border))' }}>
          <h3 style={{ margin: '0 0 10px', fontWeight: 400 }}>Invitaciones a equipo</h3>
          <div className="pf-friend-list">
            {invites.map(iv => (
              <div className="pf-friend" key={iv.teamId}>
                <FriendAvatar p={iv.company || { display_name: 'Empresa' }} />
                <div className="pf-friend-id"><span className="pf-friend-name">{iv.emoji} {iv.name}</span><span className="pf-friend-nick">{iv.company?.display_name || 'Una empresa'} te invita a su equipo</span></div>
                <button className="sales-mini sales-mini--go" onClick={() => respond(iv.teamId, true)}>Aceptar</button>
                <button className="sales-mini sales-mini--del" onClick={() => respond(iv.teamId, false)}>Rechazar</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!canCreate && mine.length > 0 && (
        <div className="apex-card" style={{ padding: 18, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 10px', fontWeight: 400 }}>Tus equipos</h3>
          <div className="pf-friend-list">
            {mine.map(t => (
              <div key={t.id}>
                <div className="pf-friend">
                  <FriendAvatar p={t.company || { display_name: t.name }} />
                  <div className="pf-friend-id"><span className="pf-friend-name">{t.emoji} {t.name}</span><span className="pf-friend-nick">{t.company?.display_name || ''}</span></div>
                  <button className="sales-mini sales-mini--go" onClick={() => setChatTeam(chatTeam === t.id ? null : t.id)}>{chatTeam === t.id ? 'Cerrar chat' : 'Chat'}</button>
                </div>
                {chatTeam === t.id && <TeamChat teamId={t.id} title={`Chat · ${t.name}`} />}
              </div>
            ))}
          </div>
        </div>
      )}
      {!canCreate && invites.length === 0 && mine.length === 0 && (
        <div className="apex-card" style={{ padding: 16, marginBottom: 16, color: 'var(--apex-plat-mid)', fontSize: 13 }}>
          Los <b>equipos los crea la empresa</b> para la que trabajas. Cuando te inviten, la verás aquí para aceptar o rechazar.
        </div>
      )}
      {canCreate && (
      <div className="apex-card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontWeight: 400 }}>Montar equipo de cliente</h3>
        <p className="set-note" style={{ margin: '0 0 12px' }}>Un equipo agrupa a los closers que trabajan <b>una misma cuenta</b>. Sus métricas se ven <b>filtradas solo a ese cliente</b>.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="ac-input" style={{ width: 60, textAlign: 'center' }} value={emoji} onChange={e => setEmoji(e.target.value.slice(0, 2))} />
          <input className="ac-input" style={{ maxWidth: 240 }} placeholder="Nombre del equipo (ej. Escuadrón Hugo)" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <select className="ac-input" style={{ maxWidth: 220 }} value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">— elige cliente —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="ac-btn" onClick={add}>Crear equipo</button>
          {clients.length === 0 && <span className="set-note" style={{ flexBasis: '100%' }}>Primero añade clientes en la pestaña <b>Clientes</b>.</span>}
        </div>
      </div>
      )}

      {teams.length === 0 && <div className="apex-card" style={{ padding: 18, color: 'var(--apex-plat-low)' }}>{canCreate ? 'Sin equipos todavía. Crea uno y asígnalo a un cliente.' : 'Todavía no estás en ningún equipo.'}</div>}
      {teams.map(t => (
        <div className="apex-card pf-team" key={t.id} style={{ padding: 20, marginBottom: 12 }}>
          <div className="pf-team-head">
            <div className="pf-team-title">
              <span className="pf-team-emoji">{t.emoji}</span>
              <div>
                <h3 style={{ margin: 0, fontWeight: 400 }}>{t.name} <span style={{ color: 'var(--apex-plat-low)', fontSize: 12 }}>· {t.members.length} closers</span></h3>
                <span className="pf-team-client">{cname(t.client_id)}</span>
              </div>
            </div>
            <button className="sales-mini sales-mini--del" onClick={() => deleteTeam(t.id).then(load)}>Eliminar equipo</button>
          </div>

          {/* Marcador del equipo — datos filtrados a este cliente */}
          <div className="pf-team-scoreboard">
            {[
              { l: 'Revenue', v: money(t.totals.revenue) },
              { l: 'Cash collected', v: money(t.totals.cash) },
              { l: 'Cierres', v: intf(t.totals.deals) },
              { l: 'Llamadas', v: intf(t.totals.calls) },
              { l: 'Close rate', v: pct(t.totals.close_rate) },
            ].map(s => (
              <div className="pf-team-stat" key={s.l}><span className="pf-team-stat-v">{s.v}</span><span className="pf-team-stat-l">{s.l}</span></div>
            ))}
          </div>

          <div className="pf-team-members">
            {t.members.map(m => (
              <div className="pf-team-member" key={m.user_id}>
                <FriendAvatar p={m} />
                <div className="pf-friend-id" style={{ cursor: 'pointer' }} onClick={() => onOpenMember(m.user_id, t.client_id)} title={`Ver a ${m.display_name} solo en ${clientName(t.client_id)}`}>
                  <span className="pf-friend-name">{m.display_name}</span>
                  {m.nickname && <span className="pf-friend-nick">@{m.nickname}</span>}
                </div>
                <span className="pf-team-mstat">{money(m.stats.revenue)} · {intf(m.stats.deals)} cierres</span>
                <button className="sales-mini sales-mini--go" onClick={() => onOpenMember(m.user_id, t.client_id)} title="Abrir perfil filtrado a este cliente">Ver →</button>
                <button className="sales-mini sales-mini--del" onClick={() => teamRemove(t.id, m.user_id).then(load)}>✕</button>
              </div>
            ))}
            {t.members.length === 0 && <p className="ac-empty" style={{ padding: 0 }}>Equipo vacío. Añade closers abajo.</p>}
          </div>

          {friends.filter(f => !t.members.some(m => m.user_id === f.user_id)).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <label className="sc-lbl">Añadir closer al equipo</label>
              <select className="ac-input" style={{ maxWidth: 280 }} value="" onChange={e => e.target.value && teamAdd(t.id, e.target.value).then(load)}>
                <option value="">— elige —</option>
                {friends.filter(f => !t.members.some(m => m.user_id === f.user_id)).map(f => <option key={f.user_id} value={f.user_id}>{f.display_name}{f.nickname ? ` (@${f.nickname})` : ''}</option>)}
              </select>
            </div>
          )}
        </div>
      ))}
      <style>{PF_CSS}</style>
    </section>
  )
}

const PF_CSS = `
/* Avatar pequeño (pantalla de edición) */
.pf-avatar { width: 88px; height: 88px; flex: 0 0 88px; border-radius: 50%; overflow: hidden; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); display: inline-flex; align-items: center; justify-content: center; color: var(--apex-plat-mid); font-size: 28px; }
.pf-avatar img { width: 100%; height: 100%; object-fit: cover; }

/* Cabecera: columna lateral (foto grande + ranking + nivel + logros) | tarjeta info */
.pf-top { display: flex; align-items: center; gap: 28px; }
.pf-avatar-xl { width: 200px; height: 200px; flex: none; border-radius: 50%; overflow: hidden; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border-strong); display: inline-flex; align-items: center; justify-content: center; color: var(--apex-plat-mid); font-size: 58px; box-shadow: 0 10px 28px rgba(0,0,0,0.4); }
.pf-avatar-xl img { width: 100%; height: 100%; object-fit: cover; }
.pf-id-card { flex: 1; min-width: 0; padding: 26px; position: relative; }
.pf-id-grid { display: grid; grid-template-columns: 1.55fr 1fr; gap: 30px; align-items: start; }
.pf-col-main { min-width: 0; display: flex; flex-direction: column; }
.pf-col-side { display: flex; flex-direction: column; gap: 18px; }
.pf-merits { display: flex; flex-direction: column; gap: 12px; margin: 16px 0; }
.pf-merit { display: flex; flex-direction: column; gap: 6px; max-width: 360px; }
.pf-merit-name { color: var(--apex-plat-hi); font-weight: 500; }
.pf-rankrow { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 14px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: var(--apex-radius, 0); cursor: pointer; transition: border-color 0.18s; }
.pf-rankrow:hover { border-color: var(--apex-border-strong); }
.pf-rankrow-pos { display: inline-flex; align-items: center; gap: 6px; font-size: 18px; color: var(--apex-accent, var(--apex-plat-hi)); font-variant-numeric: tabular-nums; }
.pf-rankrow-lbl { font-size: 12px; color: var(--apex-plat-mid); }
.pf-rankrow-go { margin-left: auto; font-size: 12px; color: var(--apex-plat-low); }

/* Widgets de la columna lateral */
.pf-side-lbl { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--apex-plat-low); }
.pf-side-hint { font-size: 11px; color: var(--apex-plat-low); }
.pf-rankcard { padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; }
.pf-rankcard-pos { font-size: 42px; line-height: 1; color: var(--apex-accent, var(--apex-plat-hi)); font-variant-numeric: tabular-nums; }
.pf-rankcard-sub { font-size: 12px; color: var(--apex-plat-mid); }
.pf-rankcard-go { align-self: flex-start; margin-top: 4px; }
.pf-level { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
.pf-level-name { font-size: 16px; color: var(--apex-plat-hi); }
.pf-level-bar { height: 6px; background: var(--apex-alpha-2); border-radius: 999px; overflow: hidden; }
.pf-level-fill { height: 100%; background: var(--apex-accent, var(--apex-plat-hi)); border-radius: 999px; box-shadow: 0 0 10px color-mix(in srgb, var(--apex-accent, transparent) 40%, transparent); }
.pf-badges { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.pf-badges-list { display: flex; flex-wrap: wrap; gap: 6px; }
.pf-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--apex-plat-mid); border: 1px solid var(--apex-border); padding: 4px 8px; border-radius: var(--apex-radius-pill, 0); }
.pf-badge svg { color: var(--apex-accent, var(--apex-plat-mid)); }
.pf-id-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.pf-id-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pf-clients { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.pf-clients-lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--apex-plat-low); }
.pf-clients-list { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.pf-client-chip { font-size: 11.5px; color: var(--apex-plat-mid); border: 1px solid var(--apex-border); padding: 3px 9px; border-radius: var(--apex-radius-pill, 0); }
.pf-like { position: absolute; top: 18px; right: 18px; z-index: 1; display: inline-flex; align-items: center; gap: 6px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); color: var(--apex-plat-mid); font-family: var(--apex-font); font-size: 12.5px; padding: 6px 12px; border-radius: var(--apex-radius-pill, 0); cursor: pointer; transition: color 0.18s, border-color 0.18s; }
.pf-like:hover { color: var(--apex-plat-hi); border-color: var(--apex-plat-mid); }
.pf-like[data-on] { color: var(--apex-status-neg); border-color: color-mix(in srgb, var(--apex-status-neg) 45%, transparent); }

/* Banner de posición en el ranking */
.pf-rank { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 14px 18px; cursor: pointer; flex-wrap: wrap; }
.pf-rank-pos { display: inline-flex; align-items: center; gap: 6px; font-size: 16px; color: var(--apex-accent, var(--apex-plat-hi)); font-variant-numeric: tabular-nums; }
.pf-rank-txt { font-size: 13px; color: var(--apex-plat-mid); }
.pf-rank-meta { font-size: 13px; color: var(--apex-plat-hi); }
.pf-rank-go { margin-left: auto; font-size: 12px; color: var(--apex-plat-low); }
.pf-rank:hover .pf-rank-go { color: var(--apex-plat-hi); }

.pf-name { margin: 0; font-weight: 400; font-size: 24px; color: var(--apex-plat-hi); }
.pf-nick { font-size: 13px; color: var(--apex-plat-low); }
.pf-headline { font-size: 14px; color: var(--apex-plat-mid); margin-top: 6px; }
.pf-loc { font-size: 12px; color: var(--apex-plat-low); margin-top: 2px; }
.pf-bio { font-size: 13.5px; color: var(--apex-plat-mid); line-height: 1.55; margin: 10px 0 0; max-width: 60ch; }
.pf-links { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.pf-link { font-size: 12px; color: var(--apex-plat-hi); border: 1px solid var(--apex-border); padding: 4px 10px; text-decoration: none; }
.pf-link:hover { border-color: var(--apex-plat-mid); }
.pf-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); gap: 12px; }
.pf-metric { position: relative; padding: 18px; display: flex; flex-direction: column; gap: 6px; background: var(--apex-card-bg); border: 1px solid var(--apex-border); border-radius: var(--apex-radius, 0); box-shadow: inset 0 1px 0 var(--apex-inset-top); }
.pf-metric[data-public]::before { content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 0 3px 3px 0; background: var(--apex-accent, var(--apex-status-pos)); }
.pf-metric-v { font-size: 26px; color: var(--apex-plat-hi); font-variant-numeric: tabular-nums; line-height: 1; }
.pf-metric-l { font-size: 11px; color: var(--apex-plat-low); text-transform: uppercase; letter-spacing: 0.06em; }
.pf-metric-vis { position: absolute; top: 12px; right: 12px; font-size: 9px; padding: 2px 7px; border: 1px solid var(--apex-border); color: var(--apex-plat-low); border-radius: var(--apex-radius-pill, 2px); }
.pf-metric-vis[data-on] { color: var(--apex-accent, var(--apex-status-pos)); border-color: color-mix(in srgb, var(--apex-accent, var(--apex-status-pos)) 45%, transparent); }

/* Descripción + Revenue/Cash destacados en la misma fila */
.pf-about { display: flex; gap: 26px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
.pf-about .pf-bio { flex: 1; min-width: 240px; margin: 0; }
/* Altar: Tu comisión (grande, verde) → Cash collected → Revenue (apilados, sin borde) */
.pf-altar { flex: 0 0 auto; display: flex; flex-direction: column; gap: 16px; }
.pf-altar-hero { display: flex; flex-direction: column; gap: 4px; }
.pf-altar-v { font-size: 38px; color: var(--apex-accent, var(--apex-plat-hi)); font-variant-numeric: tabular-nums; line-height: 1; }
.pf-altar-line { display: flex; flex-direction: column; gap: 3px; }
.pf-altar-v2 { font-size: 22px; color: var(--apex-plat-mid); font-variant-numeric: tabular-nums; line-height: 1; }
.pf-altar-l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--apex-plat-low); }

/* Métricas en 2 filas de 5: conteos arriba, porcentajes (marcador/anillo) abajo */
.pf-metrics-rows { display: flex; flex-direction: column; gap: 12px; }
.pf-metrics-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
.pf-metric { min-height: 132px; justify-content: center; }
.pf-metric--ring { align-items: center; justify-content: center; text-align: center; gap: 8px; padding: 14px; }
.pf-metric--ring .ring-card { padding: 0; gap: 8px; }
@media (max-width: 900px) { .pf-metrics-row { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 560px) { .pf-metrics-row { grid-template-columns: repeat(2, 1fr); } }

@media (max-width: 980px) { .pf-id-grid { grid-template-columns: 1fr; gap: 20px; } }
@media (max-width: 720px) {
  .pf-top { flex-direction: column; align-items: stretch; }
  .pf-avatar-xl { width: 160px; height: 160px; align-self: center; }
}
@media (max-width: 560px) { .pf-id-card { padding: 20px 18px; } }
.pf-friend-list { display: flex; flex-direction: column; gap: 8px; }
.pf-friend { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--apex-border); background: var(--apex-trigger-bg); border-radius: var(--apex-radius-sm, 0); transition: border-color 0.18s var(--apex-ease-editorial), background 0.18s var(--apex-ease-editorial); }
.pf-friend:hover { border-color: var(--apex-border-strong); background: var(--apex-trigger-bg-h); }
.pf-friend-av { width: 40px; height: 40px; flex: 0 0 40px; border-radius: 50%; overflow: hidden; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); display: inline-flex; align-items: center; justify-content: center; color: var(--apex-plat-mid); font-size: 14px; }
.pf-friend-av img { width: 100%; height: 100%; object-fit: cover; }
.pf-friend-id { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pf-friend-name { font-size: 13px; color: var(--apex-plat-hi); cursor: pointer; }
.pf-friend-name:hover { text-decoration: underline; }
.pf-friend-nick { font-size: 11px; color: var(--apex-plat-low); }

/* Banner de perfil filtrado a un cliente (acceso vía equipo) */
.pf-scope { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-color: color-mix(in srgb, var(--apex-accent, var(--apex-border-strong)) 45%, var(--apex-border)); background: color-mix(in srgb, var(--apex-accent, transparent) 7%, var(--apex-card-bg, var(--apex-trigger-bg))); }
.pf-scope-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--apex-accent, var(--apex-plat-hi)); box-shadow: 0 0 10px color-mix(in srgb, var(--apex-accent, transparent) 70%, transparent); }
.pf-scope-txt { flex: 1; min-width: 0; font-size: 13px; color: var(--apex-plat-mid); }
.pf-scope-txt b { color: var(--apex-plat-hi); font-weight: 500; }
.pf-scope-go { display: inline-flex; align-items: center; gap: 5px; background: transparent; border: 1px solid var(--apex-border); color: var(--apex-plat-mid); padding: 6px 12px; border-radius: var(--apex-radius-pill, 999px); font-size: 12px; cursor: pointer; transition: border-color 0.18s, color 0.18s; }
.pf-scope-go:hover { border-color: var(--apex-accent, var(--apex-border-strong)); color: var(--apex-plat-hi); }
.pf-client-chip[data-active] { border-color: color-mix(in srgb, var(--apex-accent, var(--apex-border-strong)) 55%, transparent); color: var(--apex-accent, var(--apex-plat-hi)); }

/* Actividad filtrada al cliente (llamadas + ventas del closer en esa cuenta) */
.pf-act-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pf-act { padding: 20px; }
.pf-act-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.pf-act-head h3 { margin: 0; font-weight: 400; font-size: 15px; }
.pf-act-count { font-size: 12px; color: var(--apex-plat-low); font-variant-numeric: tabular-nums; border: 1px solid var(--apex-border); border-radius: var(--apex-radius-pill, 999px); padding: 1px 9px; }
.pf-act-list { display: flex; flex-direction: column; gap: 8px; }
.pf-act-row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 11px 13px; border: 1px solid var(--apex-border); background: var(--apex-trigger-bg); border-radius: var(--apex-radius-sm, 10px); }
button.pf-act-row { cursor: pointer; transition: border-color 0.18s var(--apex-ease-editorial), background 0.18s var(--apex-ease-editorial); font: inherit; color: inherit; }
button.pf-act-row:hover { border-color: var(--apex-accent, var(--apex-border-strong)); background: var(--apex-trigger-bg-h); }
.pf-act-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.pf-act-row-title { font-size: 13px; color: var(--apex-plat-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pf-act-row-meta { font-size: 11px; color: var(--apex-plat-low); }
.pf-act-sale-amt { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; white-space: nowrap; }
.pf-act-rev { font-size: 14px; color: var(--apex-accent, var(--apex-plat-hi)); font-variant-numeric: tabular-nums; }
.pf-act-cash { font-size: 10px; color: var(--apex-plat-low); }
@media (max-width: 860px) { .pf-act-grid { grid-template-columns: 1fr; } }

/* Equipos de cliente */
.pf-team-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.pf-team-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pf-team-emoji { font-size: 26px; line-height: 1; width: 46px; height: 46px; flex: 0 0 46px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--apex-radius-sm, 10px); background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); }
.pf-team-client { display: inline-flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--apex-accent, var(--apex-plat-mid)); }
.pf-team-client::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--apex-accent, var(--apex-plat-mid)); box-shadow: 0 0 8px color-mix(in srgb, var(--apex-accent, transparent) 60%, transparent); }
.pf-team-scoreboard { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; background: var(--apex-border); border: 1px solid var(--apex-border); border-radius: var(--apex-radius-sm, 10px); overflow: hidden; margin-bottom: 16px; }
.pf-team-stat { display: flex; flex-direction: column; gap: 4px; padding: 14px 12px; background: var(--apex-trigger-bg); }
.pf-team-stat-v { font-size: 19px; color: var(--apex-accent, var(--apex-plat-hi)); font-variant-numeric: tabular-nums; line-height: 1.05; }
.pf-team-stat-l { font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--apex-plat-low); }
.pf-team-members { display: flex; flex-direction: column; gap: 8px; }
.pf-team-member { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--apex-border); background: var(--apex-trigger-bg); border-radius: var(--apex-radius-sm, 0); transition: border-color 0.18s var(--apex-ease-editorial); }
.pf-team-member:hover { border-color: var(--apex-border-strong); }
.pf-team-mstat { font-size: 12px; color: var(--apex-plat-mid); font-variant-numeric: tabular-nums; white-space: nowrap; }
@media (max-width: 720px) { .pf-team-scoreboard { grid-template-columns: repeat(2, 1fr); } .pf-team-mstat { display: none; } }
`
