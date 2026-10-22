import { randomInt } from 'node:crypto'

/** Rutas del sistema y palabras que nadie puede tomar como alias */
export const RESERVED_ALIASES = new Set([
  'admin', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'cdn', 'contact', 'contacto', 'dashboard',
  'docs', 'forgot', 'help', 'ayuda', 'healthz', 'home', 'inicio', 'lang', 'legal', 'login', 'logout',
  'mail', 'panel', 'precios', 'pricing', 'privacy', 'privacidad', 'qr', 'register', 'registro', 'reset',
  'root', 'settings', 'signup', 'source', 'static', 'stats', 'status', 'support', 'soporte', 'terms',
  'terminos', 'tubio', 'verify', 'www', 'robots.txt', 'favicon.ico', 'sitemap.xml', 'manifest.json',
  'security.txt', '.well-known', 'acceptable-use', 'uso-aceptable',
])

export const ALIAS_MIN = 3
export const ALIAS_MAX = 64
const ALIAS_RE = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/

/** "Mi Página Ñ" → "mi-pagina-n" */
export function normalizeAlias(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
}

/** Devuelve la clave de error de i18n o null si el alias sirve */
export function aliasError(alias: string): string | null {
  if (alias.length < ALIAS_MIN) return 'err.alias_short'
  if (alias.length > ALIAS_MAX) return 'err.alias_long'
  if (!ALIAS_RE.test(alias)) return 'err.alias_chars'
  if (RESERVED_ALIASES.has(alias)) return 'err.alias_reserved'
  return null
}

// sin 0/o, 1/l/i para que se pueda dictar
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function randomAlias(len = 7): string {
  let s = ''
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)]
  return s
}
