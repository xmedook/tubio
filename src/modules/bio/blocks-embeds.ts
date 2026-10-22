import { html } from '../../lib/html.ts'
import { safeFetch } from '../../lib/safe-fetch.ts'
import type { BlockDef } from './blocks.ts'
import { embedDef, embedFrame } from './embed-block.ts'
import type { Embed } from './embeds.ts'

/**
 * Embeds por iframe oficial de cada servicio (sin cargar sus scripts en la página).
 * Cada parser acepta sólo URLs del host esperado y extrae un ID con expresión estricta.
 */

const s = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Acepta la URL o el código <iframe src="…"> que da el servicio */
export function srcOf(input: string): string {
  const m = /<iframe[^>]+src=["']([^"']+)["']/i.exec(input)
  return (m?.[1] ?? input).trim().replace(/&amp;/g, '&')
}

function parse(input: string): URL | null {
  try {
    const u = new URL(srcOf(input))
    return u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}
const host = (u: URL) => u.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '')
const fixed = (src: string, height: number): Embed => ({ src, ratio: 'fixed', height })

export function xEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || !['x.com', 'twitter.com'].includes(host(u))) return null
  const m = /^\/\w{1,15}\/status\/(\d{5,25})/.exec(u.pathname)
  return m ? fixed(`https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&dnt=true`, 560) : null
}

export function instagramEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || host(u) !== 'instagram.com') return null
  const m = /^\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]{5,40})/.exec(u.pathname)
  return m ? fixed(`https://www.instagram.com/${m[1]}/${m[2]}/embed`, 640) : null
}

export function facebookEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || !['facebook.com', 'fb.watch'].includes(host(u))) return null
  const isVideo = /\/videos?\/|\/watch|\/reel\//.test(u.pathname) || host(u) === 'fb.watch'
  const clean = `https://www.facebook.com${u.pathname}${u.searchParams.get('v') ? `?v=${u.searchParams.get('v')}` : ''}`
  if (!/^\/[\w.\-/]+$/.test(u.pathname) || u.pathname.length < 3) return null
  return isVideo
    ? { src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(clean)}&show_text=false`, ratio: '16x9' }
    : fixed(`https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(clean)}&show_text=true&width=500`, 600)
}

export function threadsEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || !['threads.net', 'threads.com'].includes(host(u))) return null
  const m = /^\/@([\w.]{1,40})\/post\/([\w-]{5,40})/.exec(u.pathname)
  return m ? fixed(`https://www.threads.net/@${m[1]}/post/${m[2]}/embed`, 600) : null
}

/** Bluesky necesita el DID: lo resuelve `prepare` al guardar y queda en data.did */
export function blueskyEmbed(url: string, did: string): Embed | null {
  const u = parse(url)
  if (!u || host(u) !== 'bsky.app' || !/^did:(plc|web):[\w.:-]{5,80}$/.test(did)) return null
  const m = /^\/profile\/[^/]+\/post\/([\w]{5,20})/.exec(u.pathname)
  return m ? fixed(`https://embed.bsky.app/embed/${did}/app.bsky.feed.post/${m[1]}`, 560) : null
}

export function pinterestEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || !/^([a-z]{2}\.)?pinterest\.(com|com\.mx|es|ca)$/.test(host(u))) return null
  const m = /^\/pin\/(\d{5,25})/.exec(u.pathname)
  return m ? fixed(`https://assets.pinterest.com/ext/embed.html?id=${m[1]}`, 600) : null
}

export function redditEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || !['reddit.com', 'old.reddit.com', 'new.reddit.com'].includes(host(u))) return null
  const m = /^\/r\/(\w{2,21})\/comments\/(\w{4,10})(?:\/[\w-]*)?/.exec(u.pathname)
  return m ? fixed(`https://embed.reddit.com/r/${m[1]}/comments/${m[2]}/?embed=true&theme=light`, 500) : null
}

export function snapchatEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || host(u) !== 'snapchat.com') return null
  const m = /^\/spotlight\/([\w-]{10,80})/.exec(u.pathname)
  return m ? { src: `https://www.snapchat.com/spotlight/${m[1]}/embed`, ratio: '9x16' } : null
}

export function telegramEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || !['t.me', 'telegram.me'].includes(host(u))) return null
  const m = /^\/(\w{5,32})\/(\d{1,10})$/.exec(u.pathname)
  return m ? fixed(`https://t.me/${m[1]}/${m[2]}?embed=1`, 500) : null
}

/** Widget de servidor (hay que activarlo en Ajustes del servidor → Widget) */
export function discordEmbed(input: string): Embed | null {
  const id = /^\d{17,20}$/.test(input.trim()) ? input.trim() : /discord\.com\/(?:widget\?id=|channels\/)(\d{17,20})/.exec(input)?.[1]
  return id ? fixed(`https://discord.com/widget?id=${id}&theme=dark`, 500) : null
}

export function calendlyEmbed(url: string, parentHost: string): Embed | null {
  const u = parse(url)
  if (!u || host(u) !== 'calendly.com' || !/^\/[\w-]{2,60}(\/[\w-]{1,80})?\/?$/.test(u.pathname)) return null
  return fixed(`https://calendly.com${u.pathname.replace(/\/$/, '')}?embed_domain=${encodeURIComponent(parentHost)}&embed_type=Inline&hide_gdpr_banner=1`, 700)
}

export function typeformEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || !(host(u) === 'typeform.com' || host(u).endsWith('.typeform.com'))) return null
  const m = /^\/to\/([\w]{4,20})/.exec(u.pathname)
  return m ? fixed(`https://form.typeform.com/to/${m[1]}?typeform-embed=embed-widget`, 560) : null
}

export function googleFormsEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || host(u) !== 'docs.google.com') return null
  const m = /^\/forms\/d\/e\/([\w-]{20,120})\//.exec(u.pathname)
  return m ? fixed(`https://docs.google.com/forms/d/e/${m[1]}/viewform?embedded=true`, 760) : null
}

/** Documentos, hojas y presentaciones de Google publicados en la web (Archivo → Compartir → Publicar) */
export function googleDocsEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || host(u) !== 'docs.google.com') return null
  const m = /^\/(document|spreadsheets|presentation)\/d\/e\/([\w-]{20,200})\//.exec(u.pathname)
  if (!m) return null
  if (m[1] === 'presentation') return { src: `https://docs.google.com/presentation/d/e/${m[2]}/embed?start=false&loop=false`, ratio: '16x9' }
  if (m[1] === 'spreadsheets') return fixed(`https://docs.google.com/spreadsheets/d/e/${m[2]}/pubhtml?widget=true&headers=false`, 500)
  return fixed(`https://docs.google.com/document/d/e/${m[2]}/pub?embedded=true`, 600)
}

export function canvaEmbed(url: string): Embed | null {
  const u = parse(url)
  if (!u || host(u) !== 'canva.com') return null
  const m = /^\/design\/([\w-]{8,20})\/(?:[\w-]{8,40}\/)?view/.exec(u.pathname)
  return m ? { src: `https://www.canva.com/design/${m[1]}/view?embed`, ratio: '16x9' } : null
}

/** Google Maps (el src de «Insertar un mapa») u OpenStreetMap (URL con #map=zoom/lat/lon) */
export function mapEmbed(input: string): Embed | null {
  const u = parse(input)
  if (!u) return null
  if (host(u) === 'google.com' && u.pathname === '/maps/embed' && /^[\w!.%*-]{10,2000}$/.test(u.searchParams.get('pb') ?? '')) {
    return fixed(`https://www.google.com/maps/embed?pb=${u.searchParams.get('pb')}`, 360)
  }
  if (host(u) === 'openstreetmap.org') {
    const m = /map=(\d{1,2})\/(-?\d{1,2}\.\d+)\/(-?\d{1,3}\.\d+)/.exec(u.hash)
    if (!m) return null
    const z = Number(m[1])
    const lat = Number(m[2])
    const lon = Number(m[3])
    const d = 180 / 2 ** z
    const bbox = [lon - d, lat - d / 2, lon + d, lat + d / 2].map((n) => n.toFixed(5)).join(',')
    return fixed(`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`, 360)
  }
  return null
}

/** iframe genérico: cualquier https (se revisa contra la lista de bloqueo al guardar) */
export function iframeEmbed(input: string): Embed | null {
  const u = parse(input)
  return u && !u.username && !u.password ? fixed(u.href, 500) : null
}

const def = embedDef

export const EMBED_BLOCKS: BlockDef[] = [
  def('x_post', xEmbed, 'https://x.com/usuario/status/…', 'social'),
  def('instagram', instagramEmbed, 'https://www.instagram.com/p/…', 'social'),
  def('facebook', facebookEmbed, 'https://www.facebook.com/…/posts/…', 'social'),
  def('threads', threadsEmbed, 'https://www.threads.net/@usuario/post/…', 'social'),
  {
    type: 'bluesky',
    group: 'social',
    fields: [
      { name: 'url', kind: 'url', label: 'bio.f.embed_url', required: true, schemes: 'web', placeholder: 'https://bsky.app/profile/…/post/…' },
      { name: 'title', kind: 'text', label: 'bio.f.embed_title', max: 120 },
    ],
    prepare: async (data) => {
      const m = /^https:\/\/bsky\.app\/profile\/([^/]+)\/post\/(\w+)/.exec(s(data.url))
      if (!m) return { field: 'url', error: 'err.embed_url' }
      let did = decodeURIComponent(m[1] as string)
      if (!did.startsWith('did:')) {
        const r = await safeFetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`, { timeoutMs: 8000 }).catch(() => null)
        did = r?.status === 200 ? String((JSON.parse(r.body.toString('utf8')) as { did?: string }).did ?? '') : ''
      }
      return blueskyEmbed(s(data.url), did) ? { data: { did } } : { field: 'url', error: 'err.embed_url' }
    },
    frameOrigins: () => ['https://embed.bsky.app'],
    render: (rc, b) => embedFrame(blueskyEmbed(s(b.data.url), s(b.data.did)), s(b.data.title) || rc.t('bio.type_bluesky')),
    summary: (b) => s(b.data.title) || s(b.data.url),
  },
  def('pinterest', pinterestEmbed, 'https://www.pinterest.com/pin/…', 'social'),
  def('reddit', redditEmbed, 'https://www.reddit.com/r/…/comments/…', 'social'),
  def('snapchat', snapchatEmbed, 'https://www.snapchat.com/spotlight/…', 'social'),
  def('telegram', telegramEmbed, 'https://t.me/canal/123', 'social'),
  def('discord', discordEmbed, '123456789012345678', 'social'),
  def('calendly', calendlyEmbed, 'https://calendly.com/usuario/30min', 'business'),
  def('typeform', typeformEmbed, 'https://form.typeform.com/to/…', 'business'),
  def('google_forms', googleFormsEmbed, 'https://docs.google.com/forms/d/e/…/viewform', 'business'),
  def('google_docs', googleDocsEmbed, 'https://docs.google.com/…/d/e/…/pub', 'media'),
  def('canva', canvaEmbed, 'https://www.canva.com/design/…/view', 'media'),
  def('map', mapEmbed, 'https://www.google.com/maps/embed?pb=…', 'business'),
  {
    type: 'pdf',
    group: 'media',
    clickable: false,
    fields: [
      { name: 'file', kind: 'file', label: 'bio.f.pdf_file', required: true },
      { name: 'title', kind: 'text', label: 'bio.f.embed_title', max: 120 },
    ],
    prepare: async (data) => (String((data.file as { mime?: string } | null)?.mime ?? 'application/pdf') === 'application/pdf' ? { data: {} } : { field: 'file', error: 'err.pdf_only' }),
    frameOrigins: () => ["'self'"],
    render: (rc, b) => html`${embedFrame(fixed(`/_/pdf/${b.id}`, 600), s(b.data.title) || rc.t('bio.type_pdf'))}<p class="pdf-link"><a href="/_/pdf/${b.id}?download=1">${rc.t('bio.pdf_download')}</a></p>`,
    summary: (b) => s(b.data.title) || String((b.data.file as { name?: string } | null)?.name ?? ''),
  },
  def('iframe', iframeEmbed, 'https://…', 'media'),
]
