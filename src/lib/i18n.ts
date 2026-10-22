import es from '../locales/es-MX.json' with { type: 'json' }
import en from '../locales/en.json' with { type: 'json' }

export const LOCALES = ['es-MX', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es-MX'

type Dict = Record<string, string>
const DICTS: Record<Locale, Dict> = { 'es-MX': es as Dict, en: en as Dict }

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}

/** Elige idioma del encabezado Accept-Language (es*, en*); por defecto es-MX. */
export function fromAcceptLanguage(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE
  const langs = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) || 0 : 1 }
    })
    .sort((a, b) => b.q - a.q)
  for (const { tag } of langs) {
    if (tag.startsWith('es')) return 'es-MX'
    if (tag.startsWith('en')) return 'en'
  }
  return DEFAULT_LOCALE
}

export type T = (key: string, vars?: Record<string, string | number>) => string

export function translator(locale: Locale): T {
  const dict = DICTS[locale]
  const fallback = DICTS[DEFAULT_LOCALE]
  return (key, vars) => {
    let s = dict[key] ?? fallback[key] ?? key
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
    return s
  }
}

export function dictionary(locale: Locale): Dict {
  return DICTS[locale]
}

export function formatNumber(locale: Locale, n: number): string {
  return new Intl.NumberFormat(locale).format(n)
}

export function formatDateTime(locale: Locale, ts: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(ts)
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(ts)
  }
}
