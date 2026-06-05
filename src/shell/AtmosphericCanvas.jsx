import { useMemo } from 'react'

/*
 * APEX 7-layer atmospheric canvas. (Portado verbatim de Apex Operations.)
 * Fixed full-viewport z-0 stack. Never compete with content (z-10+).
 * All gradients are platinum-translations of the Flow Platinum ramp.
 */
export default function AtmosphericCanvas() {
  const { starsA, starsB } = useMemo(() => buildStars(160), [])

  return (
    <>
      <div className="apex-atmosphere" aria-hidden="true">
        <div className="apex-atm-base" />
        <div className="apex-atm-radials" />
        <div className="apex-atm-grid" />
        <div className="apex-nebula apex-nebula--1" />
        <div className="apex-nebula apex-nebula--2" />
        <div className="apex-nebula apex-nebula--3" />
        <div className="apex-nebula apex-nebula--4" />
        <div className="apex-stars-a" style={{ boxShadow: starsA }} />
        <div className="apex-stars-b" style={{ boxShadow: starsB }} />
        <div className="apex-atm-vignette" />
      </div>
      <div className="apex-grain-layer" aria-hidden="true" />
      <style>{ATM_CSS}</style>
    </>
  )
}

function buildStars(total) {
  const rand = (i, seed) => {
    const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  const halfA = []
  const halfB = []
  for (let i = 0; i < total; i++) {
    const x = (rand(i, 1) * 100).toFixed(2)
    const y = (rand(i, 2) * 100).toFixed(2)
    const size = rand(i, 3) > 0.85 ? 1.5 : 1
    const bright = rand(i, 4) > 0.85
    const color = bright ? 'rgba(255,255,255,0.85)' : 'rgba(213,218,227,0.45)'
    const shadow = `${x}vw ${y}vh 0 ${size === 1.5 ? '0.5px' : '0'} ${color}`
    if (i % 2 === 0) halfA.push(shadow); else halfB.push(shadow)
  }
  return { starsA: halfA.join(', '), starsB: halfB.join(', ') }
}

const ATM_CSS = `
.apex-atmosphere {
  position: fixed; inset: 0; z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.apex-atm-base { position: absolute; inset: 0; background: #06070A; }
.apex-atm-radials {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 120% 80% at 30% 20%, rgba(213,218,227,0.06), transparent 60%),
    radial-gradient(ellipse 100% 60% at 70% 80%, rgba(74,82,96,0.18),    transparent 70%);
}
.apex-atm-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(154,163,178,0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(154,163,178,0.045) 1px, transparent 1px);
  background-size: 80px 80px;
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, #000 30%, transparent 80%);
          mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, #000 30%, transparent 80%);
  opacity: 0.6;
}
.apex-nebula {
  position: absolute;
  border-radius: 50%;
  filter: blur(180px);
  will-change: transform, opacity;
  animation: apex-nebula-pulse 16s var(--apex-ease-ambient, cubic-bezier(0.16,1,0.3,1)) infinite;
}
.apex-nebula--1 {
  top: 5%; left: 12%; width: 700px; height: 800px;
  background: radial-gradient(circle, rgba(250,251,254,0.18), rgba(74,82,96,0.18) 60%, transparent 80%);
  animation-duration: 12s;
}
.apex-nebula--2 {
  bottom: 6%; right: 8%; width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(154,163,178,0.14), rgba(30,35,44,0.18) 55%, transparent 80%);
  animation-duration: 14s; animation-delay: -3s;
}
.apex-nebula--3 {
  top: 12%; right: 14%; width: 500px; height: 500px;
  background: radial-gradient(circle, rgba(213,218,227,0.18), transparent 70%);
  animation-duration: 16s; animation-delay: -6s;
}
.apex-nebula--4 {
  bottom: 18%; left: 6%; width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(154,163,178,0.14), transparent 70%);
  animation-duration: 20s; animation-delay: -8s;
}
.apex-stars-a, .apex-stars-b {
  position: absolute; top: 0; left: 0;
  width: 1px; height: 1px; background: transparent; border-radius: 50%;
}
.apex-stars-a { animation: apex-twinkle-a 4s var(--apex-ease-ambient, cubic-bezier(0.16,1,0.3,1)) infinite; }
.apex-stars-b { animation: apex-twinkle-b 6s var(--apex-ease-ambient, cubic-bezier(0.16,1,0.3,1)) infinite; }
.apex-atm-vignette {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, transparent 30%, rgba(6,7,10,0.7) 85%, #06070A 100%);
}
.apex-grain-layer {
  position: fixed; inset: 0;
  z-index: 9998;
  pointer-events: none;
  opacity: 0.03;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  background-size: 200px 200px;
  animation: apex-grain 0.5s steps(2) infinite;
}
/* Animaciones base (definidas también en el tema; fallback local por si acaso). */
@keyframes apex-nebula-pulse { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
@keyframes apex-twinkle-a { 0%,100%{opacity:.5} 50%{opacity:1} }
@keyframes apex-twinkle-b { 0%,100%{opacity:1} 50%{opacity:.5} }
@keyframes apex-grain { 0%{transform:translate(0,0)} 100%{transform:translate(-4px,3px)} }
`
