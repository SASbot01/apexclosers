import { useState, useEffect } from 'react'

// Número que cuenta desde 0 hasta `value` al montar (sensación de "calculando").
// Red de seguridad por setTimeout: si rAF está throttled (headless), igual fija
// el valor final.
const easeOut = (p) => 1 - Math.pow(1 - p, 3)

export default function CountUp({ value = 0, decimals = 0, prefix = '', suffix = '', duration = 1000 }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf, t0
    const step = (t) => {
      if (!t0) t0 = t
      const p = Math.min(1, (t - t0) / duration)
      setV(value * easeOut(p))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const safety = setTimeout(() => setV(value), duration + 150)
    return () => { cancelAnimationFrame(raf); clearTimeout(safety) }
  }, [value, duration])
  return <>{prefix}{v.toFixed(decimals)}{suffix}</>
}
