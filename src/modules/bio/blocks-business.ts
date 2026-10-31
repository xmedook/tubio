import { html, raw, type SafeHtml } from '../../lib/html.ts'
import { formatNumber } from '../../lib/i18n.ts'
import { renderMarkdown } from '../../lib/markdown.ts'
import { imageUrl } from '../../lib/uploads.ts'
import type { BlockDef, BlockRow, RenderCtx } from './blocks.ts'

/** Bloques de negocio y contenido (F2a): sin servicios externos. */

const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const rows = (b: BlockRow, name: string): Record<string, unknown>[] => (Array.isArray(b.data[name]) ? (b.data[name] as Record<string, unknown>[]) : [])
const keys = (b: BlockRow, name: string): string[] => (Array.isArray(b.data[name]) ? (b.data[name] as unknown[]).filter((k): k is string => typeof k === 'string') : [])
const clickHref = (b: BlockRow) => `/_/c/${b.id}`

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export const TZ = Intl.supportedValuesOf('timeZone')

/** ¿Abierto ahora? según las filas {day, open, close} en la zona dada (cierre después de medianoche incluido) */
export function openNow(list: Record<string, unknown>[], timeZone: string, now: number): boolean {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  } catch {
    return false
  }
  const wd = (parts.find((p) => p.type === 'weekday')?.value ?? '').toLowerCase().slice(0, 3)
  const hm = `${parts.find((p) => p.type === 'hour')?.value ?? '00'}:${parts.find((p) => p.type === 'minute')?.value ?? '00'}`
  const prev = DAYS[(DAYS.indexOf(wd as (typeof DAYS)[number]) + 6) % 7]
  for (const r of list) {
    const open = s(r.open)
    const close = s(r.close)
    if (!open || !close) continue
    if (close > open) {
      if (r.day === wd && hm >= open && hm < close) return true
    } else {
      // pasa de medianoche: 20:00–02:00
      if (r.day === wd && hm >= open) return true
      if (r.day === prev && hm < close) return true
    }
  }
  return false
}

function stars(n: number): SafeHtml {
  const v = Math.max(0, Math.min(5, Math.round(n)))
  return html`<span class="stars" aria-label="${v}/5">${'★'.repeat(v)}<span class="off">${'★'.repeat(5 - v)}</span></span>`
}

/** Enlaces de cobro del propio usuario: tubio nunca toca el dinero */
const PAY_HOSTS = ['buy.stripe.com', 'donate.stripe.com', 'paypal.me', 'www.paypal.com', 'paypal.com', 'mpago.la', 'link.mercadopago.com.mx', 'www.mercadopago.com.mx', 'mercadopago.com.mx', 'ko-fi.com', 'buymeacoffee.com', 'www.buymeacoffee.com']

export function payHostOk(url: string): boolean {
  try {
    return PAY_HOSTS.includes(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}

export const BUSINESS_BLOCKS: BlockDef[] = [
  {
    type: 'donation',
    group: 'business',
    clickable: true,
    fields: [
      { name: 'title', kind: 'text', label: 'bio.f.title', max: 120 },
      { name: 'description', kind: 'text', label: 'bio.f.description', max: 240 },
      { name: 'url', kind: 'url', label: 'bio.f.pay_link', required: true, schemes: 'web', placeholder: 'https://buy.stripe.com/… · https://paypal.me/… · https://mpago.la/…' },
      { name: 'button', kind: 'text', label: 'bio.f.button_label', max: 40 },
    ],
    prepare: async (data) => (payHostOk(String(data.url ?? '')) ? { data: {} } : { field: 'url', error: 'err.pay_link' }),
    render: (rc, b) => html`<div class="donation">${b.data.title ? html`<p class="cap-title">${s(b.data.title)}</p>` : ''}${b.data.description ? html`<p class="cap-desc">${s(b.data.description)}</p>` : ''}<a class="btn" href="${clickHref(b)}">♥ ${s(b.data.button) || rc.t('bio.donate')}</a></div>`,
    summary: (b) => s(b.data.title) || s(b.data.url),
  },
  {
    type: 'paypal',
    group: 'business',
    clickable: true,
    fields: [
      { name: 'user', kind: 'text', label: 'bio.f.paypal_user', max: 40, required: true, placeholder: 'tuusuario' },
      { name: 'amount', kind: 'number', label: 'bio.f.amount_optional', min: 1, max: 100000, step: 0.01 },
      { name: 'currency', kind: 'select', label: 'bio.f.currency', options: ['MXN', 'USD', 'EUR'], default: 'MXN' },
      { name: 'button', kind: 'text', label: 'bio.f.button_label', max: 40 },
    ],
    prepare: async (data) => {
      const u = String(data.user ?? '').replace(/^@|^https?:\/\/(www\.)?paypal\.me\//i, '').trim()
      if (!/^[\w-]{2,40}$/.test(u)) return { field: 'user', error: 'err.paypal_user' }
      const amount = typeof data.amount === 'number' ? `/${data.amount}${String(data.currency ?? 'MXN')}` : ''
      return { data: { user: u, url: `https://paypal.me/${u}${amount}` } }
    },
    render: (rc, b) => html`<a class="btn btn-paypal" href="${clickHref(b)}">${s(b.data.button) || rc.t('bio.pay_paypal')}${typeof b.data.amount === 'number' ? html`<small>${new Intl.NumberFormat(rc.locale, { style: 'currency', currency: s(b.data.currency) || 'MXN' }).format(b.data.amount)}</small>` : ''}</a>`,
    summary: (b) => `paypal.me/${s(b.data.user)}`,
  },
  {
    type: 'faq',
    group: 'business',
    fields: [{ name: 'items', kind: 'rows', label: 'bio.f.faq_items', maxRows: 30, columns: [{ name: 'q', label: 'bio.f.question', type: 'text', max: 200, required: true }, { name: 'a', label: 'bio.f.answer', type: 'textarea', max: 2000, required: true }] }],
    render: (_rc, b) => html`<div class="faq">${rows(b, 'items').map((r) => html`<details><summary>${s(r.q)}</summary><div class="md">${raw(renderMarkdown(s(r.a)))}</div></details>`)}</div>`,
    summary: (b) => `${rows(b, 'items').length} · ${s(rows(b, 'items')[0]?.q)}`,
  },
  {
    type: 'hours',
    group: 'business',
    fields: [
      { name: 'title', kind: 'text', label: 'bio.f.title', max: 80 },
      { name: 'timezone', kind: 'select', label: 'account.timezone', options: TZ, default: 'America/Mexico_City' },
      { name: 'items', kind: 'rows', label: 'bio.f.hours_items', maxRows: 21, columns: [{ name: 'day', label: 'bio.f.day', type: 'select', options: [...DAYS] }, { name: 'open', label: 'bio.f.opens', type: 'time' }, { name: 'close', label: 'bio.f.closes', type: 'time' }] },
      { name: 'note', kind: 'text', label: 'bio.f.note', max: 160 },
    ],
    render: (rc: RenderCtx, b) => {
      const list = rows(b, 'items')
      const tz = TZ.includes(s(b.data.timezone)) ? s(b.data.timezone) : 'America/Mexico_City'
      const isOpen = openNow(list, tz, rc.now)
      return html`<div class="hours">
  ${b.data.title ? html`<p class="hours-title">${s(b.data.title)}</p>` : ''}
  <p class="hours-now ${isOpen ? 'open' : 'closed'}">${isOpen ? rc.t('bio.open_now') : rc.t('bio.closed_now')}</p>
  <table><tbody>${DAYS.map((d) => {
    const today = list.filter((r) => r.day === d && r.open && r.close)
    return html`<tr><th scope="row">${rc.t(`bio.o.hours.day.${d}`)}</th><td>${today.length ? today.map((r, i) => html`${i ? ', ' : ''}${s(r.open)}–${s(r.close)}`) : rc.t('bio.closed')}</td></tr>`
  })}</tbody></table>
  ${b.data.note ? html`<p class="hours-note">${s(b.data.note)}</p>` : ''}
</div>`
    },
    summary: (b) => s(b.data.title) || 'horario',
  },
  {
    type: 'reviews',
    group: 'business',
    fields: [{ name: 'items', kind: 'rows', label: 'bio.f.reviews_items', maxRows: 20, columns: [{ name: 'name', label: 'bio.f.reviewer', type: 'text', max: 80, required: true }, { name: 'text', label: 'bio.f.review', type: 'textarea', max: 600, required: true }, { name: 'rating', label: 'bio.f.rating', type: 'select', options: ['5', '4', '3', '2', '1'] }] }],
    render: (_rc, b) => html`<div class="reviews">${rows(b, 'items').map((r) => html`<figure class="review">${stars(Number(r.rating) || 5)}<blockquote>${s(r.text)}</blockquote><figcaption>— ${s(r.name)}</figcaption></figure>`)}</div>`,
    summary: (b) => `${rows(b, 'items').length} reseñas`,
  },
  {
    type: 'timeline',
    group: 'business',
    fields: [{ name: 'items', kind: 'rows', label: 'bio.f.timeline_items', maxRows: 30, columns: [{ name: 'date', label: 'bio.f.when', type: 'text', max: 40 }, { name: 'title', label: 'bio.f.title', type: 'text', max: 120, required: true }, { name: 'text', label: 'bio.f.text', type: 'textarea', max: 600 }] }],
    render: (_rc, b) => html`<ol class="timeline">${rows(b, 'items').map((r) => html`<li>${r.date ? html`<span class="tl-date">${s(r.date)}</span>` : ''}<strong>${s(r.title)}</strong>${r.text ? html`<p>${s(r.text)}</p>` : ''}</li>`)}</ol>`,
    summary: (b) => s(rows(b, 'items')[0]?.title),
  },
  {
    type: 'counter',
    group: 'business',
    fields: [
      { name: 'value', kind: 'number', label: 'bio.f.value', min: -1e12, max: 1e12, required: true, step: 0.01 },
      { name: 'prefix', kind: 'text', label: 'bio.f.prefix', max: 10 },
      { name: 'suffix', kind: 'text', label: 'bio.f.suffix', max: 20 },
      { name: 'label', kind: 'text', label: 'bio.f.caption', max: 120 },
    ],
    render: (rc, b) => html`<div class="counter"><span class="counter-n">${s(b.data.prefix)}${formatNumber(rc.locale, Number(b.data.value) || 0)}${/^[\p{L}]/u.test(s(b.data.suffix)) ? ' ' : ''}${s(b.data.suffix)}</span>${b.data.label ? html`<span class="counter-l">${s(b.data.label)}</span>` : ''}</div>`,
    summary: (b) => `${s(b.data.prefix)}${String(b.data.value ?? '')}${s(b.data.suffix)}`,
  },
  {
    type: 'countdown',
    group: 'business',
    fields: [
      { name: 'target', kind: 'datetime', label: 'bio.f.target', required: true },
      { name: 'label', kind: 'text', label: 'bio.f.caption', max: 120 },
      { name: 'done_text', kind: 'text', label: 'bio.f.done_text', max: 120 },
    ],
    render: (rc, b) => {
      const target = Number(b.data.target) || 0
      const left = Math.max(0, target - rc.now)
      const d = Math.floor(left / 86400000)
      const h = Math.floor((left % 86400000) / 3600000)
      const m = Math.floor((left % 3600000) / 60000)
      const sec = Math.floor((left % 60000) / 1000)
      const unit = (n: number, k: string) => html`<span class="cd-u"><b data-cd="${k}">${String(n).padStart(2, '0')}</b><small>${rc.t(`bio.cd_${k}`)}</small></span>`
      return html`<div class="countdown" data-countdown="${target}" data-done="${s(b.data.done_text) || rc.t('bio.cd_done')}">
  ${b.data.label ? html`<p class="cd-label">${s(b.data.label)}</p>` : ''}
  ${left > 0 ? html`<div class="cd-units" role="timer">${unit(d, 'd')}${unit(h, 'h')}${unit(m, 'm')}${unit(sec, 's')}</div>` : html`<p class="cd-done">${s(b.data.done_text) || rc.t('bio.cd_done')}</p>`}
</div>`
    },
    summary: (b) => s(b.data.label) || 'cuenta regresiva',
  },
  {
    type: 'coupon',
    group: 'business',
    fields: [
      { name: 'code', kind: 'text', label: 'bio.f.code', max: 60, required: true },
      { name: 'title', kind: 'text', label: 'bio.f.title', max: 120 },
      { name: 'description', kind: 'text', label: 'bio.f.description', max: 200 },
    ],
    render: (rc, b) => html`<div class="coupon">${b.data.title ? html`<p class="coupon-title">${s(b.data.title)}</p>` : ''}${b.data.description ? html`<p class="coupon-desc">${s(b.data.description)}</p>` : ''}
  <button type="button" class="coupon-code" data-copy="${s(b.data.code)}" data-copied="${rc.t('links.copied')}"><code>${s(b.data.code)}</code><span>${rc.t('links.copy')}</span></button></div>`,
    summary: (b) => s(b.data.code),
  },
  {
    type: 'product',
    group: 'business',
    clickable: true,
    fields: [
      { name: 'image', kind: 'image', label: 'bio.f.image', maxDim: 900 },
      { name: 'name', kind: 'text', label: 'bio.f.product_name', max: 120, required: true },
      { name: 'price', kind: 'number', label: 'bio.f.price', min: 0, max: 1e9, step: 0.01 },
      { name: 'currency', kind: 'select', label: 'bio.f.currency', options: ['MXN', 'USD', 'EUR', 'COP', 'ARS', 'CLP', 'PEN'], default: 'MXN' },
      { name: 'description', kind: 'textarea', label: 'bio.f.description', max: 600, rows: 3 },
      { name: 'url', kind: 'url', label: 'bio.f.url_optional', schemes: 'button', placeholder: 'https://' },
      { name: 'button', kind: 'text', label: 'bio.f.button_label', max: 40 },
    ],
    render: (rc, b) => {
      const price = typeof b.data.price === 'number' ? new Intl.NumberFormat(rc.locale, { style: 'currency', currency: s(b.data.currency) || 'MXN' }).format(b.data.price) : ''
      return html`<article class="product">${b.data.image ? html`<img src="${imageUrl(s(b.data.image))}" alt="" loading="lazy" decoding="async">` : ''}
  <div class="product-body"><h3>${s(b.data.name)}</h3>${price ? html`<p class="price">${price}</p>` : ''}${b.data.description ? html`<p>${s(b.data.description)}</p>` : ''}
  ${b.data.url ? html`<a class="btn" href="${clickHref(b)}">${s(b.data.button) || rc.t('bio.product_cta')}</a>` : ''}</div></article>`
    },
    summary: (b) => s(b.data.name),
  },
  {
    type: 'gallery',
    group: 'media',
    fields: [
      { name: 'images', kind: 'images', label: 'bio.f.images', max: 12, maxDim: 1400 },
      { name: 'columns', kind: 'select', label: 'bio.f.columns', options: ['2', '3'], default: '2' },
      { name: 'alt', kind: 'text', label: 'bio.f.alt', max: 200 },
    ],
    render: (rc, b) => html`<div class="gallery cols-${s(b.data.columns) === '3' ? '3' : '2'}">${keys(b, 'images').map((k, i, all) => html`<a href="${imageUrl(k)}" target="_blank" rel="noopener"><img src="${imageUrl(k)}" alt="${rc.t('bio.gallery_photo', { alt: s(b.data.alt) || rc.t('bio.gallery_default'), n: i + 1, total: all.length })}" loading="lazy" decoding="async"></a>`)}</div>`,
    summary: (b) => `${keys(b, 'images').length} imágenes`,
  },
  {
    type: 'carousel',
    group: 'media',
    fields: [
      { name: 'images', kind: 'images', label: 'bio.f.images', max: 12, maxDim: 1400 },
      { name: 'alt', kind: 'text', label: 'bio.f.alt', max: 200 },
    ],
    render: (rc, b) => html`<div class="carousel" role="region" aria-roledescription="${rc.t('bio.carousel')}" tabindex="0">${keys(b, 'images').map((k, i, all) => html`<figure aria-label="${i + 1} / ${all.length}"><img src="${imageUrl(k)}" alt="${s(b.data.alt)}" loading="lazy" decoding="async"></figure>`)}</div>`,
    summary: (b) => `${keys(b, 'images').length} imágenes`,
  },
  {
    type: 'before_after',
    group: 'media',
    fields: [
      { name: 'before', kind: 'image', label: 'bio.f.before', required: true, maxDim: 1400 },
      { name: 'after', kind: 'image', label: 'bio.f.after', required: true, maxDim: 1400 },
      { name: 'before_label', kind: 'text', label: 'bio.f.before_label', max: 30 },
      { name: 'after_label', kind: 'text', label: 'bio.f.after_label', max: 30 },
    ],
    render: (rc, b) => html`<figure class="ba" data-ba>
  <img src="${imageUrl(s(b.data.before))}" alt="${s(b.data.before_label) || rc.t('bio.before')}" loading="lazy">
  <div class="ba-after"><img src="${imageUrl(s(b.data.after))}" alt="${s(b.data.after_label) || rc.t('bio.after')}" loading="lazy"></div>
  <span class="ba-l ba-l1">${s(b.data.before_label) || rc.t('bio.before')}</span><span class="ba-l ba-l2">${s(b.data.after_label) || rc.t('bio.after')}</span>
  <input class="ba-range" type="range" min="0" max="100" value="50" aria-label="${rc.t('bio.ba_slider')}">
</figure>`,
    summary: (b) => `${s(b.data.before_label) || 'antes'} / ${s(b.data.after_label) || 'después'}`,
  },
  {
    type: 'modal',
    group: 'basic',
    fields: [
      { name: 'label', kind: 'text', label: 'bio.f.label', max: 80, required: true },
      { name: 'title', kind: 'text', label: 'bio.f.title', max: 120 },
      { name: 'text', kind: 'textarea', label: 'bio.f.markdown', max: 5000, required: true, rows: 6, hint: 'bio.f.markdown_hint' },
    ],
    render: (_rc, b) => html`<details class="modal"><summary class="btn">${s(b.data.label)}</summary><div class="modal-body">${b.data.title ? html`<h3>${s(b.data.title)}</h3>` : ''}<div class="md">${raw(renderMarkdown(s(b.data.text)))}</div></div></details>`,
    summary: (b) => s(b.data.label),
  },
  {
    type: 'vcard_button',
    group: 'business',
    fields: [
      { name: 'label', kind: 'text', label: 'bio.f.label', max: 80 },
      { name: 'first_name', kind: 'text', label: 'vcard.first_name', max: 100 },
      { name: 'last_name', kind: 'text', label: 'vcard.last_name', max: 100 },
      { name: 'org', kind: 'text', label: 'vcard.org', max: 150 },
      { name: 'job_title', kind: 'text', label: 'vcard.job_title', max: 150 },
      { name: 'phone', kind: 'text', label: 'vcard.phone', max: 40 },
      { name: 'email', kind: 'text', label: 'vcard.email', max: 254 },
      { name: 'url', kind: 'url', label: 'vcard.url', schemes: 'web' },
    ],
    render: (rc, b) => html`<a class="btn" href="/_/vcf/${b.id}">${s(b.data.label) || rc.t('bio.save_contact')}</a>`,
    summary: (b) => [s(b.data.first_name), s(b.data.last_name)].filter(Boolean).join(' ') || s(b.data.org),
  },
  {
    type: 'file_button',
    group: 'business',
    fields: [
      { name: 'label', kind: 'text', label: 'bio.f.label', max: 80, required: true },
      { name: 'file', kind: 'file', label: 'links.file', required: true },
    ],
    render: (_rc, b) => {
      const f = (b.data.file ?? {}) as { size?: number }
      const kb = f.size ? Math.max(1, Math.round(f.size / 1024)) : 0
      return html`<a class="btn" href="/_/dl/${b.id}">${s(b.data.label)}${kb ? html`<small>${kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}</small>` : ''}</a>`
    },
    summary: (b) => s(b.data.label),
  },
]
