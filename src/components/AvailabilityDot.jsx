// Luz de disponibilidad del closer: verde=Disponible · amarillo=Ocupado ·
// gris=Inactivo. Se muestra en perfil, ranking, buscador y CV para saber si se
// puede contactar. Si recibe onClick, es un botón (el dueño cambia su estado).
const STATUS_META = {
  available: { color: '#3FD08B', label: 'Disponible', glow: true },
  busy:      { color: '#E8B339', label: 'Ocupado',    glow: true },
  inactive:  { color: 'var(--apex-plat-low, #8A8A8A)', label: 'Inactivo', glow: false },
}
export const STATUS_NEXT = { available: 'busy', busy: 'inactive', inactive: 'available' }

export default function AvailabilityDot({ status = 'available', label = true, onClick, size = 8 }) {
  const m = STATUS_META[status] || STATUS_META.available
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag type={onClick ? 'button' : undefined} className="avl" data-status={status} onClick={onClick}
      title={onClick ? 'Cambiar disponibilidad' : m.label}>
      <span className="avl-dot" style={{ width: size, height: size, background: m.color, boxShadow: m.glow ? `0 0 6px ${m.color}` : 'none' }} />
      {label && <span className="avl-lbl">{m.label}</span>}
      <style>{AVL_CSS}</style>
    </Tag>
  )
}

const AVL_CSS = `
.avl { display: inline-flex; align-items: center; gap: 6px; font-family: var(--apex-font); font-size: 11.5px; color: var(--apex-plat-mid); background: transparent; border: 0; padding: 0; }
button.avl { cursor: pointer; border: 1px solid var(--apex-border); border-radius: var(--apex-radius-pill, 999px); padding: 4px 10px; transition: border-color 0.18s; }
button.avl:hover { border-color: var(--apex-plat-mid); }
.avl-dot { display: inline-block; border-radius: 50%; flex: 0 0 auto; }
.avl[data-status="available"] .avl-dot { animation: avl-pulse 1.8s ease-in-out infinite; }
.avl-lbl { white-space: nowrap; }
@keyframes avl-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
`
