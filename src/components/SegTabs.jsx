import { useLocation, useNavigate } from 'react-router-dom'

/*
 * SegTabs — control segmentado para sub-vistas dentro de una sección.
 * Mantiene la navegación simple: pocas secciones arriba, sub-vistas aquí.
 * tabs = [{ to, label }]
 */
export default function SegTabs({ tabs }) {
  const loc = useLocation()
  const nav = useNavigate()
  return (
    <div className="seg" role="tablist">
      {tabs.map(t => (
        <button
          key={t.to}
          type="button"
          role="tab"
          className="seg-btn"
          data-active={loc.pathname.startsWith(t.to) || undefined}
          onClick={() => nav(t.to)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
