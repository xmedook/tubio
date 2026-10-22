import { html, type SafeHtml } from '../../lib/html.ts'
import type { BlockDef } from './blocks.ts'
import type { Embed } from './embeds.ts'

/** Bloque genérico de embed por iframe (separado de blocks.ts para evitar import circular) */

const s = (v: unknown): string => (typeof v === 'string' ? v : '')

export function embedFrame(e: Embed | null, title: string): SafeHtml {
  if (!e) return html``
  const sizeClass = e.ratio === 'fixed' ? 'r-fixed' : `r-${e.ratio}`
  return html`<div class="embed ${sizeClass}${e.height ? ` h-${e.height}` : ''}"><iframe src="${e.src}" title="${title}" loading="lazy"
  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"
  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-forms"></iframe></div>`
}

export const embedDef = (type: string, provider: (url: string, host: string) => Embed | null, placeholder: string, group: BlockDef['group'] = 'media'): BlockDef => ({
  type,
  group,
  frameOrigins: (b, host) => {
    const e = provider(s(b.data.url), host)
    try {
      return e ? [new URL(e.src).origin] : []
    } catch {
      return []
    }
  },
  fields: [
    { name: 'url', kind: 'embed', label: 'bio.f.embed_url', provider, placeholder },
    { name: 'title', kind: 'text', label: 'bio.f.embed_title', max: 120 },
  ],
  render: (rc, b) => embedFrame(provider(s(b.data.url), rc.host), s(b.data.title) || rc.t(`bio.type_${type}`)),
  summary: (b) => s(b.data.title) || s(b.data.url),
})

