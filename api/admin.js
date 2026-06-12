// /api/admin — panel de administración. SOLO cuentas account_type='admin'
// (verificado por su token de sesión). Ver todos los usuarios, aprobar/bloquear/
// eliminar accesos y asignar rol (closer/client). El software es de pago: los
// registros nuevos con Google quedan 'pending' hasta que el admin los apruebe.
import { supabase, supabaseReady } from './_lib/supabase.js'

const DEMO_SEED = '00000000-0000-0000-0000-000000000001'

async function adminFromToken(token) {
  if (!token || !supabaseReady()) return null
  const { data: sess } = await supabase.from('sessions').select('user_id, expires_at').eq('token', token).maybeSingle()
  if (!sess || (sess.expires_at && new Date(sess.expires_at) < new Date())) return null
  const { data: u } = await supabase.from('users').select('id, account_type').eq('id', sess.user_id).maybeSingle()
  return u?.account_type === 'admin' ? u : null
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  const token = req.query.token || req.body?.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const admin = await adminFromToken(token)
  if (!admin) return res.status(403).json({ error: 'forbidden' })
  const action = req.query.action || 'list-users'
  try {
    if (action === 'list-users')  return await listUsers(req, res)
    if (action === 'set-access')  return await setAccess(req, res, admin)
    if (action === 'set-type')    return await setType(req, res, admin)
    if (action === 'delete-user') return await deleteUser(req, res, admin)
    return res.status(400).json({ error: `unknown_action: ${action}` })
  } catch (e) {
    console.error('[admin]', action, e)
    return res.status(500).json({ error: e.message || 'internal_error' })
  }
}

async function listUsers(req, res) {
  const [{ data: users }, { data: profs }, { data: sales }] = await Promise.all([
    supabase.from('users').select('id, email, name, picture, account_type, access, created_at').limit(5000),
    supabase.from('profiles').select('user_id, nickname, display_name, photo_url, status').limit(5000),
    supabase.from('sales').select('owner_id, revenue, status').eq('status', 'verified').limit(20000),
  ])
  const profById = new Map((profs || []).map(p => [p.user_id, p]))
  const dealsBy = {}, revBy = {}
  for (const s of (sales || [])) { dealsBy[s.owner_id] = (dealsBy[s.owner_id] || 0) + 1; revBy[s.owner_id] = (revBy[s.owner_id] || 0) + (Number(s.revenue) || 0) }
  const rows = (users || []).filter(u => u.id !== DEMO_SEED).map(u => {
    const p = profById.get(u.id)
    return {
      id: u.id, email: u.email,
      name: p?.display_name || u.name || u.email?.split('@')[0] || '—',
      nickname: p?.nickname || null, photo_url: p?.photo_url || u.picture || null,
      account_type: u.account_type || 'closer', access: u.access || 'approved',
      availability: p?.status || 'available',
      deals: dealsBy[u.id] || 0, revenue: revBy[u.id] || 0,
      created_at: u.created_at,
    }
  }).sort((a, b) => (a.access === 'pending' ? -1 : 0) - (b.access === 'pending' ? -1 : 0) || new Date(b.created_at) - new Date(a.created_at))
  return res.status(200).json({ users: rows })
}

async function setAccess(req, res, admin) {
  const { userId, access } = req.body || {}
  if (!userId || !['pending', 'approved', 'blocked'].includes(access)) return res.status(400).json({ error: 'userId_and_valid_access_required' })
  if (userId === admin.id) return res.status(400).json({ error: 'cannot_change_self' })
  const { error } = await supabase.from('users').update({ access }).eq('id', userId)
  if (error) throw new Error(error.message)
  return res.status(200).json({ ok: true })
}

async function setType(req, res, admin) {
  const { userId, account_type } = req.body || {}
  if (!userId || !['closer', 'client', 'admin'].includes(account_type)) return res.status(400).json({ error: 'userId_and_valid_type_required' })
  if (userId === admin.id) return res.status(400).json({ error: 'cannot_change_self' })
  const { error } = await supabase.from('users').update({ account_type }).eq('id', userId)
  if (error) throw new Error(error.message)
  return res.status(200).json({ ok: true })
}

async function deleteUser(req, res, admin) {
  const { userId } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId_required' })
  if (userId === admin.id) return res.status(400).json({ error: 'cannot_delete_self' })
  // Limpieza básica de datos del usuario antes de borrarlo.
  for (const t of ['profiles', 'metric_visibility', 'goals']) await supabase.from(t).delete().eq('user_id', userId).then(() => {}, () => {})
  await supabase.from('sessions').delete().eq('user_id', userId).then(() => {}, () => {})
  const { error } = await supabase.from('users').delete().eq('id', userId)
  if (error) throw new Error(error.message)
  return res.status(200).json({ ok: true })
}
