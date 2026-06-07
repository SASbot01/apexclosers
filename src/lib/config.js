// Config de cliente. El usuario REAL lo fija el login (auth.js → setUserId con
// el id del usuario de Google). Mientras no haya sesión, se usa la cuenta demo
// (VITE_USER_ID). Las llamadas a la API leen getUserId() en cada petición, así
// que tras el login todo (perfil, ventas, amigos, métricas) va a tu cuenta.
export const API_BASE = import.meta.env.VITE_API_BASE || ''

const DEMO_USER_ID = import.meta.env.VITE_USER_ID || '00000000-0000-0000-0000-000000000001'
const UID_KEY = 'apex_closer_uid'

export function setUserId(id) {
  try { if (id) localStorage.setItem(UID_KEY, id) } catch { /* off */ }
}
export function getUserId() {
  try { return localStorage.getItem(UID_KEY) || DEMO_USER_ID } catch { return DEMO_USER_ID }
}

// Compat: valor inicial (puede ser el demo si aún no hay sesión). Los clientes
// del API deben preferir getUserId() para coger el id real tras el login.
export const USER_ID = getUserId()
