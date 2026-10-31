// Menú, carta de servicios y menú en PDF. Menú y carta son una lista PLANA de filas con su categoría (se agrupan por
// categoría en el orden en que aparecen): así se edita con el formulario de filas repetibles de siempre.
import { html, type SafeHtml } from '../../lib/html.ts'
import type { BlockDef, BlockRow, RenderCtx } from './blocks.ts'
import { imageUrl } from '../../lib/uploads.ts'

const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const rows = (b: BlockRow, name: string): Record<string, unknown>[] => (Array.isArray(b.data[name]) ? (b.data[name] as Record<string, unknown>[]) : [])

/** Primer número de un precio escrito a mano («$1,250», «desde 350.50», «90 MXN») */
export function parsePrice(v: string): number | null {
  const m = /(\d[\d,]*(?:\.\d+)?)/.exec(v)
  if (!m) return null
  const n = Number((m[1] as string).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

type Item = { cat: string; nombre: string; desc: string; precio: string; dur: number | null; tags: string[]; ok: boolean; foto: string }
const TAGS = ['picante', 'vegano', 'vegetariano', 'nuevo', 'favorito', 'sin_gluten']

function items(b: BlockRow): Item[] {
  return rows(b, 'items')
    .map((r) => ({
      cat: s(r.categoria).trim(),
      nombre: s(r.nombre).trim(),
      desc: s(r.descripcion).trim(),
      precio: s(r.precio).trim(),
      dur: Number.isFinite(Number(r.duracion_min)) && Number(r.duracion_min) > 0 ? Math.round(Number(r.duracion_min)) : null,
      tags: s(r.etiquetas).split(',').map((x) => x.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean).slice(0, 4),
      ok: s(r.disponible) !== 'no',
      foto: s(r.foto),
    }))
    .filter((i) => i.nombre)
}

/** [categoría, items][] en el orden en que aparece cada categoría */
function grouped(list: Item[]): [string, Item[]][] {
  const m = new Map<string, Item[]>()
  for (const i of list) (m.get(i.cat) ?? m.set(i.cat, []).get(i.cat)!).push(i)
  return [...m]
}

/** ¿La página tiene una solicitud de WhatsApp? (para ofrecer «Agendar» por servicio y continuar el carrito) */
function pageHasWa(rc: RenderCtx, b: BlockRow): boolean {
  return !!rc.db.prepare("SELECT 1 FROM bio_blocks WHERE link_id = ? AND type = 'wa_request' AND is_enabled = 1 LIMIT 1").get(b.link_id)
}

function catalogHtml(rc: RenderCtx, b: BlockRow, kind: 'menu' | 'services'): SafeHtml {
  const list = items(b)
  if (!list.length) return html``
  const groups = grouped(list)
  const cart = kind === 'menu' && !!b.data.carrito
  const book = kind === 'services' && pageHasWa(rc, b)
  const moneda = s(b.data.moneda).trim() || '$'
  const searchable = list.length > 8
  const uid = `mn${b.id}`
  return html`<div class="mnu" data-mnu="${b.id}"${cart ? html` data-cart data-moneda="${moneda}" data-negocio="${rc.site.title}" data-num="${rc.site.wa}" data-l-total="${rc.t('ms.cat.total')}" data-l-order="${rc.t('ms.cat.order')}" data-l-note="${rc.t('ms.cat.note')}" data-l-view="${rc.t('ms.cat.view')}" data-l-empty="${rc.t('ms.cat.empty')}" data-l-hello="${rc.t('ms.cat.hello', { negocio: rc.site.title })}"` : ''}>
  ${b.data.titulo ? html`<h2 class="mnu-h">${s(b.data.titulo)}</h2>` : ''}
  ${searchable ? html`<div class="mnu-s"><label class="sr-only" for="${uid}-q">${rc.t('ms.cat.search')}</label><input id="${uid}-q" type="search" class="mnu-q" placeholder="${rc.t('ms.cat.search')}" data-mnu-q autocomplete="off" hidden></div>` : ''}
  ${groups.length > 1 ? html`<nav class="mnu-cats" aria-label="${rc.t('ms.cat.cats')}">${groups.map(([c], i) => (c ? html`<a href="#${uid}-c${i}">${c}</a>` : ''))}</nav>` : ''}
  ${groups.map(([c, its], i) => html`<section class="mnu-g" id="${uid}-c${i}" data-mnu-g>${c ? html`<h3 class="mnu-c">${c}</h3>` : ''}<ul class="mnu-l">${its.map((it) => {
    const price = parsePrice(it.precio)
    const key = `${b.id}:${it.nombre}`
    return html`<li class="mnu-i${it.ok ? '' : ' off'}" data-mnu-i data-name="${it.nombre}" data-text="${`${it.nombre} ${it.desc} ${c}`.toLowerCase()}"${price !== null ? html` data-price="${price}"` : ''} data-key="${key}">
      ${it.foto ? html`<img class="mnu-img" src="${imageUrl(it.foto) ?? ''}" alt="" width="96" height="96" loading="lazy" decoding="async">` : ''}
      <div class="mnu-r"><span class="mnu-n">${it.nombre}${it.tags.map((g) => html` <span class="mnu-tag">${TAGS.includes(g) ? rc.t(`ms.cat.tag.${g}`) : g.replace(/_/g, ' ')}</span>`)}</span>${it.precio ? html`<span class="mnu-p">${it.precio}</span>` : ''}</div>
      ${it.desc ? html`<p class="mnu-d">${it.desc}</p>` : ''}
      ${it.dur ? html`<p class="mnu-m">${rc.t('ms.cat.min', { n: it.dur })}</p>` : ''}
      ${!it.ok ? html`<p class="mnu-m">${rc.t('ms.cat.soldout')}</p>` : ''}
      ${cart && it.ok ? html`<div class="mnu-a"><div class="mnu-q2" data-qty hidden><button type="button" data-dec aria-label="${rc.t('ms.cat.less', { name: it.nombre })}">−</button><output aria-live="polite">0</output><button type="button" data-inc aria-label="${rc.t('ms.cat.more', { name: it.nombre })}">+</button></div><button type="button" class="mnu-add" data-add aria-label="${rc.t('ms.cat.add', { name: it.nombre })}">+</button></div>` : ''}
      ${book && it.ok ? html`<button type="button" class="mnu-book" data-wa-book="${it.nombre}">${rc.t('ms.cat.book')}</button>` : ''}
    </li>`
  })}</ul></section>`)}
  ${cart ? html`<button type="button" class="cart-bar" data-cart-open hidden></button>
  <dialog class="wa-sheet cart-sheet" data-cart-sheet aria-labelledby="${uid}-ct"><div class="wa-form"><div class="wa-head"><h2 id="${uid}-ct" class="wa-title">${rc.t('ms.cat.your_order')}</h2><button type="button" class="wa-x" data-cart-close aria-label="${rc.t('ms.wa.close')}">×</button></div><ul class="cart-l" data-cart-list></ul><p class="cart-t" data-cart-total></p><button type="button" class="btn wa-go" data-cart-go>${rc.t('ms.cat.continue')}</button><button type="button" class="cart-clear" data-cart-clear>${rc.t('ms.cat.clear')}</button></div></dialog>` : ''}
</div>`
}

const COMMON_COLS = [
  { name: 'categoria', label: 'ms.f.cat_categoria', type: 'text' as const, max: 60 },
  { name: 'nombre', label: 'ms.f.cat_nombre', type: 'text' as const, max: 80, required: true },
  { name: 'descripcion', label: 'ms.f.cat_desc', type: 'text' as const, max: 200 },
  { name: 'precio', label: 'ms.f.cat_precio', type: 'text' as const, max: 30 },
]

export const CATALOG_BLOCKS: BlockDef[] = [
  {
    type: 'menu',
    group: 'site',
    fields: [
      { name: 'titulo', kind: 'text', label: 'ms.f.cat_titulo', max: 80 },
      { name: 'moneda', kind: 'text', label: 'ms.f.cat_moneda', max: 6, placeholder: '$' },
      { name: 'carrito', kind: 'checkbox', label: 'ms.f.cat_carrito', default: false },
      {
        name: 'items',
        kind: 'rows',
        label: 'ms.f.cat_menu_items',
        maxRows: 80,
        columns: [...COMMON_COLS, { name: 'foto', label: 'ms.f.cat_foto', type: 'image', maxDim: 600 }, { name: 'etiquetas', label: 'ms.f.cat_etiquetas', type: 'text', max: 60 }, { name: 'disponible', label: 'ms.f.cat_disponible', type: 'select', options: ['si', 'no'] }],
      },
    ],
    render: (rc, b) => catalogHtml(rc, b, 'menu'),
    summary: (b) => s(b.data.titulo) || `${items(b).length} platillos`,
  },
  {
    type: 'services',
    group: 'site',
    fields: [
      { name: 'titulo', kind: 'text', label: 'ms.f.cat_titulo', max: 80 },
      { name: 'moneda', kind: 'text', label: 'ms.f.cat_moneda', max: 6, placeholder: '$' },
      {
        name: 'items',
        kind: 'rows',
        label: 'ms.f.cat_serv_items',
        maxRows: 60,
        columns: [...COMMON_COLS, { name: 'duracion_min', label: 'ms.f.cat_duracion', type: 'number' }],
      },
    ],
    render: (rc, b) => catalogHtml(rc, b, 'services'),
    summary: (b) => s(b.data.titulo) || `${items(b).length} servicios`,
  },
  {
    type: 'menu_pdf',
    group: 'site',
    fields: [
      { name: 'file', kind: 'file', label: 'ms.f.cat_pdf', required: true, mimes: ['application/pdf'], maxBytes: 12 * 1024 * 1024 },
      { name: 'titulo', kind: 'text', label: 'ms.f.cat_titulo', max: 80 },
      { name: 'portada', kind: 'image', label: 'ms.f.cat_portada', maxDim: 900 },
    ],
    frameOrigins: () => ["'self'"],
    render: (rc, b) => {
      const file = b.data.file as { file_id?: number } | null
      if (!file?.file_id) return html``
      const titulo = s(b.data.titulo) || rc.t('ms.cat.pdf_default')
      return html`<div class="mpdf" data-mpdf="${b.id}">
  <a class="mpdf-card" href="/_/pdf/${b.id}?download=1" data-mpdf-open>${b.data.portada ? html`<img src="${imageUrl(s(b.data.portada)) ?? ''}" alt="" loading="lazy" decoding="async">` : ''}<span class="mpdf-t">${titulo}</span><span class="mpdf-b">${rc.t('ms.cat.pdf_view')}</span></a>
  <dialog class="mpdf-dlg" data-mpdf-dlg aria-label="${titulo}"><div class="mpdf-bar"><a class="mpdf-dl" href="/_/pdf/${b.id}?download=1">${rc.t('ms.cat.pdf_download')}</a><button type="button" class="wa-x" data-mpdf-close aria-label="${rc.t('ms.wa.close')}">×</button></div><iframe title="${titulo}" data-src="/_/pdf/${b.id}"></iframe></dialog>
</div>`
    },
    summary: (b) => s(b.data.titulo) || String((b.data.file as { name?: string } | null)?.name ?? 'PDF'),
  },
]
