import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { listNotifications, markNotifRead, markAllNotifRead } from '../lib/workflowApi'

/*
 * Campana de notificaciones — confirmaciones de venta, seguimientos vencidos,
 * ventas verificadas. Sondea cada 60s. Vive en la topbar (junto al engranaje).
 */
export default function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const ref = useRef(null)
  const navigate = useNavigate()

  const load = () => listNotifications().then(d => { setItems(d.notifications || []); setUnread(d.unread || 0) }).catch(() => {})
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const openOne = (n) => {
    if (!n.read) markNotifRead(n.id).then(load).catch(() => {})
    setOpen(false)
    if (n.link) navigate(n.link)
  }
  const readAll = () => markAllNotifRead().then(load).catch(() => {})

  return (
    <div ref={ref} className="apex-bell">
      <button type="button" className="apex-gear" data-active={open || undefined} onClick={() => { setOpen(o => !o); if (!open) load() }} aria-label="Notificaciones" title="Notificaciones">
        <Bell size={17} strokeWidth={1.6} />
        {unread > 0 && <span className="apex-bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="apex-bell-panel">
          <div className="apex-bell-head">
            <span>Notificaciones</span>
            {unread > 0 && <button className="crm-link" onClick={readAll}>Marcar leídas</button>}
          </div>
          <div className="apex-bell-list">
            {items.length === 0 && <div className="apex-bell-empty">Sin notificaciones.</div>}
            {items.map(n => (
              <button key={n.id} type="button" className="apex-bell-item" data-unread={!n.read || undefined} onClick={() => openOne(n)}>
                <span className="apex-bell-title">{n.title}</span>
                {n.body && <span className="apex-bell-body">{n.body}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <style>{BELL_CSS}</style>
    </div>
  )
}

const BELL_CSS = `
.apex-bell { position: relative; display: inline-flex; }
.apex-bell-dot { position: absolute; top: -2px; right: -2px; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 8px; background: #E58371; color: #0a0c12; font-size: 9.5px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; }
.apex-bell-panel { position: absolute; top: calc(100% + 8px); right: 0; z-index: 1600; width: 320px; max-height: 420px; overflow: auto; background: var(--apex-card-bg, #0d0f15); border: 1px solid var(--apex-border); box-shadow: 0 24px 48px rgba(0,0,0,0.5); }
.apex-bell-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--apex-alpha-3); font-size: 12.5px; color: var(--apex-plat-hi); }
.apex-bell-list { display: flex; flex-direction: column; }
.apex-bell-empty { padding: 20px 14px; color: var(--apex-plat-low); font-size: 12.5px; text-align: center; }
.apex-bell-item { display: flex; flex-direction: column; gap: 3px; text-align: left; padding: 11px 14px; background: transparent; border: 0; border-bottom: 1px solid var(--apex-alpha-3); cursor: pointer; }
.apex-bell-item:hover { background: var(--apex-trigger-bg); }
.apex-bell-item[data-unread] { background: color-mix(in srgb, #8AC8E0 7%, transparent); }
.apex-bell-title { font-size: 12.5px; color: var(--apex-plat-hi); }
.apex-bell-body { font-size: 11.5px; color: var(--apex-plat-low); line-height: 1.45; }
`
