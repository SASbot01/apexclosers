import { useState, useEffect } from 'react'
import { useApexTheme } from '../../shell/ThemeContext'
import { getAdminToken, adminLogin, adminLogout, adminListUsers, adminSetAccess, adminSetType, adminDeleteUser } from '../../lib/adminApi'

/*
 * /admin — panel de administración (fuera del AuthGate). Login propio (email +
 * contraseña). Ver todos los usuarios, aprobar/bloquear/eliminar accesos y asignar
 * rol closer/client. El software es de pago: los registros nuevos con Google
 * quedan PENDIENTES hasta que aquí se aprueben.
 */
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const initials = (n) => (n || '?').split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()
const ACCESS_META = { pending: { c: '#E8B339', l: 'Pendiente' }, approved: { c: '#3FD08B', l: 'Aprobado' }, blocked: { c: '#E58371', l: 'Bloqueado' } }

export default function Admin() {
  const { theme } = useApexTheme()
  const [authed, setAuthed] = useState(!!getAdminToken())
  return (
    <div className="apex-ops" data-theme={theme} style={{ minHeight: '100vh' }}>
      {authed ? <AdminPanel onLogout={() => { adminLogout(); setAuthed(false) }} /> : <AdminLogin onIn={() => setAuthed(true)} />}
    </div>
  )
}

function AdminLogin({ onIn }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true)
    try { await adminLogin(email.trim(), pw); onIn() }
    catch (e2) { setErr(e2.message === 'not_admin' ? 'Esa cuenta no es admin.' : 'Credenciales incorrectas.'); setBusy(false) }
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <img src="/apex-mark-platinum.svg" alt="Apex" width={44} height={44} />
          <div style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--apex-plat-low)', marginTop: 12 }}>Panel de administración</div>
        </div>
        <input className="ac-input" type="email" placeholder="Email admin" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" />
        <input className="ac-input" type="password" placeholder="Contraseña" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" />
        {err && <div style={{ color: '#E58371', fontSize: 12.5, textAlign: 'center' }}>{err}</div>}
        <button className="ac-btn" type="submit" disabled={busy || !email || !pw}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

function AdminPanel({ onLogout }) {
  const [users, setUsers] = useState([])
  const [state, setState] = useState('loading')
  const [q, setQ] = useState('')
  const load = () => { setState('loading'); adminListUsers().then(u => { setUsers(u); setState('live') }).catch(() => setState('error')) }
  useEffect(load, [])

  const act = async (fn) => { try { await fn() } catch (e) { alert(e.message) } load() }
  const filtered = users.filter(u => !q || `${u.name} ${u.email} ${u.nickname || ''}`.toLowerCase().includes(q.toLowerCase()))
  const pending = users.filter(u => u.access === 'pending').length

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontWeight: 400, fontSize: 24, color: 'var(--apex-plat-hi)', margin: 0 }}>Administración</h1>
          <div style={{ fontSize: 12.5, color: 'var(--apex-plat-low)', marginTop: 2 }}>{users.length} usuarios · {pending} pendientes de aprobar</div>
        </div>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <input className="ac-input" style={{ maxWidth: 220 }} placeholder="Buscar usuario…" value={q} onChange={e => setQ(e.target.value)} />
          <button className="ac-btn" style={ghost} onClick={load}>Refrescar</button>
          <button className="ac-btn" style={ghost} onClick={onLogout}>Salir</button>
        </div>
      </div>

      {state === 'error' && <div className="apex-card" style={{ padding: 16, color: 'var(--apex-plat-mid)' }}>No pude cargar los usuarios.</div>}
      {state === 'loading' && <div className="apex-card" style={{ padding: 16, color: 'var(--apex-plat-low)' }}>Cargando…</div>}

      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.map(u => {
          const a = ACCESS_META[u.access] || ACCESS_META.approved
          return (
            <div className="apex-card" key={u.id} style={{ padding: 14, display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center' }}>
              <span style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: 'var(--apex-trigger-bg)', border: '1px solid var(--apex-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--apex-plat-hi)' }}>
                {u.photo_url ? <img src={u.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(u.name)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--apex-plat-hi)' }}>{u.name} {u.nickname && <span style={{ color: 'var(--apex-plat-low)', fontSize: 12 }}>@{u.nickname}</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--apex-plat-low)' }}>{u.email} · {u.deals} cierres · {money(u.revenue)}</div>
              </div>
              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 11.5, color: a.c, border: `1px solid ${a.c}`, borderRadius: 999, padding: '2px 9px' }}>{a.l}</span>
                <select className="ac-input" style={{ padding: '4px 6px', fontSize: 12 }} value={u.account_type} onChange={e => act(() => adminSetType(u.id, e.target.value))}>
                  <option value="closer">Closer</option>
                  <option value="client">Cliente</option>
                  <option value="admin">Admin</option>
                </select>
                {u.access !== 'approved' && <button className="sales-mini sales-mini--go" onClick={() => act(() => adminSetAccess(u.id, 'approved'))}>Aprobar</button>}
                {u.access !== 'blocked' ? <button className="sales-mini" onClick={() => act(() => adminSetAccess(u.id, 'blocked'))}>Bloquear</button>
                  : <button className="sales-mini" onClick={() => act(() => adminSetAccess(u.id, 'approved'))}>Desbloquear</button>}
                <button className="sales-mini sales-mini--del" onClick={() => { if (window.confirm(`¿Eliminar a ${u.name}? No se puede deshacer.`)) act(() => adminDeleteUser(u.id)) }}>Eliminar</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ghost = { background: 'transparent', color: 'var(--apex-plat-mid)', borderColor: 'var(--apex-border)' }
