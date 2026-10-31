// Bloques de minisitio: portada (foto o video), panel de acciones y ubicación con horarios.
import { html, type SafeHtml } from '../../lib/html.ts'
import { imageUrl } from '../../lib/uploads.ts'
import { checkUrl } from '../../lib/urls.ts'
import type { BlockDef, BlockRow, RenderCtx } from './blocks.ts'
import { DAYS, openNow, TZ } from './blocks-business.ts'
import { WA_BLOCK } from './wa-request.ts'
import { CATALOG_BLOCKS } from './blocks-catalog.ts'

const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const rows = (b: BlockRow, name: string): Record<string, unknown>[] => (Array.isArray(b.data[name]) ? (b.data[name] as Record<string, unknown>[]) : [])
const digits = (v: string) => v.replace(/\D/g, '')
const enc = encodeURIComponent
const clickHref = (b: BlockRow, to: string | number) => `/_/c/${b.id}?to=${enc(String(to))}`

export const VIDEO_MIMES = ['video/mp4', 'video/webm']
export const VIDEO_MAX_BYTES = 15 * 1024 * 1024
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/

// ------------------------------------------------------------------ Portada
function hero(rc: RenderCtx, b: BlockRow): SafeHtml {
  const d = b.data
  const video = d.video as { file_id?: number; mime?: string } | null
  const dark = Math.max(0, Math.min(80, Number.isFinite(Number(d.oscurecer)) && d.oscurecer !== null && d.oscurecer !== undefined ? Number(d.oscurecer) : 45))
  const asH1 = !rc.h1.v
  rc.h1.v = true
  const title = asH1 ? html`<h1 class="hero-t">${s(d.titulo)}</h1>` : html`<h2 class="hero-t">${s(d.titulo)}</h2>`
  return html`<div class="hero al-${d.alineacion === 'centro' ? 'centro' : 'abajo'} alto-${d.alto === 'media' ? 'media' : 'completa'} ov-${Math.round(dark / 10)}">
  ${d.foto ? html`<img class="hero-bg" src="${imageUrl(s(d.foto)) ?? ''}" alt="" decoding="async" fetchpriority="high">` : ''}
  ${video?.file_id ? html`<video class="hero-vid" muted loop playsinline preload="none"${d.foto ? html` poster="${imageUrl(s(d.foto)) ?? ''}"` : ''} data-hero-src="/_/v/${b.id}" data-hero-type="${video.mime === 'video/webm' ? 'video/webm' : 'video/mp4'}" aria-hidden="true"></video>` : ''}
  <div class="hero-in">
    ${d.logo ? html`<img class="hero-logo" src="${imageUrl(s(d.logo)) ?? ''}" alt="" height="56">` : ''}
    ${d.antetitulo ? html`<p class="hero-k">${s(d.antetitulo)}</p>` : ''}
    ${title}
    ${d.subtitulo ? html`<p class="hero-s">${s(d.subtitulo)}</p>` : ''}
  </div>
  ${video?.file_id && d.sonido ? html`<button type="button" class="hero-snd" data-hero-sound aria-pressed="false" aria-label="${rc.t('ms.hero_sound')}" hidden><span aria-hidden="true">🔇</span></button>` : ''}
</div>`
}

// ------------------------------------------------------------------ Panel de acciones
export const ACTION_KINDS = ['enlace', 'whatsapp', 'llamar', 'mapa', 'pagina', 'ancla'] as const

/** Destino que se resuelve en el servidor (cuenta clic): enlace, WhatsApp y mapa */
function panelUrl(a: Record<string, unknown>, wa: string): string | null {
  const t = s(a.tipo)
  const d = s(a.destino).trim()
  if (t === 'enlace') return /^https?:\/\//i.test(d) ? d : null
  if (t === 'whatsapp') {
    const n = digits(d) || wa
    if (!n) return null
    const m = s(a.mensaje).trim()
    return `https://wa.me/${n}${m ? `?text=${enc(m)}` : ''}`
  }
  if (t === 'mapa') return d ? `https://www.google.com/maps/dir/?api=1&destination=${enc(d)}` : null
  return null
}

/** Destino de un clic en `/_/c/:id?to=` para los bloques de minisitio */
export function msTarget(b: BlockRow, to: string | undefined, wa: string): string | null {
  if (b.type === 'action_panel') {
    const a = to !== undefined && /^\d{1,2}$/.test(to) ? rows(b, 'acciones')[Number(to)] : undefined
    return a ? panelUrl(a, wa) : null
  }
  if (b.type === 'location' && to) return locUrl(b, to)
  return null
}

function panelHref(rc: RenderCtx, b: BlockRow, a: Record<string, unknown>, i: number): string | null {
  const t = s(a.tipo)
  const d = s(a.destino).trim()
  if (t === 'llamar') return digits(d) ? `tel:+${digits(d)}` : null
  if (t === 'pagina') return SLUG.test(d.replace(/^\/+/, '')) || d === '' ? `/${rc.site.alias}${d ? `/${d.replace(/^\/+/, '')}` : ''}` : null
  if (t === 'ancla') return SLUG.test(d.replace(/^#/, '')) ? `#${d.replace(/^#/, '')}` : null
  return panelUrl(a, rc.site.wa) ? clickHref(b, i) : null
}

function normalizeAction(a: Record<string, unknown>): { ok: true; row: Record<string, unknown> } | { ok: false } {
  const tipo = (ACTION_KINDS as readonly string[]).includes(s(a.tipo)) ? s(a.tipo) : 'enlace'
  const d = s(a.destino).trim()
  let destino = d
  if (tipo === 'enlace') {
    if (!d) return { ok: false }
    const r = checkUrl(d)
    if (!r.ok) return { ok: false }
    destino = r.url
  } else if (tipo === 'whatsapp' || tipo === 'llamar') {
    destino = digits(d)
    if (tipo === 'llamar' && !destino) return { ok: false }
    if (destino && (destino.length < 8 || destino.length > 15)) return { ok: false }
  } else if (tipo === 'pagina') {
    destino = d.replace(/^\/+/, '').toLowerCase()
    if (destino && !SLUG.test(destino)) return { ok: false }
  } else if (tipo === 'ancla') {
    destino = d.replace(/^#/, '').toLowerCase()
    if (!SLUG.test(destino)) return { ok: false }
  } else if (tipo === 'mapa' && !d) return { ok: false }
  return { ok: true, row: { ...a, tipo, destino } }
}

const ARROW = html`<svg class="act-ar" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M5 11h11.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H5z"/></svg>`

function actionPanel(rc: RenderCtx, b: BlockRow): SafeHtml {
  const disp = ['pila', 'rejilla', 'principal'].includes(s(b.data.disposicion)) ? s(b.data.disposicion) : 'pila'
  const list = rows(b, 'acciones')
  return html`<div class="apanel d-${disp}">${list.map((a, i) => {
    const href = panelHref(rc, b, a, i)
    if (!href) return ''
    const main = s(a.principal) === 'si'
    return html`<a class="act${main ? ' principal' : ''}" href="${href}"${/^\/_\/c\//.test(href) ? html` rel="noopener"` : ''}>${a.etiqueta ? html`<small class="act-k">${s(a.etiqueta)}</small>` : ''}<span class="act-t">${s(a.titulo)}</span>${a.subtitulo ? html`<span class="act-s">${s(a.subtitulo)}</span>` : ''}${ARROW}</a>`
  })}</div>`
}

// ------------------------------------------------------------------ Ubicación
function place(b: BlockRow): string {
  const lat = b.data.lat
  const lng = b.data.lng
  if (typeof lat === 'number' && typeof lng === 'number') return `${lat},${lng}`
  return [s(b.data.nombre_lugar), s(b.data.direccion)].filter(Boolean).join(', ')
}

/** Enlaces a las apps de mapas: Google, Apple, Waze y «cómo llegar» */
export function locUrl(b: BlockRow, kind: string): string | null {
  const q = place(b)
  if (!q) return null
  const geo = typeof b.data.lat === 'number' && typeof b.data.lng === 'number'
  const label = s(b.data.nombre_lugar) || s(b.data.direccion)
  switch (kind) {
    case 'google':
      return `https://www.google.com/maps/search/?api=1&query=${enc(q)}`
    case 'dir':
      return `https://www.google.com/maps/dir/?api=1&destination=${enc(q)}`
    case 'apple':
      return geo ? `https://maps.apple.com/?ll=${q}&q=${enc(label)}` : `https://maps.apple.com/?q=${enc(q)}`
    case 'waze':
      return geo ? `https://waze.com/ul?ll=${q}&navigate=yes` : `https://waze.com/ul?q=${enc(q)}&navigate=yes`
    default:
      return null
  }
}

const PIN = html`<svg class="loc-pin" viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>`

function location(rc: RenderCtx, b: BlockRow): SafeHtml {
  const list = rows(b, 'horario')
  const tz = TZ.includes(s(b.data.timezone)) ? s(b.data.timezone) : 'America/Mexico_City'
  const q = place(b)
  const open = list.length ? openNow(list, tz, rc.now) : null
  return html`<div class="loc">
  <div class="loc-map" data-loc data-src="https://www.google.com/maps?q=${enc(q)}&output=embed" data-title="${s(b.data.nombre_lugar) || s(b.data.direccion)}">
    ${PIN}
    <p class="loc-addr">${b.data.nombre_lugar ? html`<strong>${s(b.data.nombre_lugar)}</strong><br>` : ''}${s(b.data.direccion)}</p>
    <button type="button" class="loc-load" data-loc-load hidden>${rc.t('ms.loc_see_map')}</button>
  </div>
  <div class="loc-btns">
    <a class="act principal" href="${clickHref(b, 'dir')}"><span class="act-t">${rc.t('ms.loc_directions')}</span>${ARROW}</a>
    <a class="act" href="${clickHref(b, 'google')}"><span class="act-t">Google Maps</span></a>
    <a class="act" href="${clickHref(b, 'apple')}"><span class="act-t">Apple Maps</span></a>
    <a class="act" href="${clickHref(b, 'waze')}"><span class="act-t">Waze</span></a>
  </div>
  ${b.data.referencias ? html`<p class="loc-note">${s(b.data.referencias)}</p>` : ''}
  ${b.data.estacionamiento ? html`<p class="loc-note">${rc.t('ms.loc_parking')}: ${s(b.data.estacionamiento)}</p>` : ''}
  ${list.length ? html`<div class="hours">
    ${open !== null ? html`<p class="hours-now ${open ? 'open' : 'closed'}">${open ? rc.t('bio.open_now') : rc.t('bio.closed_now')}</p>` : ''}
    <table><tbody>${DAYS.map((d) => {
      const day = list.filter((r) => r.day === d && r.open && r.close)
      return html`<tr><th scope="row">${rc.t(`bio.o.hours.day.${d}`)}</th><td>${day.length ? day.map((r, i) => html`${i ? ', ' : ''}${s(r.open)}–${s(r.close)}`) : rc.t('bio.closed')}</td></tr>`
    })}</tbody></table>
  </div>` : ''}
</div>`
}

const HOUR_COLS = [
  { name: 'day', label: 'bio.f.day', type: 'select' as const, options: [...DAYS] },
  { name: 'open', label: 'bio.f.opens', type: 'time' as const },
  { name: 'close', label: 'bio.f.closes', type: 'time' as const },
]

export const MS_BLOCKS: BlockDef[] = [
  WA_BLOCK,
  ...CATALOG_BLOCKS,
  {
    type: 'hero',
    group: 'site',
    fields: [
      { name: 'foto', kind: 'image', label: 'ms.f.hero_foto', maxDim: 1800 },
      { name: 'video', kind: 'file', label: 'ms.f.hero_video', mimes: VIDEO_MIMES, maxBytes: VIDEO_MAX_BYTES },
      { name: 'logo', kind: 'image', label: 'ms.f.hero_logo', maxDim: 400 },
      { name: 'antetitulo', kind: 'text', label: 'ms.s.antetitulo', max: 80 },
      { name: 'titulo', kind: 'text', label: 'ms.s.titulo', max: 140, required: true },
      { name: 'subtitulo', kind: 'text', label: 'ms.s.subtitulo', max: 240 },
      { name: 'alineacion', kind: 'select', label: 'ms.f.hero_alin', options: ['abajo', 'centro'], default: 'abajo' },
      { name: 'alto', kind: 'select', label: 'ms.s.alto_t', options: ['completa', 'media'], default: 'completa' },
      { name: 'oscurecer', kind: 'number', label: 'ms.s.oscurecer', min: 0, max: 80, step: 10 },
      { name: 'sonido', kind: 'checkbox', label: 'ms.f.hero_sonido' },
    ],
    render: hero,
    summary: (b) => s(b.data.titulo),
  },
  {
    type: 'action_panel',
    group: 'site',
    clickable: true,
    fields: [
      { name: 'disposicion', kind: 'select', label: 'ms.f.panel_disp', options: ['pila', 'rejilla', 'principal'], default: 'pila' },
      {
        name: 'acciones',
        kind: 'rows',
        label: 'ms.f.panel_acciones',
        maxRows: 8,
        columns: [
          { name: 'etiqueta', label: 'ms.f.act_etiqueta', type: 'text', max: 30 },
          { name: 'titulo', label: 'ms.f.act_titulo', type: 'text', max: 40, required: true },
          { name: 'subtitulo', label: 'ms.f.act_subtitulo', type: 'text', max: 60 },
          { name: 'tipo', label: 'ms.a.tipo', type: 'select', options: [...ACTION_KINDS] },
          { name: 'destino', label: 'ms.a.destino', type: 'text', max: 2048 },
          { name: 'mensaje', label: 'ms.a.mensaje', type: 'text', max: 300 },
          { name: 'principal', label: 'ms.f.act_principal', type: 'select', options: ['no', 'si'] },
        ],
      },
    ],
    prepare: async (data) => {
      const out: Record<string, unknown>[] = []
      for (const a of Array.isArray(data.acciones) ? (data.acciones as Record<string, unknown>[]) : []) {
        const r = normalizeAction(a)
        if (!r.ok) return { field: 'acciones', error: 'ms.err_action' }
        out.push(r.row)
      }
      return out.length ? { data: { acciones: out } } : { field: 'acciones', error: 'err.required' }
    },
    render: actionPanel,
    summary: (b) => rows(b, 'acciones').map((a) => s(a.titulo)).filter(Boolean).join(' · '),
  },
  {
    type: 'location',
    group: 'site',
    clickable: true,
    frameOrigins: () => ['https://www.google.com'],
    fields: [
      { name: 'nombre_lugar', kind: 'text', label: 'ms.f.loc_nombre', max: 80 },
      { name: 'direccion', kind: 'text', label: 'ms.f.loc_direccion', max: 200, required: true },
      { name: 'lat', kind: 'number', label: 'ms.f.loc_lat', min: -90, max: 90, step: 0.000001 },
      { name: 'lng', kind: 'number', label: 'ms.f.loc_lng', min: -180, max: 180, step: 0.000001 },
      { name: 'referencias', kind: 'text', label: 'ms.f.loc_ref', max: 200 },
      { name: 'estacionamiento', kind: 'text', label: 'ms.f.loc_parking', max: 120 },
      { name: 'timezone', kind: 'select', label: 'account.timezone', options: TZ, default: 'America/Mexico_City' },
      { name: 'horario', kind: 'rows', label: 'bio.f.hours_items', maxRows: 21, minRows: 0, columns: HOUR_COLS },
    ],
    prepare: async (data) => {
      const { lat, lng } = data
      // coordenadas completas o ninguna
      if ((lat === null) !== (lng === null)) return { field: lat === null ? 'lat' : 'lng', error: 'err.required' }
      return { data: {} }
    },
    render: location,
    summary: (b) => s(b.data.nombre_lugar) || s(b.data.direccion),
  },
]
