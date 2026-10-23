import { html } from '../../lib/html.ts'
import { imageUrl } from '../../lib/uploads.ts'
import type { BlockDef, BlockRow } from './blocks.ts'

/** Bloques de v2: cabecera con portada, tarjeta de artículo y llamada a la acción */
const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const clickHref = (b: BlockRow) => `/_/c/${b.id}`
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export const V2_BLOCKS: BlockDef[] = [
  {
    type: 'cover_header',
    group: 'basic',
    fields: [
      { name: 'cover', kind: 'image', label: 'bio.f.cover', required: true, maxDim: 1200 },
      { name: 'image', kind: 'image', label: 'bio.f.avatar_optional', square: true, maxDim: 400 },
      { name: 'title', kind: 'text', label: 'bio.f.title', max: 120, required: true },
      { name: 'subtitle', kind: 'text', label: 'bio.f.subtitle', max: 200 },
    ],
    render: (_rc, b) => html`<header class="cover-h"><img class="cover-bg" src="${imageUrl(s(b.data.cover)) ?? ''}" alt="" decoding="async" fetchpriority="high">
  ${b.data.image ? html`<img class="cover-av" src="${imageUrl(s(b.data.image)) ?? ''}" alt="" width="112" height="112" decoding="async">` : ''}
  <h1 class="cover-t">${s(b.data.title)}</h1>${b.data.subtitle ? html`<p class="cover-s">${s(b.data.subtitle)}</p>` : ''}</header>`,
    summary: (b) => s(b.data.title),
  },
  {
    type: 'article_card',
    group: 'basic',
    clickable: true,
    fields: [
      { name: 'url', kind: 'url', label: 'bio.f.url', required: true, schemes: 'web', placeholder: 'https://' },
      { name: 'title', kind: 'text', label: 'bio.f.title', max: 140, required: true },
      { name: 'description', kind: 'text', label: 'bio.f.description', max: 240 },
      { name: 'image', kind: 'image', label: 'bio.f.image', maxDim: 800 },
    ],
    render: (_rc, b) => html`<a class="art-card" href="${clickHref(b)}">${b.data.image ? html`<img src="${imageUrl(s(b.data.image)) ?? ''}" alt="" loading="lazy" decoding="async">` : ''}<span class="art-b"><span class="art-t">${s(b.data.title)}</span>${b.data.description ? html`<span class="art-d">${s(b.data.description)}</span>` : ''}<span class="art-h">${host(s(b.data.url))}</span></span></a>`,
    summary: (b) => s(b.data.title),
  },
  {
    type: 'cta',
    group: 'basic',
    clickable: true,
    fields: [
      { name: 'title', kind: 'text', label: 'bio.f.title', max: 120, required: true },
      { name: 'text', kind: 'text', label: 'bio.f.text', max: 280 },
      { name: 'button', kind: 'text', label: 'bio.f.button', max: 60, required: true },
      { name: 'url', kind: 'url', label: 'bio.f.url', required: true, schemes: 'button', placeholder: 'https://' },
    ],
    render: (_rc, b) => html`<section class="cta-box"><p class="cta-t">${s(b.data.title)}</p>${b.data.text ? html`<p class="cta-x">${s(b.data.text)}</p>` : ''}<a class="btn btn-big" href="${clickHref(b)}"><strong>${s(b.data.button)}</strong></a></section>`,
    summary: (b) => s(b.data.title),
  },
]
