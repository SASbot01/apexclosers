import HoverMenu from './HoverMenu'
import { TIME_RANGES } from '../lib/filters'

/*
 * FilterBar — barra de filtros reutilizable. El filtro de Periodo (tiempo) es
 * común a todas las secciones; cada página puede añadir filtros extra como
 * children (a la izquierda del periodo).
 */
export function TimeFilter({ value, onChange }) {
  const label = TIME_RANGES.find(r => r.key === value)?.label || 'Periodo'
  return (
    <HoverMenu label="Periodo" value={label}>
      {TIME_RANGES.map(r => (
        <HoverMenu.Item key={r.key} selected={r.key === value} onSelect={() => onChange(r.key)}>{r.label}</HoverMenu.Item>
      ))}
    </HoverMenu>
  )
}

// Filtro genérico de una dimensión (enum). value = clave seleccionada o 'all'.
export function SelectFilter({ label, value, options, onChange, allLabel = 'Todos' }) {
  const current = options.find(o => o.key === value)
  return (
    <HoverMenu label={label} value={current?.label || allLabel}>
      <HoverMenu.Item selected={!value || value === 'all'} onSelect={() => onChange('all')}>{allLabel}</HoverMenu.Item>
      {options.map(o => (
        <HoverMenu.Item key={o.key} selected={o.key === value} onSelect={() => onChange(o.key)}>{o.label}</HoverMenu.Item>
      ))}
    </HoverMenu>
  )
}

export default function FilterBar({ time, onTime, children }) {
  return (
    <div className="apex-filter-bar">
      {children}
      {time !== undefined && <TimeFilter value={time} onChange={onTime} />}
    </div>
  )
}
