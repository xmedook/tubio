// Bloques de minisitio de servicios profesionales / salud: perfil con credenciales, línea de confianza, categorías con foto,
// tarjetas con foto y carrusel de videos. Las listas son filas repetibles (con columna de imagen cuando hace falta).
import { html, raw, type SafeHtml } from '../../lib/html.ts'
import { renderMarkdown } from '../../lib/markdown.ts'
import { imageUrl } from '../../lib/uploads.ts'
import type { BlockDef, BlockRow, RenderCtx } from './blocks.ts'
import { mediaUrl, tiktokEmbed, vimeoEmbed, youtubeEmbed, type Embed } from './embeds.ts'

const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const rows = (b: BlockRow, name: string): Record<string, unknown>[] => (Array.isArray(b.data[name]) ? (b.data[name] as Record<string, unknown>[]) : [])
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/

/** Campo de la fila que lleva el enlace de cada bloque con tarjetas */
const LINK_FIELD: Record<string, string> = { category_grid: 'enlace', photo_cards: 'enlace', video_carousel: 'cta_enlace' }

/** Destino de un clic (`/_/c/:id?to=<fila>`) en los bloques con enlace https */
export function saludTarget(b: BlockRow, to: string | undefined): string | null {
  const f = LINK_FIELD[b.type]
  if (!f || to === undefined || !/^\d{1,2}$/.test(to)) return null
  const v = s(rows(b, 'items')[Number(to)]?.[f]).trim()
  return /^https:\/\//i.test(v) ? v : null
}

/** Enlace de una tarjeta: página del sitio (slug), ancla (#…) o https (cuenta clic); null si no hay */
function cardHref(rc: RenderCtx, b: BlockRow, i: number, v: unknown): string | null {
  const x = s(v).trim()
  if (/^https:\/\//i.test(x)) return `/_/c/${b.id}?to=${i}`
  if (/^#[a-z0-9][a-z0-9-]{0,39}$/.test(x)) return x
  const slug = x.replace(/^\/+/, '').toLowerCase()
  return SLUG.test(slug) ? `/${rc.site.alias}/${slug}` : null
}

// ------------------------------------------------------------------ Perfil profesional
const profile: BlockDef = {
  type: 'profile',
  group: 'site',
  fields: [
    { name: 'foto', kind: 'image', label: 'ms.f.pf_foto', maxDim: 900 },
    { name: 'nombre', kind: 'text', label: 'ms.f.pf_nombre', max: 100, required: true },
    { name: 'especialidad', kind: 'text', label: 'ms.f.pf_especialidad', max: 120 },
    { name: 'bio', kind: 'textarea', label: 'ms.f.pf_bio', max: 4000, rows: 8, hint: 'bio.f.markdown_hint' },
    {
      name: 'credenciales',
      kind: 'rows',
      label: 'ms.f.pf_cred',
      maxRows: 10,
      minRows: 0,
      columns: [
        { name: 'etiqueta', label: 'ms.f.pf_c_etiqueta', type: 'text', max: 60 },
        { name: 'valor', label: 'ms.f.pf_c_valor', type: 'text', max: 120 },
        { name: 'nota', label: 'ms.f.pf_c_nota', type: 'text', max: 120 },
      ],
    },
    { name: 'enlace_verificacion', kind: 'url', label: 'ms.f.pf_verif', schemes: 'web', placeholder: 'https://' },
    { name: 'texto_verificacion', kind: 'text', label: 'ms.f.pf_verif_texto', max: 60 },
  ],
  render: (rc, b) => {
    const cred = rows(b, 'credenciales').filter((c) => s(c.etiqueta) && s(c.valor))
    return html`<article class="prof">
  ${b.data.foto ? html`<img class="prof-img" src="${imageUrl(s(b.data.foto)) ?? ''}" alt="${s(b.data.nombre)}" width="480" height="600" loading="lazy" decoding="async">` : ''}
  <div class="prof-b">
    <h3 class="prof-n">${s(b.data.nombre)}</h3>
    ${b.data.especialidad ? html`<p class="prof-e">${s(b.data.especialidad)}</p>` : ''}
    ${b.data.bio ? html`<div class="prof-bio md">${raw(renderMarkdown(s(b.data.bio)))}</div>` : ''}
    ${cred.length ? html`<dl class="prof-c">${cred.map((c) => html`<div><dt>${s(c.etiqueta)}</dt><dd>${s(c.valor)}${c.nota ? html`<small>${s(c.nota)}</small>` : ''}</dd></div>`)}</dl>` : ''}
    ${/^https?:\/\//.test(s(b.data.enlace_verificacion)) ? html`<p class="prof-v"><a href="/_/c/${b.id}?to=verif" rel="noopener">${s(b.data.texto_verificacion) || rc.t('ms.sal.verify')} ↗</a></p>` : ''}
  </div>
</article>`
  },
  summary: (b) => s(b.data.nombre),
}

// ------------------------------------------------------------------ Línea de confianza
const trustLine: BlockDef = {
  type: 'trust_line',
  group: 'site',
  fields: [{ name: 'items', kind: 'rows', label: 'ms.f.tl_items', maxRows: 4, columns: [{ name: 'texto', label: 'ms.f.tl_texto', type: 'text', max: 60, required: true }] }],
  render: (_rc, b) => html`<ul class="trust">${rows(b, 'items').filter((r) => s(r.texto)).map((r) => html`<li>${s(r.texto)}</li>`)}</ul>`,
  summary: (b) => rows(b, 'items').map((r) => s(r.texto)).join(' · '),
}

// ------------------------------------------------------------------ Categorías / opciones (cuadrícula numerada con foto)
const categoryGrid: BlockDef = {
  type: 'category_grid',
  group: 'site',
  clickable: true,
  fields: [
    { name: 'titulo', kind: 'text', label: 'ms.f.cat_titulo', max: 80 },
    {
      name: 'items',
      kind: 'rows',
      label: 'ms.f.cg_items',
      maxRows: 12,
      columns: [
        { name: 'foto', label: 'ms.f.cg_foto', type: 'image', maxDim: 800 },
        { name: 'titulo', label: 'ms.f.cg_titulo', type: 'text', max: 60, required: true },
        { name: 'sub_items', label: 'ms.f.cg_sub', type: 'text', max: 200 },
        { name: 'enlace', label: 'ms.f.card_enlace', type: 'text', max: 300 },
        { name: 'texto_enlace', label: 'ms.f.cg_texto_enlace', type: 'text', max: 30 },
      ],
    },
  ],
  render: (rc, b) => html`<div class="cgrid-w">${b.data.titulo ? html`<h2 class="mnu-h">${s(b.data.titulo)}</h2>` : ''}<ol class="cgrid">${rows(b, 'items').filter((r) => s(r.titulo)).map((r, i) => {
    const href = cardHref(rc, b, i, r.enlace)
    const subs = s(r.sub_items).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8)
    const inner = html`${r.foto ? html`<img class="cg-img" src="${imageUrl(s(r.foto)) ?? ''}" alt="" width="400" height="400" loading="lazy" decoding="async">` : ''}<span class="cg-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span class="cg-t">${s(r.titulo)}</span>${subs.length ? html`<span class="cg-s">${subs.join(' · ')}</span>` : ''}${href ? html`<span class="cg-l">${s(r.texto_enlace) || rc.t('ms.sal.more')} →</span>` : ''}`
    return html`<li>${href ? html`<a class="cg-c" href="${href}">${inner}</a>` : html`<div class="cg-c">${inner}</div>`}</li>`
  })}</ol></div>`,
  summary: (b) => s(b.data.titulo) || rows(b, 'items').map((r) => s(r.titulo)).join(' · '),
}

// ------------------------------------------------------------------ Tarjetas con foto
const photoCards: BlockDef = {
  type: 'photo_cards',
  group: 'site',
  clickable: true,
  fields: [
    {
      name: 'items',
      kind: 'rows',
      label: 'ms.f.pc_items',
      maxRows: 12,
      columns: [
        { name: 'foto', label: 'ms.f.cg_foto', type: 'image', maxDim: 900 },
        { name: 'antetitulo', label: 'ms.f.pc_antetitulo', type: 'text', max: 40 },
        { name: 'titulo', label: 'ms.f.cg_titulo', type: 'text', max: 80, required: true },
        { name: 'enlace', label: 'ms.f.card_enlace', type: 'text', max: 300 },
      ],
    },
  ],
  render: (rc, b) => html`<ul class="pcards">${rows(b, 'items').filter((r) => s(r.titulo)).map((r, i) => {
    const href = cardHref(rc, b, i, r.enlace)
    const inner = html`${r.foto ? html`<img class="pc-img" src="${imageUrl(s(r.foto)) ?? ''}" alt="" width="640" height="480" loading="lazy" decoding="async">` : ''}<span class="pc-b">${r.antetitulo ? html`<span class="pc-k">${s(r.antetitulo)}</span>` : ''}<span class="pc-t">${s(r.titulo)}</span></span>${href ? html`<span class="pc-ar" aria-hidden="true">→</span>` : ''}`
    return html`<li>${href ? html`<a class="pc" href="${href}">${inner}</a>` : html`<div class="pc">${inner}</div>`}</li>`
  })}</ul>`,
  summary: (b) => rows(b, 'items').map((r) => s(r.titulo)).join(' · '),
}

// ------------------------------------------------------------------ Carrusel de videos
type Slide = { kind: 'embed'; src: string; poster: string | null } | { kind: 'file'; src: string }

function slideOf(url: string): Slide | null {
  const emb: Embed | null = youtubeEmbed(url) ?? vimeoEmbed(url) ?? tiktokEmbed(url)
  if (emb && emb.src.startsWith('https://')) {
    const yt = /youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/.exec(emb.src)?.[1]
    return { kind: 'embed', src: emb.src, poster: yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : null }
  }
  const f = mediaUrl(url, 'video')
  return f ? { kind: 'file', src: f } : null
}

const videoCarousel: BlockDef = {
  type: 'video_carousel',
  group: 'site',
  clickable: true,
  fields: [
    { name: 'titulo', kind: 'text', label: 'ms.f.cat_titulo', max: 80 },
    {
      name: 'items',
      kind: 'rows',
      label: 'ms.f.vc_items',
      maxRows: 10,
      columns: [
        { name: 'video', label: 'ms.f.vc_video', type: 'url', max: 500, required: true },
        { name: 'foto', label: 'ms.f.vc_poster', type: 'image', maxDim: 700 },
        { name: 'titulo', label: 'ms.f.cg_titulo', type: 'text', max: 80 },
        { name: 'categoria', label: 'ms.f.cg_categoria', type: 'text', max: 40 },
        { name: 'cta_texto', label: 'ms.f.vc_cta_texto', type: 'text', max: 30 },
        { name: 'cta_enlace', label: 'ms.f.card_enlace', type: 'text', max: 300 },
      ],
    },
  ],
  frameOrigins: (b) => {
    const out: string[] = []
    for (const r of rows(b, 'items')) {
      const sl = slideOf(s(r.video))
      if (sl?.kind === 'embed') out.push(new URL(sl.src).origin)
    }
    return [...new Set(out)]
  },
  render: (rc, b) => {
    const list = rows(b, 'items').map((r, i) => ({ r, i, sl: slideOf(s(r.video)) })).filter((x) => x.sl)
    if (!list.length) return html``
    return html`<div class="vcar-w" data-vcar>${b.data.titulo ? html`<h2 class="mnu-h">${s(b.data.titulo)}</h2>` : ''}<ul class="vcar" tabindex="0" aria-label="${s(b.data.titulo) || rc.t('bio.type_video_carousel')}">${list.map(({ r, i, sl }) => {
      const sli = sl as Slide
      const poster = r.foto ? imageUrl(s(r.foto)) : sli.kind === 'embed' ? sli.poster : null
      const href = cardHref(rc, b, i, r.cta_enlace)
      const title = s(r.titulo) || rc.t('ms.sal.video')
      return html`<li class="vs" data-vs data-kind="${sli.kind}" data-src="${sli.src}">
        <button type="button" class="vs-play" data-vs-play aria-label="${rc.t('ms.sal.play', { title })}">${poster ? html`<img src="${poster}" alt="" loading="lazy" decoding="async">` : ''}<span class="vs-ic" aria-hidden="true">▶</span></button>
        ${sli.kind === 'file' ? html`<button type="button" class="vs-snd" data-vs-snd data-off-text="${rc.t('ms.sal.sound_off')}" aria-pressed="false" hidden>${rc.t('ms.sal.sound_on')}</button>` : ''}
        <div class="vs-i">${r.categoria ? html`<span class="vs-k">${s(r.categoria)}</span>` : ''}<span class="vs-t">${title}</span>${href && r.cta_texto ? html`<a class="vs-cta" href="${href}">${s(r.cta_texto)} →</a>` : ''}</div>
      </li>`
    })}</ul></div>`
  },
  summary: (b) => s(b.data.titulo) || `${rows(b, 'items').length} videos`,
}

export const SALUD_BLOCKS: BlockDef[] = [profile, trustLine, categoryGrid, photoCards, videoCarousel]
