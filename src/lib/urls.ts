import { isIP } from 'node:net'
import type { DB } from '../db/index.ts'

export const WEB_SCHEMES = ['http:', 'https:']
/** Botones de páginas bio también pueden abrir correo, teléfono o SMS */
export const BUTTON_SCHEMES = [...WEB_SCHEMES, 'mailto:', 'tel:', 'sms:']

export type UrlCheck = { ok: true; url: string; host: string } | { ok: false; error: string }

/**
 * Normaliza una URL destino escrita por el usuario. Sin esquema se asume https://.
 * Rechaza esquemas peligrosos (javascript:, data:, file:…), credenciales en la URL y hosts internos.
 */
export function checkUrl(input: string, schemes: string[] = WEB_SCHEMES): UrlCheck {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'err.required' }
  if (raw.length > 2048) return { ok: false, error: 'err.url_long' }
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw)
  let u: URL
  try {
    u = new URL(hasScheme ? raw : `https://${raw}`)
  } catch {
    return { ok: false, error: 'err.url' }
  }
  if (!schemes.includes(u.protocol)) return { ok: false, error: 'err.url_scheme' }
  if (u.protocol === 'mailto:' || u.protocol === 'tel:' || u.protocol === 'sms:') {
    if (u.pathname.length < 3) return { ok: false, error: 'err.url' }
    return { ok: true, url: u.href, host: '' }
  }
  if (u.username || u.password) return { ok: false, error: 'err.url' }
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, error: 'err.url_host' }
  }
  const bare = host.replace(/^\[|\]$/g, '')
  if (isIP(bare) ? isPrivateIp(bare) : !host.includes('.')) return { ok: false, error: 'err.url_host' }
  return { ok: true, url: u.href, host }
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  const v = ip.toLowerCase()
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:')
}

/** ¿El host o alguno de sus dominios padre está bloqueado por el admin? */
export function isBlockedHost(db: DB, host: string): boolean {
  if (!host) return false
  const parts = host.split('.')
  const candidates: string[] = []
  for (let i = 0; i < parts.length - 1; i++) candidates.push(parts.slice(i).join('.'))
  if (candidates.length === 0) return false
  const q = `SELECT 1 FROM blocked_hosts WHERE host IN (${candidates.map(() => '?').join(',')}) LIMIT 1`
  return !!db.prepare(q).get(...candidates)
}

/** checkUrl + lista de bloqueo */
export function checkTarget(db: DB, input: string, schemes: string[] = WEB_SCHEMES): UrlCheck {
  const r = checkUrl(input, schemes)
  if (r.ok && isBlockedHost(db, r.host)) return { ok: false, error: 'err.url_blocked' }
  return r
}

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>

/**
 * URL final de una redirección: añade los UTM configurados (sin pisar los que ya trae la URL)
 * y, si se pide, reenvía los parámetros de la visita.
 */
export function buildDestination(target: string, utm: Utm, forward: Record<string, unknown> | null): string {
  let u: URL
  try {
    u = new URL(target)
  } catch {
    return target
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return target
  for (const k of UTM_KEYS) {
    const v = utm[k]
    if (v && !u.searchParams.has(k)) u.searchParams.set(k, v)
  }
  if (forward) {
    for (const [k, v] of Object.entries(forward)) {
      if (k.startsWith('_') || u.searchParams.has(k)) continue
      for (const one of Array.isArray(v) ? v : [v]) if (typeof one === 'string') u.searchParams.append(k, one)
    }
  }
  return u.href
}
