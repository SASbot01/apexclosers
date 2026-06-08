import { useState, useEffect } from 'react'

// Valor numérico que cuenta desde 0 al entrar, formateado por tipo (money/int/pct).
// Red de seguridad por setTimeout para que fije el valor final aunque rAF esté
// throttled (headless/screenshots).
const easeOut = (p) => 1 - Math.pow(1 - p, 3)
const money = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0)
const intf = (v) => new Intl.NumberFormat('es-ES').format(Math.round(v || 0))

export default function AnimatedValue({ value = 0, fmt = 'int', duration = 950 }) {
  const target = Number(value) || 0
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf, t0
    const step = (t) => { if (!t0) t0 = t; const k = Math.min(1, (t - t0) / duration); setV(target * easeOut(k)); if (k < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    const safety = setTimeout(() => setV(target), duration + 200)
    return () => { cancelAnimationFrame(raf); clearTimeout(safety) }
  }, [target, duration])
  return <>{fmt === 'money' ? money(v) : fmt === 'pct' ? `${Math.round(v * 100)}%` : intf(v)}</>
}
