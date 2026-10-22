import { XMLParser } from 'fast-xml-parser'
import type { DB } from '../db/index.ts'
import { safeFetch, type SafeFetchOptions } from './safe-fetch.ts'

/** Lectura de feeds RSS/Atom y del clima, con caché en BD y refresco en segundo plano. */

export type FeedItem = { title: string; url: string; date: number | null; image: string | null }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', processEntities: true, htmlEntities: false })

const text = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (v && typeof v === 'object' && '#text' in v) return String((v as Record<string, unknown>)['#text'] ?? '')
  return ''
}
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const httpOnly = (u: string): string => (/^https?:\/\//i.test(u) ? u : '')

export function parseFeed(xml: string, max = 10): FeedItem[] {
  const doc = parser.parse(xml) as Record<string, any>
  const items: FeedItem[] = []
  if (doc.rss?.channel) {
    for (const it of arr(doc.rss.channel.item)) {
      const enclosure = arr(it.enclosure).find((e: any) => String(e?.['@type'] ?? '').startsWith('image/'))
      const media = arr(it['media:content'] ?? it['media:thumbnail'])[0] as any
      items.push({
        title: text(it.title).trim().slice(0, 200),
        url: httpOnly(text(it.link).trim()),
        date: Date.parse(text(it.pubDate)) || null,
        image: httpOnly(String(enclosure?.['@url'] ?? media?.['@url'] ?? '')) || null,
      })
    }
  } else if (doc.feed) {
    for (const it of arr(doc.feed.entry)) {
      const links = arr(it.link) as any[]
      const link = links.find((l) => !l?.['@rel'] || l['@rel'] === 'alternate') ?? links[0]
      const thumb = it['media:group']?.['media:thumbnail']?.['@url'] ?? null
      items.push({
        title: text(it.title).trim().slice(0, 200),
        url: httpOnly(String(link?.['@href'] ?? '')),
        date: Date.parse(text(it.published) || text(it.updated)) || null,
        image: thumb ? httpOnly(String(thumb)) || null : null,
      })
    }
  }
  return items.filter((i) => i.title && i.url).slice(0, max)
}

export type CacheEntry<T> = { value: T; fetchedAt: number } | null

export function readCache<T>(db: DB, key: string): CacheEntry<T> {
  const r = db.prepare('SELECT value, fetched_at FROM remote_cache WHERE key = ?').get(key) as { value: string; fetched_at: number } | undefined
  if (!r) return null
  try {
    return { value: JSON.parse(r.value) as T, fetchedAt: r.fetched_at }
  } catch {
    return null
  }
}

export function writeCache(db: DB, key: string, value: unknown, now: number): void {
  db.prepare('INSERT INTO remote_cache (key, value, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at, error = NULL').run(
    key,
    JSON.stringify(value),
    now,
  )
}

const inflight = new Set<string>()

/** Devuelve lo que haya en caché ya; si está viejo, lo refresca sin bloquear la respuesta. */
export function cached<T>(db: DB, key: string, ttlMs: number, now: number, refresh: () => Promise<T>): T | null {
  const c = readCache<T>(db, key)
  if ((!c || now - c.fetchedAt > ttlMs) && !inflight.has(key)) {
    inflight.add(key)
    refresh()
      .then((v) => writeCache(db, key, v, Date.now()))
      .catch((e) => db.prepare('UPDATE remote_cache SET error = ? WHERE key = ?').run(String(e).slice(0, 200), key))
      .finally(() => inflight.delete(key))
  }
  return c?.value ?? null
}

export async function fetchFeed(url: string, opts: SafeFetchOptions = {}): Promise<FeedItem[]> {
  const r = await safeFetch(url, { timeoutMs: 8000, maxBytes: 3 * 1024 * 1024, headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, ...opts })
  if (r.status !== 200) throw new Error(`http_${r.status}`)
  const items = parseFeed(r.body.toString('utf8'))
  if (!items.length) throw new Error('empty_feed')
  return items
}

/** youtube.com/@usuario, /channel/UC…, o la URL del feed → URL del feed de videos */
export async function youtubeFeedUrl(input: string, opts: SafeFetchOptions = {}): Promise<string | null> {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  const host = u.hostname.replace(/^(www\.|m\.)/, '')
  if (host !== 'youtube.com') return null
  if (u.pathname === '/feeds/videos.xml' && /^UC[\w-]{22}$/.test(u.searchParams.get('channel_id') ?? '')) return u.href
  const ch = /^\/channel\/(UC[\w-]{22})/.exec(u.pathname)
  if (ch) return `https://www.youtube.com/feeds/videos.xml?channel_id=${ch[1]}`
  if (/^\/(@[\w.-]{2,60}|c\/[\w.-]+|user\/[\w.-]+)\/?/.test(u.pathname)) {
    const r = await safeFetch(`https://www.youtube.com${u.pathname}`, { timeoutMs: 8000, maxBytes: 4 * 1024 * 1024, headers: { 'accept-language': 'en' }, ...opts })
    const m = /"(?:channelId|externalId)":"(UC[\w-]{22})"/.exec(r.body.toString('utf8'))
    return m ? `https://www.youtube.com/feeds/videos.xml?channel_id=${m[1]}` : null
  }
  return null
}

// --- clima (Open-Meteo, CC BY 4.0, sin llave) ---

export type Place = { name: string; country: string; lat: number; lng: number; timezone: string }
export type Weather = { temp: number; code: number; wind: number; is_day: boolean }

export async function geocode(city: string, lang: string, opts: SafeFetchOptions = {}): Promise<Place | null> {
  const q = new URLSearchParams({ name: city, count: '1', language: lang.slice(0, 2), format: 'json' })
  const r = await safeFetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`, { timeoutMs: 8000, ...opts })
  if (r.status !== 200) return null
  const j = JSON.parse(r.body.toString('utf8')) as { results?: { name: string; country?: string; latitude: number; longitude: number; timezone?: string }[] }
  const p = j.results?.[0]
  return p ? { name: p.name, country: p.country ?? '', lat: p.latitude, lng: p.longitude, timezone: p.timezone ?? 'auto' } : null
}

export async function fetchWeather(p: { lat: number; lng: number }, opts: SafeFetchOptions = {}): Promise<Weather> {
  const q = new URLSearchParams({ latitude: String(p.lat), longitude: String(p.lng), current: 'temperature_2m,weather_code,wind_speed_10m,is_day' })
  const r = await safeFetch(`https://api.open-meteo.com/v1/forecast?${q}`, { timeoutMs: 8000, ...opts })
  if (r.status !== 200) throw new Error(`http_${r.status}`)
  const c = (JSON.parse(r.body.toString('utf8')) as { current: { temperature_2m: number; weather_code: number; wind_speed_10m: number; is_day: number } }).current
  return { temp: c.temperature_2m, code: c.weather_code, wind: c.wind_speed_10m, is_day: c.is_day === 1 }
}

/** Código WMO → grupo para ícono y texto */
export function weatherGroup(code: number): 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm' {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  return 'storm'
}
