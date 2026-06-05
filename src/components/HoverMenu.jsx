import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'

/*
 * HoverMenu — dropdown en cascada de APEX. (Portado verbatim de Apex Operations.)
 * Estilos en ApexTheme.css (.apex-hover-*). Click para abrir; hover en sub-items.
 */
export default function HoverMenu({ label, value, children, align = 'right', minWidth = 220 }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="apex-hover-trigger"
        data-open={open || undefined}
        type="button"
      >
        <span className="apex-mono apex-hover-trigger-label">{label}</span>
        <span className="apex-hover-trigger-value">{value}</span>
        <ChevronDown size={12} strokeWidth={1.5} style={{ opacity: 0.7 }} />
      </button>
      {open && (
        <div
          className="apex-hover-panel"
          data-align={align}
          style={{ [align === 'right' ? 'right' : 'left']: 0, minWidth }}
          onClick={(e) => { if (e.target.closest('[data-leaf]')) setOpen(false) }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function Item({ children, selected, onSelect }) {
  return (
    <button type="button" className="apex-hover-item" data-leaf data-selected={selected || undefined} onClick={() => onSelect?.()}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 12, display: 'inline-flex' }}>{selected ? <Check size={12} strokeWidth={2} /> : null}</span>
        {children}
      </span>
    </button>
  )
}

function Sub({ label, children, minWidth = 220 }) {
  const [hover, setHover] = useState(false)
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" className="apex-hover-item" data-has-sub>
        <span>{label}</span>
        <ChevronRight size={12} strokeWidth={1.5} style={{ opacity: 0.65 }} />
      </button>
      {hover && (
        <div className="apex-hover-panel apex-hover-panel--sub" style={{ top: -1, minWidth }}>{children}</div>
      )}
    </div>
  )
}

function Separator() { return <div className="apex-hover-sep" /> }
function Header({ children }) { return <div className="apex-hover-header apex-label">{children}</div> }

HoverMenu.Item = Item
HoverMenu.Sub = Sub
HoverMenu.Separator = Separator
HoverMenu.Header = Header
