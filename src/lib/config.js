// Config de cliente. En Fase 0 (dogfooding) el usuario es único; en Fase 1
// lo dará el login. Sobreescribible por variables VITE_* (.env).
export const USER_ID = import.meta.env.VITE_USER_ID || '00000000-0000-0000-0000-000000000001'
export const API_BASE = import.meta.env.VITE_API_BASE || ''
