import { useState, useEffect } from 'react'
// Anillo de progreso circular (gauge). Recibe value 0–1 y
// pinta el arco con el color de acento del tema (verde en Apex Neón). Se usa en
// las "tasas" de Finanzas; el contenedor `.ring-row` solo es visible en neón.
const easeOut = (p) => 1 - Math.pow(1 - p, 3)

export default function ProgressRing({ value = 0, label, sub, size = 104, stroke = 8, card = true, duration = 950 }) {
  const target = Math.max(0, Math.min(1, Number(value) || 0))
  const [pct, setPct] = useState(0)
  useEffect(() => {
    let raf, t0
    const step = (t) => { if (!t0) t0 = t; const k = Math.min(1, (t - t0) / duration); setPct(target * easeOut(k)); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    const safety = setTimeout(() => setPct(target), duration + 200)
    return () => { cancelAnimationFrame(raf); clearTimeout(safety) }
  }, [target, duration])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - pct)
  const center = size / 2
  return (
    <div className={card ? 'apex-card ring-card' : 'ring-card ring-card--bare'}>
      <div className="ring-wrap" style={{ width: size, height: size }}>
        <svg className="ring-svg" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
          <circle className="ring-track" cx={center} cy={center} r={r} fill="none" strokeWidth={stroke} />
          <circle
            className="ring-arc" cx={center} cy={center} r={r} fill="none" strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
            transform={`rotate(-90 ${center} ${center})`}
          />
          <text className="ring-text" x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{Math.round(pct * 100)}%</text>
        </svg>
      </div>
      {label && <span className="ring-label">{label}</span>}
      {sub && <span className="ring-sub">{sub}</span>}
    </div>
  )
}
