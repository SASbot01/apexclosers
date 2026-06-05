// Objetivos mensuales base (demo). En producción vendrían de Ajustes/BD.
// Home los escala al periodo del filtro (objetivo = base × días/30).
export const MONTHLY_GOALS = [
  { key: 'calls',  label: 'Llamadas', base: 12,   fmt: 'int' },
  { key: 'closes', label: 'Cierres',  base: 4,    fmt: 'int' },
  { key: 'cash',   label: 'Cash',     base: 6000, fmt: 'money' },
]
