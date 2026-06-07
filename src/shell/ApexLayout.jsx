import { useState, useEffect, useRef } from 'react'
import { motion, useScroll, useSpring } from 'framer-motion'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight, Menu, Settings } from 'lucide-react'
import { useApexTheme, THEMES } from './ThemeContext'
import NotificationsBell from './NotificationsBell'

/*
 * ApexLayout — shell compartido. Portado de Apex Operations, limpio:
 * sin i18n (textos en español), sin multi-tenant (montado en raíz '/'),
 * sin widgets de admin. Marca = logo Apex (ApexMark) en la topbar.
 *
 * SECTIONS = única fuente de navegación (desktop + móvil). Añadir sección =
 * una entrada aquí + su <Route> en App.jsx.
 */
// Navegación deliberadamente simple para closers poco técnicos: 5 destinos.
// Las sub-vistas (Guion dentro de Llamadas; Embudo dentro de Métricas) se
// cambian con un control segmentado. Ajustes vive en el engranaje de la topbar.
const SECTIONS = [
  { key: 'home',     label: 'Hoy',      path: '/' },
  { key: 'clientes', label: 'Ventas',   path: '/clientes' },
  { key: 'llamadas', label: 'Llamadas', path: '/llamadas' },
  { key: 'pipeline', label: 'Leads (CRM)', path: '/pipeline' },
  { key: 'perfil',   label: 'Perfil',   path: '/perfil' },
]

export default function ApexLayout() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 50, mass: 0.4 })
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const location = useLocation()
  const navigate = useNavigate()
  const activeKey = sectionKeyForPath(SECTIONS, location.pathname)

  return (
    <>
      <motion.div className="apex-scroll-progress" style={{ scaleX }} aria-hidden="true" />

      <header className="apex-topbar" data-scrolled={scrolled || undefined}>
        <div className="apex-topbar-inner">
          <MobileSectionMenu sections={SECTIONS} active={activeKey} pathname={location.pathname} />
          <div className="apex-brand">
            <ThemePicker />
          </div>
          <SectionNav sections={SECTIONS} active={activeKey} pathname={location.pathname} />
          <div className="apex-topbar-end" aria-hidden="true" />
          <NotificationsBell />
          <button
            type="button"
            className="apex-gear"
            data-active={location.pathname.startsWith('/ajustes') || undefined}
            onClick={() => navigate('/ajustes')}
            aria-label="Ajustes"
            title="Ajustes"
          >
            <Settings size={17} strokeWidth={1.6} />
          </button>
        </div>
      </header>

      <main className="apex-main">
        <Outlet />
        <div className="apex-bottom">
          <hr className="apex-hairline" />
          <footer className="apex-footer">
            <span className="apex-mono" />
            <span className="apex-mono">v0.1.0 · Fase 0</span>
          </footer>
        </div>
      </main>

      <style>{LAYOUT_CSS}</style>
    </>
  )
}

function sectionKeyForPath(sections, pathname) {
  // Sub-vistas que viven bajo otra sección.
  if (pathname.startsWith('/scripts') || pathname.startsWith('/calendario')) return 'llamadas'
  // Métricas (evolución/embudo) viven ahora bajo el Perfil.
  if (pathname.startsWith('/perfil') || pathname.startsWith('/reports') || pathname.startsWith('/finanzas')) return 'perfil'
  if (pathname.startsWith('/ajustes')) return '' // engranaje, sin tab activa
  const sorted = [...sections].sort((a, b) => b.path.length - a.path.length)
  const match = sorted.find(s => pathname === s.path || pathname.startsWith(s.path + '/'))
  return match?.key ?? 'home'
}

function SectionNav({ sections, active }) {
  const navigate = useNavigate()
  return (
    <nav className="apex-nav" aria-label="Secciones">
      {sections.map(s => {
        const isActive = s.key === active
        return (
          <div key={s.key} className="apex-nav-item">
            <button
              type="button"
              className="apex-nav-tab"
              data-active={isActive || undefined}
              onClick={() => navigate(s.path)}
            >
              <span className="apex-nav-tab-label">{s.label}</span>
              {isActive && (
                <motion.span
                  layoutId="apex-nav-underline"
                  className="apex-nav-underline"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  aria-hidden="true"
                />
              )}
            </button>
          </div>
        )
      })}
    </nav>
  )
}

function MobileSectionMenu({ sections, active, pathname }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  const currentLabel = sections.find(s => s.key === active)?.label || 'Home'

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="apex-mobile-nav">
      <button
        type="button"
        className="apex-mobile-burger"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Cerrar navegación' : 'Abrir navegación'}
        aria-expanded={open}
        data-open={open || undefined}
      >
        <Menu size={18} strokeWidth={1.6} />
      </button>
      <span className="apex-mobile-section-name">{currentLabel}</span>
      {open && (
        <div
          className="apex-hover-panel apex-mobile-nav-panel"
          data-align="left"
          style={{ left: 0, top: 'calc(100% + 8px)', minWidth: 220 }}
        >
          <div className="apex-hover-header apex-label">Secciones</div>
          {sections.map(s => {
            const isActive = s.key === active && (pathname === s.path || pathname.startsWith(s.path + '/'))
            return (
              <button
                key={s.key}
                type="button"
                className="apex-hover-item"
                data-leaf
                data-selected={isActive || undefined}
                onClick={() => { navigate(s.path); setOpen(false) }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, display: 'inline-flex' }}>
                    {isActive ? <Check size={12} strokeWidth={2} /> : null}
                  </span>
                  {s.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Marca APEX — chevron facetado, gradiente con tokens del tema (se adapta a los 4 temas).
function ApexMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="apex-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="var(--apex-plat-hi)" />
          <stop offset="55%"  stopColor="var(--apex-plat-mid)" />
          <stop offset="100%" stopColor="var(--apex-plat-shad)" />
        </linearGradient>
      </defs>
      <path d="M12 3 L21 21 L12 16 L3 21 Z" fill="url(#apex-mark-grad)" />
    </svg>
  )
}

function ThemePicker() {
  const { theme, setTheme } = useApexTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="apex-theme-picker">
      <button
        type="button"
        className="apex-theme-trigger"
        onClick={() => setOpen(o => !o)}
        aria-label="Cambiar tema"
        data-open={open || undefined}
      >
        <ApexMark />
      </button>
      {open && (
        <div className="apex-hover-panel apex-theme-panel">
          <div className="apex-hover-header apex-label">Tema</div>
          {THEMES.map(opt => (
            <button
              key={opt.key}
              type="button"
              className="apex-hover-item"
              data-leaf
              data-selected={theme === opt.key || undefined}
              onClick={() => { setTheme(opt.key); setOpen(false) }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, display: 'inline-flex' }}>
                  {theme === opt.key ? <Check size={12} strokeWidth={2} /> : null}
                </span>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const LAYOUT_CSS = `
.apex-scroll-progress {
  position: fixed; top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, #4A5260, #9AA3B2, #FAFBFE);
  transform-origin: 0% 50%;
  z-index: 800;
}
.apex-topbar {
  position: sticky; top: 0; z-index: 1500;
  padding: 14px 0;
  padding-top: calc(14px + env(safe-area-inset-top, 0px));
  background: transparent;
  transition: background 0.25s var(--apex-ease-editorial),
              backdrop-filter 0.25s var(--apex-ease-editorial),
              border-color 0.25s var(--apex-ease-editorial);
  border-bottom: 1px solid transparent;
}
.apex-topbar::before {
  content: '';
  position: absolute; left: 0; right: 0; top: 0;
  height: env(safe-area-inset-top, 0px);
  background: var(--apex-bg-deep);
  pointer-events: none; z-index: -1;
}
.apex-topbar[data-scrolled] {
  background: var(--apex-trigger-bg);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-bottom-color: var(--apex-border);
}
.apex-topbar-inner {
  max-width: 1400px; margin: 0 auto;
  padding: 0 32px;
  display: flex; align-items: center; gap: 32px;
}
.apex-brand { display: inline-flex; align-items: center; }
.apex-topbar-end { flex: 1; }
.apex-gear { background: transparent; border: 0; padding: 6px; color: var(--apex-plat-low); cursor: pointer; display: inline-flex; align-items: center; transition: color 0.18s var(--apex-ease-editorial); }
.apex-gear:hover, .apex-gear[data-active] { color: var(--apex-plat-hi); }

.apex-theme-picker { position: relative; display: inline-flex; align-items: center; }
.apex-theme-trigger {
  background: transparent; border: 0; padding: 6px; margin: -6px;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 0; transition: opacity 0.2s var(--apex-ease-editorial);
}
.apex-theme-trigger:hover { opacity: 0.78; }
.apex-theme-trigger[data-open] { opacity: 0.78; }
.apex-theme-picker .apex-hover-panel { left: 0; top: calc(100% + 8px); min-width: 170px; }

.apex-nav {
  display: inline-flex; align-items: center; gap: 4px;
  margin-left: 12px; padding-left: 18px;
  border-left: 1px solid var(--apex-alpha-3);
}
.apex-nav-item { position: relative; display: inline-flex; align-items: center; }
.apex-nav-tab {
  position: relative; background: transparent; border: 0; border-radius: 0;
  padding: 10px 14px; cursor: pointer;
  color: var(--apex-plat-low);
  font-family: var(--apex-font); font-weight: 400; font-size: 13px; letter-spacing: 0;
  display: inline-flex; align-items: center; gap: 6px;
  transition: color 0.2s var(--apex-ease-editorial);
}
.apex-nav-tab:hover { color: var(--apex-plat-mid); }
.apex-nav-tab[data-active] { color: var(--apex-plat-hi); }
.apex-nav-tab-label { position: relative; z-index: 1; }
.apex-nav-underline {
  position: absolute; left: 14px; right: 14px; bottom: -1px; height: 1px;
  background: linear-gradient(90deg, transparent, var(--apex-plat-low) 20%, var(--apex-plat-hi) 50%, var(--apex-plat-low) 80%, transparent);
}

.apex-mobile-nav { display: none; position: relative; align-items: center; gap: 10px; }
.apex-mobile-burger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  background: var(--apex-trigger-bg); border: 1px solid var(--apex-border); border-radius: 0;
  color: var(--apex-plat-mid); cursor: pointer;
  box-shadow: inset 0 1px 0 var(--apex-inset-top), inset 0 -1px 0 var(--apex-inset-bot);
  transition: border-color 0.2s var(--apex-ease-editorial),
              background 0.2s var(--apex-ease-editorial),
              color 0.2s var(--apex-ease-editorial);
}
.apex-mobile-burger:hover, .apex-mobile-burger[data-open] {
  background: var(--apex-trigger-bg-h); border-color: var(--apex-border-strong); color: var(--apex-plat-hi);
}
.apex-mobile-section-name {
  font-family: var(--apex-font); font-weight: 500; font-size: 14px;
  letter-spacing: -0.01em; color: var(--apex-plat-hi);
}

.apex-main {
  position: relative; z-index: 10;
  max-width: 1400px; margin: 0 auto;
  padding: 0 32px 20px;
  display: flex; flex-direction: column; gap: 28px;
}
.apex-bottom { display: flex; flex-direction: column; gap: 10px; }
.apex-section { display: flex; flex-direction: column; gap: 16px; }
.apex-grid-2 {
  display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 24px;
}
@media (max-width: 1024px) { .apex-grid-2 { grid-template-columns: 1fr; } }
@media (max-width: 720px) {
  .apex-nav { display: none; }
  .apex-mobile-nav { display: inline-flex; }
  .apex-brand { margin-left: auto; }
  .apex-topbar-end { display: none; }
  .apex-topbar-inner { gap: 12px; }
  .apex-theme-picker .apex-hover-panel { left: auto; right: 0; }
  .apex-topbar { padding-top: calc(14px + env(safe-area-inset-top, 0px) + 4px); }
}
@media (max-width: 640px) {
  .apex-topbar-inner { padding: 0 16px; }
  .apex-main { padding: 0 16px 16px; gap: 20px; }
}
.apex-footer {
  display: flex; justify-content: space-between; padding: 0;
  color: var(--apex-plat-shad); font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase;
}
`
