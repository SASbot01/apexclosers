import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// Sistema de temas vía [data-theme]. 3 temas: Apex Neón (principal · verde/negro),
// Apex Dark (el oscuro original) y Apex Light.
const STORAGE_KEY = 'apex_closer_theme'
const DEFAULT_THEME = 'neon'
export const THEMES = [
  { key: 'neon',  label: 'Apex Neón' },
  { key: 'dark',  label: 'Apex Dark' },
  { key: 'light', label: 'Apex Light' },
]

const ApexThemeContext = createContext({ theme: DEFAULT_THEME, setTheme: () => {} })

export function ApexThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && THEMES.some(t => t.key === saved)) return saved
    } catch { /* off */ }
    return DEFAULT_THEME
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* off */ }
  }, [theme])

  const setTheme = useCallback((next) => {
    if (THEMES.some(t => t.key === next)) setThemeState(next)
  }, [])

  return (
    <ApexThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ApexThemeContext.Provider>
  )
}

export function useApexTheme() {
  return useContext(ApexThemeContext)
}
