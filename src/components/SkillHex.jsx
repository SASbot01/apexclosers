// SkillHex — hexagrama de habilidades del closer (6 ejes). Es la visualización
// de habilidades: polígono de valores sobre un hexágono neón. ESTÁTICO (sin
// animación, a petición). Color por tokens de acento (verde neón en Apex Neón).
const S = 300
const C = S / 2

export default function SkillHex({ skills = [] }) {
  const n = skills.length || 6
  const R = S * 0.33
  const ang = (i) => (-Math.PI / 2) + (i * 2 * Math.PI) / n
  const pt = (i, r) => [C + Math.cos(ang(i)) * R * r, C + Math.sin(ang(i)) * R * r]
  const ring = (f) => skills.map((_, i) => pt(i, f).map(v => v.toFixed(1)).join(',')).join(' ')
  const poly = skills.map((s, i) => pt(i, Math.max(0.08, s.value)).map(v => v.toFixed(1)).join(',')).join(' ')
  const nodes = skills.map((s, i) => pt(i, Math.max(0.08, s.value)))
  const labels = skills.map((s, i) => {
    const [x, y] = pt(i, 1.2)
    const anchor = x < C - 8 ? 'end' : x > C + 8 ? 'start' : 'middle'
    return { x, y, anchor, label: s.label, value: Math.round(s.value * 100) }
  })

  return (
    <div className="skillhex">
      <svg viewBox={`0 0 ${S} ${S}`} className="skillhex-svg">
        <polygon className="skillhex-ring skillhex-ring--out" points={ring(1)} />
        <polygon className="skillhex-ring" points={ring(0.6)} />
        {skills.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} className="skillhex-spoke" x1={C} y1={C} x2={x.toFixed(1)} y2={y.toFixed(1)} /> })}
        <polygon className="skillhex-poly" points={poly} />
        {nodes.map(([x, y], i) => (
          <circle key={i} className="skillhex-node" cx={x.toFixed(1)} cy={y.toFixed(1)} r={3.6} />
        ))}
        <circle className="skillhex-core" cx={C} cy={C} r={4} />
        {labels.map((l, i) => (
          <text key={i} className="skillhex-label" x={l.x.toFixed(1)} y={l.y.toFixed(1)} textAnchor={l.anchor} dominantBaseline="middle">
            {l.label} <tspan className="skillhex-val">{l.value}%</tspan>
          </text>
        ))}
      </svg>
      <style>{HEX_CSS}</style>
    </div>
  )
}

const HEX_CSS = `
.skillhex { position: relative; width: 100%; max-width: 360px; margin: 6px auto 2px; aspect-ratio: 1; }
.skillhex-svg { width: 100%; height: 100%; display: block; overflow: visible; }
.skillhex-ring { fill: none; stroke: color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 18%, transparent); stroke-width: 1; stroke-linejoin: round; }
.skillhex-ring--out { stroke: color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 32%, transparent); stroke-width: 1.4; }
.skillhex-spoke { stroke: color-mix(in srgb, var(--apex-accent, var(--apex-plat-mid)) 12%, transparent); stroke-width: 1; }
.skillhex-poly {
  fill: color-mix(in srgb, var(--apex-accent, var(--apex-plat-hi)) 18%, transparent);
  stroke: var(--apex-accent, var(--apex-plat-hi)); stroke-width: 2; stroke-linejoin: round;
  filter: drop-shadow(0 0 7px color-mix(in srgb, var(--apex-accent, transparent) 65%, transparent));
}
.skillhex-node { fill: var(--apex-accent, var(--apex-plat-hi)); filter: drop-shadow(0 0 5px var(--apex-accent, transparent)); }
.skillhex-core { fill: var(--apex-accent, var(--apex-plat-hi)); filter: drop-shadow(0 0 10px var(--apex-accent, transparent)); }
.skillhex-label { fill: var(--apex-plat-mid); font-family: var(--apex-font); font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; }
.skillhex-val { fill: var(--apex-accent, var(--apex-plat-hi)); font-weight: 600; }
`
