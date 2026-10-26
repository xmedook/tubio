import { html } from '../../lib/html.ts'
import { imageUrl } from '../../lib/uploads.ts'
import type { BlockDef, BlockRow } from './blocks.ts'

/** Bloques de v2: cabecera con portada, tarjeta de artículo, llamada a la acción, cifra grande, fichas y pasos */
const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const clickHref = (b: BlockRow, to?: string) => `/_/c/${b.id}${to !== undefined ? `?to=${encodeURIComponent(to)}` : ''}`
const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
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
  {
    type: 'stat',
    group: 'basic',
    clickable: true,
    fields: [
      { name: 'kicker', kind: 'text', label: 'bio.f.kicker', max: 80 },
      { name: 'value', kind: 'text', label: 'bio.f.stat_value', max: 16, required: true, placeholder: '10' },
      { name: 'title', kind: 'text', label: 'bio.f.title', max: 120 },
      { name: 'text', kind: 'text', label: 'bio.f.text', max: 280 },
      { name: 'layout', kind: 'select', label: 'bio.f.layout', options: ['stack', 'side'], default: 'stack' },
      { name: 'button', kind: 'text', label: 'bio.f.button_optional', max: 60 },
      { name: 'url', kind: 'url', label: 'bio.f.url_optional', schemes: 'button', placeholder: 'https://' },
    ],
    render: (_rc, b) => html`<section class="stat l-${s(b.data.layout) === 'side' ? 'side' : 'stack'}">${b.data.kicker ? html`<p class="stat-k">${s(b.data.kicker)}</p>` : ''}<p class="stat-v${s(b.data.value).length > 4 ? ' stat-long' : ''}">${s(b.data.value)}</p><div class="stat-b">${b.data.title ? html`<p class="stat-t">${s(b.data.title)}</p>` : ''}${b.data.text ? html`<p class="stat-x">${s(b.data.text)}</p>` : ''}</div>${b.data.button && b.data.url ? html`<a class="btn stat-btn" href="${clickHref(b)}"><strong>${s(b.data.button)}</strong></a>` : ''}</section>`,
    summary: (b) => `${s(b.data.value)} ${s(b.data.title)}`.trim(),
  },
  {
    type: 'chips',
    group: 'basic',
    fields: [
      { name: 'items', kind: 'rows', label: 'bio.f.chips_items', maxRows: 30, columns: [{ name: 'label', label: 'bio.f.label', type: 'text', max: 40, required: true }, { name: 'url', label: 'bio.f.url', type: 'url', required: true }] },
    ],
    render: (_rc, b) => html`<nav class="chips-row" aria-label="${rows(b.data.items).map((x) => s(x.label)).slice(0, 3).join(', ')}…"><ul>${rows(b.data.items).map((x, i) => html`<li><a class="chip-l" href="${clickHref(b, String(i))}">${s(x.label)}</a></li>`)}</ul></nav>`,
    summary: (b) => rows(b.data.items).map((x) => s(x.label)).join(' · ').slice(0, 80),
  },
  {
    type: 'steps',
    group: 'basic',
    fields: [
      { name: 'items', kind: 'rows', label: 'bio.f.steps_items', maxRows: 6, minRows: 2, columns: [{ name: 'num', label: 'bio.f.step_num', type: 'text', max: 8, required: true }, { name: 'label', label: 'bio.f.label', type: 'text', max: 40, required: true }] },
      { name: 'note', kind: 'text', label: 'bio.f.note', max: 200 },
    ],
    render: (_rc, b) => html`<div class="steps"><ol>${rows(b.data.items).map((x) => html`<li><b>${s(x.num)}</b><span>${s(x.label)}</span></li>`)}</ol>${b.data.note ? html`<p class="steps-n">${s(b.data.note)}</p>` : ''}</div>`,
    summary: (b) => rows(b.data.items).map((x) => s(x.num)).join(' · '),
  },
]
