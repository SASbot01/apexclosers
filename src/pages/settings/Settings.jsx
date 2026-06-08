import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, CreditCard, Calendar, Mic, Webhook, Users, TrendingUp, Wallet, Download } from 'lucide-react'
import FloatingHeader from '../../components/FloatingHeader'
import { useCurrentUser, signOut } from '../../lib/auth'
import { getMetrics, getVisibility, setVisibility as apiSetVisibility } from '../../lib/salesApi'

const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const intf = (v) => new Intl.NumberFormat('es-ES').format(Math.round(v || 0))
const pctv = (v) => v == null ? '—' : `${Math.round(v * 100)}%`
const fmtVal = (m) => m.fmt === 'money' ? money(m.value) : m.fmt === 'pct' ? pctv(m.value) : intf(m.value)

const TABS = [
  { key: 'general', label: 'General', eyebrow: 'CUENTA' },
  { key: 'billing', label: 'Billing', eyebrow: 'FACTURACIÓN' },
  { key: 'integraciones', label: 'Integraciones', eyebrow: 'INTEGRACIONES' },
  { key: 'afiliados', label: 'Afiliados', eyebrow: 'AFILIADOS' },
]

/*
 * Ajustes — 4 apartados: General (cuenta · perfil · métricas · tema),
 * Billing (plan · uso · método de pago · facturas), Integraciones (Notetaker ·
 * calendario · CRM · API) y Afiliados (link · comisión · ganancias · referidos).
 */
export default function Settings() {
  const [tab, setTab] = useState('general')
  const active = TABS.find(t => t.key === tab) || TABS[0]

  return (
    <>
      <FloatingHeader title="Ajustes" eyebrow={active.eyebrow} actions={
        <div className="seg">
          {TABS.map(t => (
            <button key={t.key} type="button" className="seg-btn" data-active={tab === t.key || undefined} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
      } />

      <section className="apex-section">
        {tab === 'general' && <GeneralTab />}
        {tab === 'billing' && <BillingTab />}
        {tab === 'integraciones' && <IntegrationsTab />}
        {tab === 'afiliados' && <AffiliatesTab />}
      </section>
      <style>{SET_CSS}</style>
    </>
  )
}

// ── General ───────────────────────────────────────────────────────────────────
function GeneralTab() {
  const user = useCurrentUser() || {}
  const navigate = useNavigate()
  return (
    <>
      <div className="apex-card set-card">
        <h3>Cuenta</h3>
        <div className="set-row">
          <span className="set-k">Conectado como</span>
          <span className="set-v">{user.name || 'Usuario'}{user.demo ? ' · demo' : ''}</span>
        </div>
        <div className="set-row"><span className="set-k">Email</span><span className="set-v">{user.email || '—'}</span></div>
        <div className="set-row">
          <span className="set-k">Sesión</span>
          <button className="set-btn" onClick={signOut}>Cerrar sesión</button>
        </div>
      </div>

      <div className="apex-card set-card">
        <h3>Perfil</h3>
        <p className="set-note" style={{ margin: '0 0 12px' }}>Tu perfil público: foto, nickname, descripción, links, métricas públicas, amigos, grupos y equipos. También puedes generar tu currículum.</p>
        <div className="set-row"><span className="set-k">Tu perfil</span><button className="set-btn" onClick={() => navigate('/perfil')}>Abrir perfil</button></div>
        <div className="set-row"><span className="set-k">Amigos, grupos y equipos</span><button className="set-btn" onClick={() => navigate('/perfil')}>Gestionar</button></div>
        <div className="set-row"><span className="set-k">Idioma</span><span className="set-v">Español (ES)</span></div>
      </div>

      <div className="apex-card set-card">
        <h3>Workflow y seguimiento</h3>
        <p className="set-note" style={{ margin: '0 0 12px' }}>Secuencias de seguimiento por estado de llamada (Email/WhatsApp/SMS) y ranking global de closers.</p>
        <div className="set-row"><span className="set-k">Secuencias</span><button className="set-btn" onClick={() => navigate('/secuencias')}>Configurar</button></div>
        <div className="set-row"><span className="set-k">Ranking global</span><button className="set-btn" onClick={() => navigate('/ranking')}>Ver ranking</button></div>
      </div>

      <MetricsVisibilityCard />

      <div className="apex-card set-card">
        <h3>Tema</h3>
        <p className="set-note">Cambia el tema (Apex Neón · Apex Dark · Apex Light) desde el logo Apex, arriba a la izquierda.</p>
      </div>
    </>
  )
}

// ── Billing ───────────────────────────────────────────────────────────────────
const INVOICES = [
  { id: 'INV-2026-006', date: '01 jun 2026', amount: 99, status: 'paid' },
  { id: 'INV-2026-005', date: '01 may 2026', amount: 99, status: 'paid' },
  { id: 'INV-2026-004', date: '01 abr 2026', amount: 117, status: 'paid' },
]
function BillingTab() {
  const used = 18, quota = 30
  const pct = Math.min(100, Math.round((used / quota) * 100))
  return (
    <>
      <div className="apex-card set-card set-plan">
        <div className="set-plan-info">
          <span className="set-plan-tag">Plan actual</span>
          <h3 style={{ margin: '4px 0 2px' }}>Apex Pro</h3>
          <p className="set-note" style={{ margin: 0 }}>30 h de transcripción/mes · IA del Orbe · afiliados · soporte prioritario.</p>
        </div>
        <div className="set-plan-price">
          <span className="set-plan-amt">{money(99)}</span>
          <span className="set-plan-per">/ mes</span>
          <button className="set-btn set-btn--accent" style={{ marginTop: 10 }}>Cambiar plan</button>
        </div>
      </div>

      <div className="apex-card set-card">
        <h3>Uso este mes</h3>
        <div className="set-meter"><div className="set-meter-fill" style={{ width: `${pct}%` }} /></div>
        <p className="set-note">{used} h de {quota} h de transcripción incluidas ({pct}%). El exceso se factura por tokens (overage) a {money(3)}/h.</p>
        <div className="set-row" style={{ marginTop: 6 }}><span className="set-k">Renovación</span><span className="set-v">01 jul 2026</span></div>
      </div>

      <div className="apex-card set-card">
        <h3>Método de pago</h3>
        <div className="set-row">
          <span className="set-k" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><CreditCard size={15} strokeWidth={1.8} /> Visa terminada en 4242</span>
          <button className="set-btn">Actualizar</button>
        </div>
        <div className="set-row"><span className="set-k">Facturación</span><span className="set-v">Mensual · vía Whop</span></div>
        <p className="set-note">Los pagos y la gestión de la suscripción se procesan de forma segura con Whop/Stripe.</p>
      </div>

      <div className="apex-card set-card">
        <h3>Facturas</h3>
        <div className="set-table">
          <div className="set-tr set-tr--head"><span>Factura</span><span>Fecha</span><span className="num">Importe</span><span>Estado</span><span></span></div>
          {INVOICES.map(inv => (
            <div className="set-tr" key={inv.id}>
              <span className="set-mono">{inv.id}</span>
              <span>{inv.date}</span>
              <span className="num">{money(inv.amount)}</span>
              <span><span className="set-badge" data-tone="pos">Pagada</span></span>
              <span className="set-tr-act"><button className="set-icon-btn" title="Descargar PDF"><Download size={14} strokeWidth={1.8} /></button></span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Integraciones ─────────────────────────────────────────────────────────────
const INTEGRATIONS = [
  { key: 'recall', Icon: Mic, name: 'Notetaker (Recall.ai)', desc: 'Graba y transcribe tus llamadas de venta automáticamente.', status: 'connected', cta: 'Configurar' },
  { key: 'gcal', Icon: Calendar, name: 'Google Calendar', desc: 'El Notetaker entra solo a tus llamadas de venta agendadas.', status: 'disconnected', cta: 'Conectar' },
  { key: 'crm', Icon: Users, name: 'CRM (Close · HubSpot)', desc: 'Sincroniza leads, contactos y estados con tu CRM.', status: 'disconnected', cta: 'Conectar' },
  { key: 'api', Icon: Webhook, name: 'API y Webhooks', desc: 'Conecta Apex con n8n, Zapier o tu propio backend.', status: 'disconnected', cta: 'Generar API key' },
]
function IntegrationsTab() {
  return (
    <>
      <p className="set-note" style={{ margin: '0 0 14px' }}>Conecta tus herramientas. El Notetaker es el núcleo: graba y transcribe tus llamadas para que la IA genere tus datos de rendimiento.</p>
      <div className="set-integrations">
        {INTEGRATIONS.map(it => (
          <div className="apex-card set-int" key={it.key}>
            <span className="set-int-ic"><it.Icon size={20} strokeWidth={1.7} /></span>
            <div className="set-int-body">
              <div className="set-int-top">
                <span className="set-int-name">{it.name}</span>
                <span className="set-badge" data-tone={it.status === 'connected' ? 'pos' : 'idle'}>{it.status === 'connected' ? 'Conectado' : 'Sin conectar'}</span>
              </div>
              <p className="set-int-desc">{it.desc}</p>
            </div>
            <button className="set-btn" disabled={it.status !== 'connected' && it.key !== 'recall'}>{it.status === 'connected' ? it.cta : it.cta}</button>
          </div>
        ))}
      </div>
      <p className="set-note">Las conexiones reales (OAuth de Google, API keys) se activan con el backend desplegado.</p>
    </>
  )
}

// ── Afiliados ─────────────────────────────────────────────────────────────────
const REFERRALS = [
  { name: 'Diego Navarro', date: '02 jun 2026', plan: 'Apex Pro', status: 'active', commission: 30 },
  { name: 'Marta Ibáñez', date: '21 may 2026', plan: 'Apex Pro', status: 'active', commission: 30 },
  { name: 'Carlos Ruano', date: '14 may 2026', plan: 'Apex Starter', status: 'active', commission: 15 },
  { name: 'Lead frío', date: '03 may 2026', plan: '—', status: 'pending', commission: 0 },
]
function AffiliatesTab() {
  const user = useCurrentUser() || {}
  const refCode = (user.email?.split('@')[0]) || 'alex_closer'
  const link = `https://apex-closer.app/?ref=${refCode}`
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* off */ }
  }
  const stats = [
    { Icon: Users, label: 'Referidos', value: intf(12) },
    { Icon: TrendingUp, label: 'Activos', value: intf(8) },
    { Icon: Wallet, label: 'Este mes', value: money(540) },
    { Icon: Wallet, label: 'Total ganado', value: money(3240) },
  ]
  return (
    <>
      <div className="apex-card set-card">
        <h3>Programa de afiliados</h3>
        <p className="set-note" style={{ margin: '0 0 14px' }}>Gana <b>30% recurrente</b> por cada closer que se suscriba con tu link (15% en plan Starter). Se paga mientras tu referido siga activo.</p>
        <label className="set-k" style={{ display: 'block', marginBottom: 6 }}>Tu link de afiliado</label>
        <div className="set-reflink">
          <input className="set-reflink-input" value={link} readOnly onFocus={e => e.target.select()} />
          <button className="set-btn set-btn--accent set-reflink-btn" onClick={copy}>
            {copied ? <><Check size={14} strokeWidth={2} /> Copiado</> : <><Copy size={14} strokeWidth={1.8} /> Copiar</>}
          </button>
        </div>
      </div>

      <div className="set-aff-stats">
        {stats.map((s, i) => (
          <div className="apex-card set-aff-stat" key={i}>
            <span className="set-aff-ic"><s.Icon size={18} strokeWidth={1.7} /></span>
            <span className="set-aff-v">{s.value}</span>
            <span className="set-aff-l">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="apex-card set-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Tus referidos</h3>
          <button className="set-btn set-btn--accent">Solicitar pago</button>
        </div>
        <p className="set-note" style={{ margin: '8px 0 12px' }}>Próximo pago automático: <b>01 jul 2026</b> · método: transferencia.</p>
        <div className="set-table set-table--aff">
          <div className="set-tr set-tr--head"><span>Referido</span><span>Fecha</span><span>Plan</span><span className="num">Comisión</span><span>Estado</span></div>
          {REFERRALS.map((r, i) => (
            <div className="set-tr" key={i}>
              <span className="set-v" style={{ textAlign: 'left' }}>{r.name}</span>
              <span>{r.date}</span>
              <span>{r.plan}</span>
              <span className="num">{r.commission ? `${r.commission}%` : '—'}</span>
              <span><span className="set-badge" data-tone={r.status === 'active' ? 'pos' : 'idle'}>{r.status === 'active' ? 'Activo' : 'Pendiente'}</span></span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// Métricas públicas/privadas — el control vive en Ajustes (apartado General). Lo
// que marques como Pública se ve en tu Perfil (amigos, grupos y gente que invites).
function MetricsVisibilityCard() {
  const [list, setList] = useState([])
  const [visible, setVisible] = useState({})
  const [state, setState] = useState('loading')

  useEffect(() => {
    Promise.all([getMetrics(), getVisibility()])
      .then(([m, v]) => { setList(m.list || []); setVisible(v || {}); setState('live') })
      .catch(() => setState('error'))
  }, [])

  const toggle = (key) => {
    const next = { ...visible, [key]: !visible[key] }
    setVisible(next)
    apiSetVisibility(next).catch(() => { /* offline */ })
  }

  return (
    <div className="apex-card set-card">
      <h3>Métricas públicas</h3>
      <p className="set-note" style={{ margin: '0 0 12px' }}>
        Elige qué métricas se ven en tu perfil. Las <b>Públicas</b> las pueden ver tus amigos, grupos y la gente que invites; las <b>Privadas</b>, solo tú.
      </p>
      {state === 'error' && <p className="set-note">No pude cargar las métricas (¿backend?).</p>}
      {state === 'loading' && <p className="set-note">Cargando…</p>}
      <div className="set-metrics">
        {list.map(m => (
          <div className="set-metric-row" key={m.key}>
            <div className="set-metric-id">
              <span className="set-metric-name">{m.label}</span>
              <span className="set-metric-val">{fmtVal(m)}</span>
            </div>
            <button type="button" className="set-vis" data-on={visible[m.key] || undefined} onClick={() => toggle(m.key)}>
              <span className="set-vis-dot" />{visible[m.key] ? 'Pública' : 'Privada'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const SET_CSS = `
.set-metrics { display: flex; flex-direction: column; gap: 6px; }
.set-metric-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--apex-alpha-3); }
.set-metric-row:last-child { border-bottom: 0; }
.set-metric-id { display: flex; align-items: baseline; gap: 10px; }
.set-metric-name { font-size: 13px; color: var(--apex-plat-hi); }
.set-metric-val { font-size: 12px; color: var(--apex-plat-low); font-family: var(--apex-font); }
.set-vis { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid var(--apex-border); color: var(--apex-plat-low); font-family: var(--apex-font); font-size: 11.5px; padding: 4px 10px; cursor: pointer; }
.set-vis-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--apex-plat-low); }
.set-vis[data-on] { color: var(--apex-status-pos); border-color: color-mix(in srgb, var(--apex-status-pos) 45%, transparent); }
.set-vis[data-on] .set-vis-dot { background: var(--apex-status-pos); }

.set-btn--accent { background: var(--apex-accent, var(--apex-plat-hi)); color: var(--apex-accent-ink, var(--apex-bg)); border-color: var(--apex-accent, var(--apex-plat-hi)); display: inline-flex; align-items: center; gap: 7px; }
.set-btn--accent:hover:not(:disabled) { filter: brightness(1.08); }

/* Badges de estado */
.set-badge { display: inline-flex; align-items: center; font-size: 10.5px; letter-spacing: 0.03em; text-transform: uppercase; padding: 2px 9px; border-radius: var(--apex-radius-pill, 999px); border: 1px solid var(--apex-border); color: var(--apex-plat-low); }
.set-badge[data-tone="pos"] { color: var(--apex-status-pos); border-color: color-mix(in srgb, var(--apex-status-pos) 40%, transparent); }
.set-badge[data-tone="idle"] { color: var(--apex-plat-low); }

/* Plan (Billing) */
.set-plan { display: flex; justify-content: space-between; align-items: center; gap: 18px; flex-wrap: wrap; border-color: color-mix(in srgb, var(--apex-accent, var(--apex-border-strong)) 28%, var(--apex-border)); }
.set-plan-tag { font-family: var(--apex-font-mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--apex-accent, var(--apex-plat-low)); }
.set-plan-price { text-align: right; }
.set-plan-amt { font-size: 30px; color: var(--apex-plat-hi); font-variant-numeric: tabular-nums; }
.set-plan-per { font-size: 12px; color: var(--apex-plat-low); margin-left: 4px; }

/* Tablas (facturas / referidos) */
.set-table { display: flex; flex-direction: column; }
.set-tr { display: grid; grid-template-columns: 1.4fr 1fr 0.9fr 0.9fr 40px; align-items: center; gap: 10px; padding: 11px 0; border-top: 1px solid var(--apex-alpha-3); font-size: 13px; color: var(--apex-plat-hi); }
.set-table--aff .set-tr { grid-template-columns: 1.4fr 1fr 1fr 0.7fr 0.9fr; }
.set-tr--head { border-top: 0; font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--apex-plat-low); }
.set-tr .num { text-align: right; font-variant-numeric: tabular-nums; }
.set-tr-act { display: flex; justify-content: flex-end; }
.set-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); color: var(--apex-plat-mid); cursor: pointer; border-radius: var(--apex-radius-sm, 8px); }
.set-icon-btn:hover { color: var(--apex-plat-hi); border-color: var(--apex-accent, var(--apex-border-strong)); }

/* Integraciones */
.set-integrations { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.set-int { display: flex; align-items: center; gap: 16px; padding: 18px 20px; }
.set-int-ic { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; flex: 0 0 42px; border-radius: 11px; background: var(--apex-accent-soft, var(--apex-alpha-2)); color: var(--apex-accent, var(--apex-plat-hi)); }
.set-int-body { flex: 1; min-width: 0; }
.set-int-top { display: flex; align-items: center; gap: 10px; }
.set-int-name { font-size: 14px; color: var(--apex-plat-hi); }
.set-int-desc { margin: 4px 0 0; font-size: 12px; color: var(--apex-plat-low); line-height: 1.45; }

/* Afiliados */
.set-reflink { display: flex; gap: 8px; }
.set-reflink-input { flex: 1; min-width: 0; background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); color: var(--apex-plat-hi); font-family: var(--apex-font-mono); font-size: 12.5px; padding: 9px 12px; border-radius: var(--apex-radius-sm, 8px); outline: none; }
.set-reflink-input:focus { border-color: var(--apex-accent, var(--apex-border-strong)); }
.set-reflink-btn { white-space: nowrap; }
.set-aff-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 14px 0; }
.set-aff-stat { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; }
.set-aff-ic { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; background: var(--apex-accent-soft, var(--apex-alpha-2)); color: var(--apex-accent, var(--apex-plat-hi)); margin-bottom: 4px; }
.set-aff-v { font-size: 22px; color: var(--apex-plat-hi); font-variant-numeric: tabular-nums; line-height: 1; }
.set-aff-l { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--apex-plat-low); }

@media (max-width: 820px) {
  .set-integrations { grid-template-columns: 1fr; }
  .set-aff-stats { grid-template-columns: repeat(2, 1fr); }
  .set-plan { flex-direction: column; align-items: flex-start; }
  .set-plan-price { text-align: left; }
}
`
