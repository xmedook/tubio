import type { DB } from '../../db/index.ts'
import { html, raw, type SafeHtml } from '../../lib/html.ts'
import type { Locale, T } from '../../lib/i18n.ts'
import { renderMarkdown } from '../../lib/markdown.ts'
import { imageUrl } from '../../lib/uploads.ts'
import {
  mediaUrl,
  soundcloudEmbed,
  spotifyEmbed,
  tiktokEmbed,
  twitchEmbed,
  vimeoEmbed,
  youtubeEmbed,
  type Embed,
} from './embeds.ts'
import { NETWORK_BY_ID, NETWORKS } from './socials.ts'
import { V2_BLOCKS } from './blocks-v2.ts'
import { BUSINESS_BLOCKS } from './blocks-business.ts'
import { embedDef } from './embed-block.ts'
import { FEED_BLOCKS } from './blocks-feeds.ts'
import { CAPTURE_BLOCKS } from './blocks-capture.ts'
import { EMBED_BLOCKS } from './blocks-embeds.ts'

export type BlockRow = {
  id: number
  link_id: number
  type: string
  position: number
  is_enabled: number
  starts_at: number | null
  ends_at: number | null
  data: Record<string, unknown>
  style: BlockStyle
  clicks: number
  created_at: number
  updated_at: number
}

export type BlockStyle = { text_color?: string | null; bg_color?: string | null; border_color?: string | null; align?: 'inherit' | 'left' | 'center' | 'right' }

export type FieldSpec =
  | { name: string; kind: 'text'; label: string; max: number; required?: boolean; placeholder?: string }
  | { name: string; kind: 'textarea'; label: string; max: number; rows?: number; required?: boolean; hint?: string }
  | { name: string; kind: 'url'; label: string; required?: boolean; schemes: 'button' | 'web'; placeholder?: string }
  | { name: string; kind: 'embed'; label: string; provider: (url: string, host: string) => Embed | null; placeholder: string }
  | { name: string; kind: 'media'; label: string; media: 'video' | 'audio' }
  | { name: string; kind: 'select'; label: string; options: string[]; default: string }
  | { name: string; kind: 'checkbox'; label: string; default?: boolean }
  | { name: string; kind: 'image'; label: string; required?: boolean; square?: boolean; maxDim?: number }
  | { name: string; kind: 'socials'; label: string }
  /** filas repetibles (FAQ, horario, reseñas…); se guardan como arreglo de objetos */
  | { name: string; kind: 'rows'; label: string; columns: RowColumn[]; maxRows: number; minRows?: number }
  /** varias imágenes (galería, carrusel); arreglo de llaves */
  | { name: string; kind: 'images'; label: string; max: number; maxDim?: number }
  /** fecha y hora en la zona del usuario; epoch ms */
  | { name: string; kind: 'datetime'; label: string; required?: boolean }
  | { name: string; kind: 'number'; label: string; min: number; max: number; required?: boolean; step?: number }
  /** archivo cualquiera para descargar; { file_id, name, size } */
  | { name: string; kind: 'file'; label: string; required?: boolean }
  /** a qué destinos de aviso del usuario se manda lo recogido */
  | { name: string; kind: 'targets'; label: string }

export type RowColumn = { name: string; label: string; type: 'text' | 'textarea' | 'url' | 'number' | 'time' | 'select'; max?: number; options?: string[]; required?: boolean }

export type RenderCtx = {
  t: T
  locale: Locale
  /** host público para el parent de Twitch */
  host: string
  verified: boolean
  /** ya se pintó la insignia de verificado */
  badgeShown: { v: boolean }
  now: number
  /** para bloques con datos en caché (RSS, clima) */
  db: DB
  /** formularios de captura */
  csrf: string
  pow: () => object | null
  /** bloque cuyo formulario se acaba de enviar (?sent=) */
  sent: number | null
  cookies: Record<string, string | undefined>
  ownerName: string
  /** error del último envío de un formulario (?err=…&b=…) */
  formError: { id: number; key: string } | null
}

export type BlockDef = {
  type: string
  group: 'basic' | 'social' | 'media' | 'business' | 'capture'
  fields: FieldSpec[]
  /** ¿El bloque es un enlace que cuenta clics? */
  clickable?: boolean
  render: (rc: RenderCtx, b: BlockRow) => SafeHtml
  summary: (b: BlockRow) => string
  /** orígenes que la página debe permitir en frame-src para este bloque */
  frameOrigins?: (b: BlockRow, host: string) => string[]
  /** al guardar: completa/valida contra el servicio externo; devuelve datos o error en un campo */
  prepare?: (data: Record<string, unknown>, locale: string) => Promise<{ data: Record<string, unknown> } | { field: string; error: string }>
}

const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const clickHref = (b: BlockRow, to?: string) => `/_/c/${b.id}${to ? `?to=${encodeURIComponent(to)}` : ''}`

function badge(rc: RenderCtx): SafeHtml {
  if (!rc.verified || rc.badgeShown.v) return html``
  rc.badgeShown.v = true
  return html` <span class="verified" title="${rc.t('bio.verified')}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 1.5l2.6 2 3.3-.3.9 3.2 2.8 1.8-1.2 3.1 1.2 3.1-2.8 1.8-.9 3.2-3.3-.3-2.6 2-2.6-2-3.3.3-.9-3.2L2.4 15l1.2-3.1L2.4 8.7l2.8-1.8.9-3.2 3.3.3z"/><path fill="var(--bio-bg-solid,#fff)" d="M10.6 15.6 7.3 12.3l1.4-1.4 1.9 1.9 4.7-4.7 1.4 1.4z"/></svg><span class="sr-only">${rc.t('bio.verified')}</span></span>`
}

export const BLOCKS: BlockDef[] = [
  {
    type: 'link',
    group: 'basic',
    clickable: true,
    fields: [
      { name: 'label', kind: 'text', label: 'bio.f.label', max: 120, required: true },
      { name: 'url', kind: 'url', label: 'bio.f.url', required: true, schemes: 'button', placeholder: 'https://' },
      { name: 'subtitle', kind: 'text', label: 'bio.f.subtitle', max: 160 },
    ],
    render: (_rc, b) => html`<a class="btn" href="${clickHref(b)}">${s(b.data.label)}${b.data.subtitle ? html`<small>${s(b.data.subtitle)}</small>` : ''}</a>`,
    summary: (b) => s(b.data.label),
  },
  {
    type: 'big_link',
    group: 'basic',
    clickable: true,
    fields: [
      { name: 'label', kind: 'text', label: 'bio.f.label', max: 120, required: true },
      { name: 'url', kind: 'url', label: 'bio.f.url', required: true, schemes: 'button', placeholder: 'https://' },
      { name: 'subtitle', kind: 'text', label: 'bio.f.subtitle', max: 200 },
      { name: 'effect', kind: 'select', label: 'bio.f.effect', options: ['none', 'pulse', 'shake', 'shine'], default: 'pulse' },
    ],
    render: (_rc, b) => html`<a class="btn btn-big fx-${s(b.data.effect) || 'none'}" href="${clickHref(b)}"><strong>${s(b.data.label)}</strong>${b.data.subtitle ? html`<small>${s(b.data.subtitle)}</small>` : ''}</a>`,
    summary: (b) => s(b.data.label),
  },
  {
    type: 'image_link',
    group: 'basic',
    clickable: true,
    fields: [
      { name: 'label', kind: 'text', label: 'bio.f.label', max: 120, required: true },
      { name: 'url', kind: 'url', label: 'bio.f.url', required: true, schemes: 'button', placeholder: 'https://' },
      { name: 'image', kind: 'image', label: 'bio.f.image', required: true, maxDim: 600 },
      { name: 'layout', kind: 'select', label: 'bio.f.layout', options: ['thumb', 'cover'], default: 'thumb' },
    ],
    render: (_rc, b) => html`<a class="btn btn-img l-${s(b.data.layout) || 'thumb'}" href="${clickHref(b)}"><img src="${imageUrl(s(b.data.image)) ?? ''}" alt="" loading="lazy" decoding="async"><span>${s(b.data.label)}</span></a>`,
    summary: (b) => s(b.data.label),
  },
  {
    type: 'heading',
    group: 'basic',
    fields: [
      { name: 'text', kind: 'text', label: 'bio.f.text', max: 160, required: true },
      { name: 'level', kind: 'select', label: 'bio.f.level', options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], default: 'h2' },
    ],
    render: (rc, b) => {
      const lv = /^h[1-6]$/.test(s(b.data.level)) ? s(b.data.level) : 'h2'
      return raw(`<${lv} class="heading">${html`${s(b.data.text)}${badge(rc)}`.value}</${lv}>`)
    },
    summary: (b) => s(b.data.text),
  },
  {
    type: 'paragraph',
    group: 'basic',
    fields: [{ name: 'text', kind: 'textarea', label: 'bio.f.text', max: 2000, required: true, rows: 4 }],
    render: (_rc, b) => html`<p class="para">${s(b.data.text).split('\n').map((line, i) => (i ? html`<br>${line}` : html`${line}`))}</p>`,
    summary: (b) => s(b.data.text).slice(0, 80),
  },
  {
    type: 'markdown',
    group: 'basic',
    fields: [{ name: 'text', kind: 'textarea', label: 'bio.f.markdown', max: 5000, required: true, rows: 8, hint: 'bio.f.markdown_hint' }],
    render: (_rc, b) => html`<div class="md">${raw(renderMarkdown(s(b.data.text)))}</div>`,
    summary: (b) => s(b.data.text).slice(0, 80),
  },
  {
    type: 'avatar',
    group: 'basic',
    fields: [
      { name: 'image', kind: 'image', label: 'bio.f.image', required: true, square: true, maxDim: 400 },
      { name: 'alt', kind: 'text', label: 'bio.f.alt', max: 120 },
      { name: 'size', kind: 'select', label: 'bio.f.size', options: ['sm', 'md', 'lg'], default: 'md' },
      { name: 'shape', kind: 'select', label: 'bio.f.shape', options: ['circle', 'rounded', 'square'], default: 'circle' },
    ],
    render: (_rc, b) => html`<img class="avatar s-${s(b.data.size) || 'md'} sh-${s(b.data.shape) || 'circle'}" src="${imageUrl(s(b.data.image)) ?? ''}" alt="${s(b.data.alt)}" width="128" height="128" decoding="async" fetchpriority="high">`,
    summary: (b) => s(b.data.alt) || 'avatar',
  },
  {
    type: 'image',
    group: 'basic',
    clickable: true,
    fields: [
      { name: 'image', kind: 'image', label: 'bio.f.image', required: true, maxDim: 1400 },
      { name: 'alt', kind: 'text', label: 'bio.f.alt', max: 200 },
      { name: 'caption', kind: 'text', label: 'bio.f.caption', max: 200 },
      { name: 'url', kind: 'url', label: 'bio.f.url_optional', schemes: 'button', placeholder: 'https://' },
    ],
    render: (_rc, b) => {
      const img = html`<img src="${imageUrl(s(b.data.image)) ?? ''}" alt="${s(b.data.alt)}" loading="lazy" decoding="async">`
      return html`<figure class="figure">${b.data.url ? html`<a href="${clickHref(b)}">${img}</a>` : img}${b.data.caption ? html`<figcaption>${s(b.data.caption)}</figcaption>` : ''}</figure>`
    },
    summary: (b) => s(b.data.caption) || s(b.data.alt) || 'imagen',
  },
  {
    type: 'divider',
    group: 'basic',
    fields: [{ name: 'style', kind: 'select', label: 'bio.f.divider_style', options: ['line', 'dashed', 'dots', 'space'], default: 'line' }],
    render: (_rc, b) => (s(b.data.style) === 'space' ? html`<div class="spacer" aria-hidden="true"></div>` : html`<hr class="hr st-${s(b.data.style) || 'line'}">`),
    summary: (b) => s(b.data.style),
  },
  {
    type: 'list',
    group: 'basic',
    fields: [
      { name: 'items', kind: 'textarea', label: 'bio.f.items', max: 3000, required: true, rows: 6, hint: 'bio.f.items_hint' },
      { name: 'style', kind: 'select', label: 'bio.f.list_style', options: ['bullet', 'number', 'check'], default: 'bullet' },
    ],
    render: (_rc, b) => {
      const items = s(b.data.items).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 50)
      const st = s(b.data.style) || 'bullet'
      const li = items.map((i) => html`<li>${i}</li>`)
      return st === 'number' ? html`<ol class="list st-number">${li}</ol>` : html`<ul class="list st-${st}">${li}</ul>`
    },
    summary: (b) => s(b.data.items).split('\n')[0] ?? '',
  },
  {
    type: 'alert',
    group: 'basic',
    fields: [
      { name: 'text', kind: 'textarea', label: 'bio.f.text', max: 500, required: true, rows: 3 },
      { name: 'variant', kind: 'select', label: 'bio.f.variant', options: ['info', 'success', 'warning', 'danger'], default: 'info' },
    ],
    render: (_rc, b) => html`<div class="alert v-${s(b.data.variant) || 'info'}" role="note">${s(b.data.text)}</div>`,
    summary: (b) => s(b.data.text).slice(0, 80),
  },
  {
    type: 'marquee',
    group: 'basic',
    fields: [
      { name: 'text', kind: 'text', label: 'bio.f.text', max: 200, required: true },
      { name: 'speed', kind: 'select', label: 'bio.f.speed', options: ['slow', 'normal', 'fast'], default: 'normal' },
    ],
    render: (_rc, b) => html`<div class="marquee sp-${s(b.data.speed) || 'normal'}" role="marquee" aria-label="${s(b.data.text)}"><div class="marquee-track" aria-hidden="true"><span>${s(b.data.text)}</span><span>${s(b.data.text)}</span><span>${s(b.data.text)}</span><span>${s(b.data.text)}</span></div></div>`,
    summary: (b) => s(b.data.text),
  },
  {
    type: 'socials',
    group: 'social',
    clickable: true,
    fields: [
      { name: 'links', kind: 'socials', label: 'bio.f.socials' },
      { name: 'colored', kind: 'checkbox', label: 'bio.f.colored', default: false },
      { name: 'size', kind: 'select', label: 'bio.f.size', options: ['sm', 'md', 'lg'], default: 'md' },
    ],
    render: (_rc, b) => {
      const links = (b.data.links ?? {}) as Record<string, string>
      const items = NETWORKS.filter((n) => typeof links[n.id] === 'string' && links[n.id])
      return html`<ul class="socials s-${s(b.data.size) || 'md'}${b.data.colored ? ' colored' : ''}">${items.map(
        (n) => html`<li><a href="${clickHref(b, n.id)}" class="soc soc-${n.id}" aria-label="${n.name}" title="${n.name}"><svg viewBox="0 0 24 24" aria-hidden="true"><path${n.evenodd ? raw(' fill-rule="evenodd"') : ''} d="${n.path}"/></svg></a></li>`,
      )}</ul>`
    },
    summary: (b) => Object.keys((b.data.links ?? {}) as object).map((k) => NETWORK_BY_ID.get(k)?.name ?? k).join(', '),
  },
  {
    type: 'share',
    group: 'social',
    fields: [{ name: 'label', kind: 'text', label: 'bio.f.label', max: 80 }],
    render: (rc, b) => html`<button type="button" class="btn btn-share" data-share>${s(b.data.label) || rc.t('bio.share')}</button>`,
    summary: (b) => s(b.data.label),
  },
  embedDef('youtube', youtubeEmbed, 'https://www.youtube.com/watch?v=…'),
  embedDef('vimeo', vimeoEmbed, 'https://vimeo.com/…'),
  embedDef('tiktok', tiktokEmbed, 'https://www.tiktok.com/@usuario/video/…'),
  embedDef('twitch', twitchEmbed, 'https://www.twitch.tv/canal'),
  embedDef('spotify', spotifyEmbed, 'https://open.spotify.com/track/…'),
  embedDef('soundcloud', soundcloudEmbed, 'https://soundcloud.com/artista/cancion'),
  {
    type: 'video',
    group: 'media',
    fields: [
      { name: 'url', kind: 'media', label: 'bio.f.video_url', media: 'video' },
      { name: 'poster', kind: 'image', label: 'bio.f.poster', maxDim: 1280 },
    ],
    render: (_rc, b) => html`<video class="media" controls playsinline preload="metadata" src="${s(b.data.url)}"${b.data.poster ? html` poster="${imageUrl(s(b.data.poster))}"` : ''}></video>`,
    summary: (b) => s(b.data.url),
  },
  {
    type: 'audio',
    group: 'media',
    fields: [
      { name: 'url', kind: 'media', label: 'bio.f.audio_url', media: 'audio' },
      { name: 'title', kind: 'text', label: 'bio.f.embed_title', max: 120 },
    ],
    render: (_rc, b) => html`<figure class="audio">${b.data.title ? html`<figcaption>${s(b.data.title)}</figcaption>` : ''}<audio controls preload="none" src="${s(b.data.url)}"></audio></figure>`,
    summary: (b) => s(b.data.title) || s(b.data.url),
  },
]

BLOCKS.push(...V2_BLOCKS, ...BUSINESS_BLOCKS, ...FEED_BLOCKS, ...EMBED_BLOCKS, ...CAPTURE_BLOCKS)

export const BLOCK_BY_TYPE = new Map(BLOCKS.map((b) => [b.type, b]))
export const MAX_BLOCKS_PER_PAGE = 100

/** ¿A dónde manda un clic de este bloque? (to = red social) */
export function blockTarget(b: BlockRow, to?: string): string | null {
  if (b.type === 'socials') {
    const links = (b.data.links ?? {}) as Record<string, string>
    return to && typeof links[to] === 'string' ? links[to] : null
  }
  const def = BLOCK_BY_TYPE.get(b.type)
  return def?.clickable && typeof b.data.url === 'string' && b.data.url ? b.data.url : null
}
