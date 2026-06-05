// Supabase admin (server-side). Service key → bypassa RLS para los endpoints
// del servidor. El aislamiento por usuario se aplica explícitamente con
// .eq('user_id', userId) en cada query (ver docs/ai/07-SAFETY-AND-ISOLATION).
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!url || !serviceKey) {
  console.warn('[supabase] Falta SUPABASE_URL o SUPABASE_SERVICE_KEY')
}

export const supabase = createClient(url || '', serviceKey || '', {
  auth: { persistSession: false },
})

export function supabaseReady() {
  return Boolean(url && serviceKey)
}
