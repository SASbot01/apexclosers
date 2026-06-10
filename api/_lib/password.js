// Hash y verificación de contraseñas con scrypt (módulo nativo de Node, sin
// dependencias). Formato almacenado: "salt:hash" (ambos hex). Para las cuentas
// de cliente (login email+contraseña). Las cuentas de closer usan Google.
import crypto from 'crypto'

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const dk = crypto.scryptSync(String(pw), salt, 64).toString('hex')
  return `${salt}:${dk}`
}

export function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, dk] = stored.split(':')
  const test = crypto.scryptSync(String(pw), salt, 64).toString('hex')
  const a = Buffer.from(dk, 'hex'), b = Buffer.from(test, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
