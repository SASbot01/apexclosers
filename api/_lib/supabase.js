// Supabase admin (server-side). Service key → bypassa RLS para los endpoints
// del servidor. El aislamiento por usuario se aplica explícitamente con
// .eq('user_id', userId) en cada query (ver docs/ai/07-SAFETY-AND-ISOLATION).
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const configured = Boolean(url && serviceKey && /^https?:\/\//i.test(url))

if (!configured) {
  console.warn('[supabase] SUPABASE_URL/SERVICE_KEY ausente o inválida — el cliente no se construye hasta que se configure')
}

// Construcción diferida: NO crear el cliente al importar el módulo (createClient
// lanza si la URL es inválida o falta). Así importar las rutas api/* nunca
// crashea sin credenciales; el error sale solo si se usa supabase sin configurar.
let _client = null
function client() {
  if (!configured) throw new Error('supabase_not_configured')
  if (!_client) _client = createClient(url, serviceKey, { auth: { persistSession: false } })
  return _client
}

// Proxy con la misma forma que el cliente real: difiere client() al primer uso.
export const supabase = new Proxy({}, {
  get(_t, prop) {
    const c = client()
    const v = c[prop]
    return typeof v === 'function' ? v.bind(c) : v
  },
})

export function supabaseReady() {
  return configured
}
