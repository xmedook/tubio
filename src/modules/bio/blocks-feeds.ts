import { html } from '../../lib/html.ts'
import { cached, fetchFeed, fetchWeather, geocode, weatherGroup, writeCache, youtubeFeedUrl, type FeedItem, type Weather } from '../../lib/feeds.ts'
import type { BlockDef, BlockRow, RenderCtx } from './blocks.ts'

/** Bloques con datos de fuera: se validan al guardar y se leen de caché (1 h feeds, 30 min clima). */

const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const HOUR = 3600_000

function dateLabel(rc: RenderCtx, ts: number | null): string {
  return ts ? new Intl.DateTimeFormat(rc.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(ts) : ''
}

function feedItems(rc: RenderCtx, b: BlockRow, url: string): FeedItem[] {
  return cached<FeedItem[]>(rc.db, `feed:${url}`, HOUR, rc.now, () => fetchFeed(url)) ?? []
}

const ICONS: Record<ReturnType<typeof weatherGroup>, string> = { clear: '☀️', partly: '⛅', cloudy: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', snow: '❄️', storm: '⛈️' }

export const FEED_BLOCKS: BlockDef[] = [
  {
    type: 'rss',
    group: 'media',
    fields: [
      { name: 'url', kind: 'url', label: 'bio.f.feed_url', required: true, schemes: 'web', placeholder: 'https://…/feed' },
      { name: 'title', kind: 'text', label: 'bio.f.title', max: 120 },
      { name: 'count', kind: 'select', label: 'bio.f.count', options: ['3', '5', '10'], default: '5' },
      { name: 'dates', kind: 'checkbox', label: 'bio.f.show_dates', default: true },
    ],
    prepare: async (data) => {
      const url = s(data.url)
      try {
        const items = await fetchFeed(url)
        return items.length ? { data: {} } : { field: 'url', error: 'err.feed' }
      } catch {
        return { field: 'url', error: 'err.feed' }
      }
    },
    render: (rc, b) => {
      const items = feedItems(rc, b, s(b.data.url)).slice(0, Number(b.data.count) || 5)
      return html`<section class="feed">${b.data.title ? html`<p class="feed-title">${s(b.data.title)}</p>` : ''}
${items.length === 0 ? html`<p class="feed-empty">${rc.t('bio.feed_loading')}</p>` : html`<ul>${items.map((i) => html`<li><a href="${i.url}" rel="noopener nofollow" target="_blank">${i.title}</a>${b.data.dates && i.date ? html`<small>${dateLabel(rc, i.date)}</small>` : ''}</li>`)}</ul>`}</section>`
    },
    summary: (b) => s(b.data.title) || s(b.data.url),
  },
  {
    type: 'youtube_feed',
    group: 'media',
    fields: [
      { name: 'channel', kind: 'url', label: 'bio.f.yt_channel', required: true, schemes: 'web', placeholder: 'https://www.youtube.com/@canal' },
      { name: 'count', kind: 'select', label: 'bio.f.count', options: ['2', '4', '6'], default: '4' },
    ],
    prepare: async (data) => {
      const feed = await youtubeFeedUrl(s(data.channel)).catch(() => null)
      if (!feed) return { field: 'channel', error: 'err.yt_channel' }
      try {
        await fetchFeed(feed)
      } catch {
        return { field: 'channel', error: 'err.yt_channel' }
      }
      return { data: { feed } }
    },
    render: (rc, b) => {
      const items = feedItems(rc, b, s(b.data.feed)).slice(0, Number(b.data.count) || 4)
      const id = (u: string) => /(?:[?&]v=|\/shorts\/)([\w-]{11})/.exec(u)?.[1] ?? ''
      return html`<div class="ytfeed">${items.length === 0 ? html`<p class="feed-empty">${rc.t('bio.feed_loading')}</p>` : items.map((i) => {
        const vid = id(i.url)
        return html`<a href="${i.url}" rel="noopener" target="_blank"><img src="${vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : ''}" alt="" loading="lazy" width="320" height="180"><span>${i.title}</span></a>`
      })}</div>`
    },
    summary: (b) => s(b.data.channel),
  },
  {
    type: 'weather',
    group: 'business',
    fields: [
      { name: 'city', kind: 'text', label: 'bio.f.city', max: 100, required: true, placeholder: 'Guadalajara' },
      { name: 'units', kind: 'select', label: 'bio.f.units', options: ['c', 'f'], default: 'c' },
    ],
    prepare: async (data, locale) => {
      const place = await geocode(s(data.city), locale).catch(() => null)
      if (!place) return { field: 'city', error: 'err.city' }
      return { data: { place } }
    },
    render: (rc, b) => {
      const place = (b.data.place ?? null) as { name: string; country: string; lat: number; lng: number } | null
      if (!place) return html``
      const key = `weather:${place.lat.toFixed(2)},${place.lng.toFixed(2)}`
      const w = cached<Weather>(rc.db, key, HOUR / 2, rc.now, () => fetchWeather(place))
      const f = s(b.data.units) === 'f'
      return html`<div class="weather">${w
        ? html`<span class="w-icon" aria-hidden="true">${ICONS[weatherGroup(w.code)]}</span><span class="w-temp">${Math.round(f ? w.temp * 1.8 + 32 : w.temp)}°${f ? 'F' : 'C'}</span>
<span class="w-place">${place.name}${place.country ? `, ${place.country}` : ''}<small>${rc.t(`bio.w_${weatherGroup(w.code)}`)} · ${rc.t('bio.w_wind', { n: Math.round(w.wind) })}</small></span>`
        : html`<span class="w-place">${place.name}<small>${rc.t('bio.feed_loading')}</small></span>`}
<small class="w-src">Open-Meteo</small></div>`
    },
    summary: (b) => s(b.data.city),
  },
]

/** Calienta la caché al guardar para que la primera visita ya muestre datos */
export async function warmFeedCache(db: import('../../db/index.ts').DB, b: { type: string; data: Record<string, unknown> }, now: number): Promise<void> {
  try {
    if (b.type === 'rss') writeCache(db, `feed:${s(b.data.url)}`, await fetchFeed(s(b.data.url)), now)
    if (b.type === 'youtube_feed') writeCache(db, `feed:${s(b.data.feed)}`, await fetchFeed(s(b.data.feed)), now)
    if (b.type === 'weather' && b.data.place) {
      const p = b.data.place as { lat: number; lng: number }
      writeCache(db, `weather:${p.lat.toFixed(2)},${p.lng.toFixed(2)}`, await fetchWeather(p), now)
    }
  } catch {
    /* la caché se llenará en la primera visita */
  }
}
