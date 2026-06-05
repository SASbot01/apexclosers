import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// Réplica del sistema de temas de Apex Operations (4 temas vía [data-theme]).
const STORAGE_KEY = 'apex_closer_theme'
const DEFAULT_THEME = 'dark'
export const THEMES = [
  { key: 'dark',     label: 'Apex Dark' },
  { key: 'light',    label: 'Apex Light' },
  { key: 'obsidian', label: 'Obsidian' },
  { key: 'pizarra',  label: 'Pizarra' },
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
