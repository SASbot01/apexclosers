// Conversión robusta a número. Acepta number o string (admite coma decimal y
// separadores de miles tipo "1.200,50"). Devuelve `fallback` si no es finito.
export function toNum(v, fallback = 0) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback
  if (v == null) return fallback
  let s = String(v).trim()
  if (!s) return fallback
  // Si hay coma y punto, asume punto = miles y coma = decimal (formato es-ES).
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  s = s.replace(/[^0-9.\-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : fallback
}
