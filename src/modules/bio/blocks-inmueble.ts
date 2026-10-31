// Inmobiliaria y fitness: propiedades con filtros y ficha propia, horario semanal de clases y programas.
import { html, type SafeHtml } from '../../lib/html.ts'
import { imageUrl } from '../../lib/uploads.ts'
import type { DB } from '../../db/index.ts'
import type { BlockDef, BlockRow, RenderCtx } from './blocks.ts'
import { DAYS } from './blocks-business.ts'

const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const rows = (b: BlockRow, name: string): Record<string, unknown>[] => (Array.isArray(b.data[name]) ? (b.data[name] as Record<string, unknown>[]) : [])

const OPS = ['venta', 'renta']
const TIPOS = ['casa', 'departamento', 'terreno', 'local', 'oficina', 'bodega']
const ESTADOS = ['disponible', 'apartada', 'vendida']

export type Property = { n: number; titulo: string; operacion: string; tipo: string; precio: string; rec: number | null; banos: number | null; m2: number | null; colonia: string; desc: string; estado: string; fotos: string[] }

function propsOf(b: BlockRow): Property[] {
  return rows(b, 'items')
    .filter((r) => s(r.titulo).trim())
    .map((r, i) => ({
      n: i + 1,
      titulo: s(r.titulo).trim(),
      operacion: OPS.includes(s(r.operacion)) ? s(r.operacion) : 'venta',
      tipo: TIPOS.includes(s(r.tipo)) ? s(r.tipo) : 'casa',
      precio: s(r.precio).trim(),
      rec: num(r.recamaras),
      banos: num(r.banos),
      m2: num(r.m2),
      colonia: s(r.colonia).trim(),
      desc: s(r.descripcion).trim(),
      estado: ESTADOS.includes(s(r.estado)) ? s(r.estado) : 'disponible',
      fotos: [r.foto, r.foto2, r.foto3, r.foto4].map(s).filter(Boolean),
    }))
}

/** Propiedad n (1-based, contando las que tienen título) del primer bloque de propiedades activo del sitio */
export function findProperty(db: DB, linkId: number, n: number): { block: BlockRow; prop: Property; backSlug: string } | null {
  const row = db.prepare("SELECT * FROM bio_blocks WHERE link_id = ? AND type = 'listings' AND is_enabled = 1 ORDER BY position, id LIMIT 1").get(linkId) as (Omit<BlockRow, 'data' | 'style'> & { data: string; style: string }) | undefined
  if (!row) return null
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(row.data)
  } catch {
    return null
  }
  const block = { ...row, data, style: {} } as BlockRow
  const prop = propsOf(block).find((p) => p.n === n)
  if (!prop) return null
  const back = (row.section_id !== null ? (db.prepare('SELECT p.slug FROM ms_sections s JOIN ms_pages p ON p.id = s.page_id WHERE s.id = ?').pluck().get(row.section_id) as string | undefined) : '') ?? ''
  return { block, prop, backSlug: back }
}

const spec = (rc: RenderCtx, p: Property): SafeHtml =>
  html`<ul class="pr-sp">${p.rec !== null ? html`<li>${rc.t('ms.inm.rec', { n: p.rec })}</li>` : ''}${p.banos !== null ? html`<li>${rc.t('ms.inm.banos', { n: p.banos })}</li>` : ''}${p.m2 !== null ? html`<li>${p.m2} m²</li>` : ''}</ul>`

function listings(rc: RenderCtx, b: BlockRow): SafeHtml {
  const list = propsOf(b)
  if (!list.length) return html``
  const tipos = [...new Set(list.map((p) => p.tipo))]
  const ops = [...new Set(list.map((p) => p.operacion))]
  const filt = list.length > 2
  return html`<div class="prl" data-prl>
  ${b.data.titulo ? html`<h2 class="mnu-h">${s(b.data.titulo)}</h2>` : ''}
  ${filt ? html`<form class="prl-f" data-prl-f hidden aria-label="${rc.t('ms.inm.filters')}">
    ${ops.length > 1 ? html`<label>${rc.t('ms.inm.op')}<select name="op" class="wa-in"><option value="">${rc.t('ms.inm.any')}</option>${ops.map((o) => html`<option value="${o}">${rc.t(`ms.inm.o.${o}`)}</option>`)}</select></label>` : ''}
    ${tipos.length > 1 ? html`<label>${rc.t('ms.inm.tipo')}<select name="tipo" class="wa-in"><option value="">${rc.t('ms.inm.any')}</option>${tipos.map((o) => html`<option value="${o}">${rc.t(`ms.inm.t.${o}`)}</option>`)}</select></label>` : ''}
    <label>${rc.t('ms.inm.rec_min')}<select name="rec" class="wa-in"><option value="">${rc.t('ms.inm.any')}</option>${[1, 2, 3, 4].map((n) => html`<option value="${n}">${n}+</option>`)}</select></label>
    <p class="prl-n" data-prl-n aria-live="polite"></p>
  </form>` : ''}
  <ul class="prl-l">${list.map((p) => html`<li class="prc st-${p.estado}" data-pr data-op="${p.operacion}" data-tipo="${p.tipo}" data-rec="${p.rec ?? 0}">
    <a class="prc-a" href="/${rc.site.alias}/propiedad/${p.n}">
      ${p.fotos[0] ? html`<img class="prc-img" src="${imageUrl(p.fotos[0]) ?? ''}" alt="" width="640" height="480" loading="lazy" decoding="async">` : html`<span class="prc-img"></span>`}
      <span class="prc-b">
        <span class="prc-top"><span class="prc-badge">${rc.t(`ms.inm.o.${p.operacion}`)}</span>${p.estado !== 'disponible' ? html`<span class="prc-badge est">${rc.t(`ms.inm.e.${p.estado}`)}</span>` : ''}</span>
        ${p.precio ? html`<span class="prc-p">${p.precio}</span>` : ''}
        <span class="prc-t">${p.titulo}</span>
        ${p.colonia ? html`<span class="prc-c">${p.colonia}</span>` : ''}
        ${spec(rc, p)}
      </span>
    </a>
  </li>`)}</ul></div>`
}

/** Ficha de una propiedad (bloque virtual de /<alias>/propiedad/<n>; no sale en el selector) */
const listingDetail: BlockDef = {
  type: 'listing_detail',
  group: 'site',
  hidden: true,
  fields: [],
  render: (rc, b) => {
    const p = b.data as unknown as Property & { back: string; wa: string }
    const msg = rc.t('ms.inm.wa_msg', { negocio: rc.site.title, titulo: p.titulo, precio: p.precio })
    return html`<article class="prd">
  <p class="prd-back"><a href="/${rc.site.alias}${p.back ? `/${p.back}` : ''}">← ${rc.t('ms.inm.back')}</a></p>
  <div class="prd-gal">${p.fotos.map((f, i) => html`<img src="${imageUrl(f) ?? ''}" alt="${i === 0 ? p.titulo : ''}" width="800" height="600"${i === 0 ? html` fetchpriority="high"` : html` loading="lazy"`} decoding="async">`)}</div>
  <div class="prc-top"><span class="prc-badge">${rc.t(`ms.inm.o.${p.operacion}`)}</span><span class="prc-badge">${rc.t(`ms.inm.t.${p.tipo}`)}</span>${p.estado !== 'disponible' ? html`<span class="prc-badge est">${rc.t(`ms.inm.e.${p.estado}`)}</span>` : ''}</div>
  <h1 class="prd-t">${p.titulo}</h1>
  ${p.precio ? html`<p class="prd-p">${p.precio}</p>` : ''}
  ${p.colonia ? html`<p class="prc-c">${p.colonia}</p>` : ''}
  ${spec(rc, p)}
  ${p.desc ? html`<p class="prd-d">${p.desc}</p>` : ''}
  ${p.wa && p.estado !== 'vendida' ? html`<a class="btn prd-wa" href="https://wa.me/${p.wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${rc.t('ms.inm.ask')}</a>` : ''}
</article>`
  },
  summary: (b) => s(b.data.titulo),
}

// ------------------------------------------------------------------ Horario de clases
function schedule(rc: RenderCtx, b: BlockRow): SafeHtml {
  const clases = rows(b, 'items').filter((r) => s(r.nombre).trim() && (DAYS as readonly string[]).includes(s(r.dia)))
  if (!clases.length) return html``
  const book = !!rc.db.prepare("SELECT 1 FROM bio_blocks WHERE link_id = ? AND type = 'wa_request' AND is_enabled = 1 LIMIT 1").get(b.link_id)
  return html`<div class="sch" data-sch>${b.data.titulo ? html`<h2 class="mnu-h">${s(b.data.titulo)}</h2>` : ''}<div class="sch-g">${DAYS.map((d, di) => {
    const hoy = clases.filter((c) => c.dia === d).sort((x, y) => s(x.inicio).localeCompare(s(y.inicio)))
    if (!hoy.length) return ''
    return html`<section class="sch-d" data-day="${di}"><h3 class="sch-h">${rc.t(`bio.o.hours.day.${d}`)}<span class="sch-today" hidden> · ${rc.t('ms.sch.today')}</span></h3><ul>${hoy.map((c) => html`<li class="sch-c"><span class="sch-t">${s(c.inicio)}${c.fin ? `–${s(c.fin)}` : ''}</span><span class="sch-n">${s(c.nombre)}</span>${c.instructor ? html`<span class="sch-i">${s(c.instructor)}</span>` : ''}${num(c.cupo) ? html`<span class="sch-i">${rc.t('ms.sch.cupo', { n: num(c.cupo) as number })}</span>` : ''}${book ? html`<button type="button" class="mnu-book" data-wa-book="${s(c.nombre)}" data-wa-pref="clase">${rc.t('ms.sch.book')}</button>` : ''}</li>`)}</ul></section>`
  })}</div></div>`
}

// ------------------------------------------------------------------ Programas
function programs(rc: RenderCtx, b: BlockRow): SafeHtml {
  const list = rows(b, 'items').filter((r) => s(r.nombre).trim())
  if (!list.length) return html``
  const book = !!rc.db.prepare("SELECT 1 FROM bio_blocks WHERE link_id = ? AND type = 'wa_request' AND is_enabled = 1 LIMIT 1").get(b.link_id)
  return html`<div class="prog-w">${b.data.titulo ? html`<h2 class="mnu-h">${s(b.data.titulo)}</h2>` : ''}<ul class="prog">${list.map((r) => html`<li class="prg">
    ${r.foto ? html`<img class="prg-img" src="${imageUrl(s(r.foto)) ?? ''}" alt="" width="480" height="320" loading="lazy" decoding="async">` : ''}
    <div class="prg-b"><h3 class="prg-t">${s(r.nombre)}</h3>
    <p class="prg-m">${[s(r.nivel) && rc.t(`ms.prog.nivel.${s(r.nivel)}`), s(r.duracion), s(r.precio)].filter(Boolean).join(' · ')}</p>
    ${r.descripcion ? html`<p class="prg-d">${s(r.descripcion)}</p>` : ''}
    ${book ? html`<button type="button" class="mnu-book" data-wa-book="${s(r.nombre)}" data-wa-pref="clase">${rc.t('ms.sch.book')}</button>` : ''}</div>
  </li>`)}</ul></div>`
}

export const INMUEBLE_BLOCKS: BlockDef[] = [
  {
    type: 'listings',
    group: 'site',
    clickable: false,
    fields: [
      { name: 'titulo', kind: 'text', label: 'ms.f.cat_titulo', max: 80 },
      {
        name: 'items',
        kind: 'rows',
        label: 'ms.f.inm_items',
        maxRows: 12,
        columns: [
          { name: 'titulo', label: 'ms.f.cg_titulo', type: 'text', max: 90, required: true },
          { name: 'operacion', label: 'ms.f.inm_op', type: 'select', options: OPS },
          { name: 'tipo', label: 'ms.f.inm_tipo', type: 'select', options: TIPOS },
          { name: 'precio', label: 'ms.f.cat_precio', type: 'text', max: 30 },
          { name: 'recamaras', label: 'ms.f.inm_rec', type: 'number' },
          { name: 'banos', label: 'ms.f.inm_banos', type: 'number' },
          { name: 'm2', label: 'ms.f.inm_m2', type: 'number' },
          { name: 'colonia', label: 'ms.f.inm_colonia', type: 'text', max: 80 },
          { name: 'estado', label: 'ms.f.inm_estado', type: 'select', options: ESTADOS },
          { name: 'descripcion', label: 'ms.f.cat_desc', type: 'textarea', max: 800 },
          { name: 'foto', label: 'ms.f.inm_foto1', type: 'image', maxDim: 1200 },
          { name: 'foto2', label: 'ms.f.inm_foto2', type: 'image', maxDim: 1200 },
          { name: 'foto3', label: 'ms.f.inm_foto3', type: 'image', maxDim: 1200 },
          { name: 'foto4', label: 'ms.f.inm_foto4', type: 'image', maxDim: 1200 },
        ],
      },
    ],
    render: listings,
    summary: (b) => s(b.data.titulo) || `${propsOf(b).length} propiedades`,
  },
  listingDetail,
  {
    type: 'class_schedule',
    group: 'site',
    fields: [
      { name: 'titulo', kind: 'text', label: 'ms.f.cat_titulo', max: 80 },
      {
        name: 'items',
        kind: 'rows',
        label: 'ms.f.sch_items',
        maxRows: 40,
        columns: [
          { name: 'nombre', label: 'ms.f.sch_nombre', type: 'text', max: 60, required: true },
          { name: 'dia', label: 'ms.f.sch_dia', type: 'select', options: [...DAYS] },
          { name: 'inicio', label: 'ms.f.sch_inicio', type: 'time' },
          { name: 'fin', label: 'ms.f.sch_fin', type: 'time' },
          { name: 'instructor', label: 'ms.f.sch_instructor', type: 'text', max: 60 },
          { name: 'cupo', label: 'ms.f.sch_cupo', type: 'number' },
        ],
      },
    ],
    render: schedule,
    summary: (b) => s(b.data.titulo) || `${rows(b, 'items').length} clases`,
  },
  {
    type: 'programs',
    group: 'site',
    fields: [
      { name: 'titulo', kind: 'text', label: 'ms.f.cat_titulo', max: 80 },
      {
        name: 'items',
        kind: 'rows',
        label: 'ms.f.prog_items',
        maxRows: 8,
        columns: [
          { name: 'nombre', label: 'ms.f.sch_nombre', type: 'text', max: 60, required: true },
          { name: 'descripcion', label: 'ms.f.cat_desc', type: 'text', max: 240 },
          { name: 'nivel', label: 'ms.f.prog_nivel', type: 'select', options: ['todos', 'principiante', 'intermedio', 'avanzado'] },
          { name: 'duracion', label: 'ms.f.prog_duracion', type: 'text', max: 40 },
          { name: 'precio', label: 'ms.f.cat_precio', type: 'text', max: 30 },
          { name: 'foto', label: 'ms.f.cg_foto', type: 'image', maxDim: 800 },
        ],
      },
    ],
    render: programs,
    summary: (b) => s(b.data.titulo) || `${rows(b, 'items').filter((r) => s(r.nombre)).length} programas`,
  },
]
