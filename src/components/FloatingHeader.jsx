import { useEffect, useState } from 'react'

/*
 * FloatingHeader — barra de identidad de sección (estilo Palantir).
 * Adaptado de Apex Operations (sin i18n). Sticky bajo la topbar.
 */
export default function FloatingHeader({ title = 'Home', eyebrow = 'SECCIÓN', titleExtra = null, actions = null }) {
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 80)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="apex-floating-header" data-stuck={stuck || undefined}>
      <div className="apex-floating-header-inner">
        <div className="apex-floating-header-left">
          <span className="apex-floating-tick" aria-hidden="true" />
          <div className="apex-floating-header-meta">
            {eyebrow && <span className="apex-eyebrow">{eyebrow}</span>}
            <h1 className="apex-floating-header-title">{title}</h1>
          </div>
          {titleExtra && <div className="apex-floating-header-extra">{titleExtra}</div>}
        </div>
        <div className="apex-floating-header-right">{actions}</div>
      </div>
      <style>{FLOATING_CSS}</style>
    </div>
  )
}

const FLOATING_CSS = `
.apex-floating-header {
  position: sticky;
  top: var(--apex-topbar-h, 64px);
  z-index: 90;
  border: 1px solid var(--apex-border);
  background: var(--apex-card-bg);
  box-shadow:
    inset 0 1px 0 var(--apex-inset-top),
    inset 0 -1px 0 var(--apex-inset-bot),
    0 1px 0 var(--apex-anchor);
  transition: background 0.4s var(--apex-ease-editorial),
              border-color 0.4s var(--apex-ease-editorial);
}
.apex-floating-header[data-stuck] { border-color: var(--apex-border-strong); }
.apex-floating-header-inner {
  display: flex; align-items: center; justify-content: space-between;
  gap: 24px; padding: 18px 24px;
}
.apex-floating-header-left { display: flex; align-items: center; gap: 14px; }
.apex-floating-header-extra {
  display: inline-flex; align-items: center;
  margin-left: 12px; padding-left: 16px;
  border-left: 1px solid var(--apex-alpha-3);
}
.apex-floating-tick {
  width: 1px; height: 28px;
  background: linear-gradient(180deg, transparent, var(--apex-plat-mid), transparent);
}
.apex-floating-header-meta { display: flex; flex-direction: column; gap: 2px; }
.apex-floating-header-title {
  font-family: var(--apex-font);
  font-weight: 400; font-size: 24px; line-height: 1.1;
  letter-spacing: -0.015em; color: var(--apex-plat-hi); margin: 0;
}
.apex-floating-header-right { display: flex; align-items: center; gap: 8px; min-height: 28px; }
@media (max-width: 640px) {
  .apex-floating-header { margin: 0; top: var(--apex-topbar-h, 64px); }
  .apex-floating-header-inner { padding: 14px 18px; }
  .apex-floating-header-title { font-size: 18px; }
}
`
