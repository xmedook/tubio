import { html, raw, type SafeHtml } from '../../lib/html.ts'
import type { T } from '../../lib/i18n.ts'
import { contrastInk } from '../../lib/qr.ts'
import { imageUrl } from '../../lib/uploads.ts'
import type { BlockRow } from '../bio/blocks.ts'
import type { MsPage, MsSection, Site } from './repo.ts'
import { homePage, sectionsOf } from './repo.ts'
import type { Action, SectionData } from './schema.ts'

export type Chrome = { alias: string; title: string }

/** Ruta pública de una página del sitio (relativa: sirve igual en tubio.link y en dominio propio) */
export function pageHref(alias: string, slug: string): string {
  return slug ? `/${alias}/${slug}` : `/${alias}`
}

const digits = (v: string) => v.replace(/\D/g, '')

/** Destino de una acción; null si no hay a dónde ir (se omite el botón) */
export function actionHref(a: { tipo: Action['tipo'] | 'pagina' | 'ancla' | 'enlace'; destino: string; mensaje?: string }, site: Site, alias: string): string | null {
  const d = a.destino.trim()
  switch (a.tipo) {
    case 'enlace':
      return /^https?:\/\//i.test(d) ? d : null
    case 'whatsapp': {
      const n = digits(d) || site.config.whatsapp
      if (!n) return null
      return `https://wa.me/${n}${a.mensaje ? `?text=${encodeURIComponent(a.mensaje)}` : ''}`
    }
    case 'llamar': {
      const n = digits(d)
      return n ? `tel:+${n}` : null
    }
    case 'pagina': {
      const slug = d.replace(/^\/+/, '')
      return site.pages.some((p) => p.slug === slug && p.is_enabled) || slug === '' ? pageHref(alias, slug) : null
    }
    case 'ancla':
      return /^[a-z0-9][a-z0-9-]{0,39}$/.test(d.replace(/^#/, '')) ? `#${d.replace(/^#/, '')}` : null
  }
}

const isExternal = (href: string) => /^https?:\/\//.test(href)

function actionLink(a: Action, site: Site, alias: string, cls: string): SafeHtml {
  const href = actionHref(a, site, alias)
  if (!href || !a.texto) return html``
  return html`<a class="${cls}" href="${href}"${isExternal(href) ? html` target="_blank" rel="noopener"` : ''}>${a.texto}</a>`
}

/** Variables y relleno de una sección; sólo valores validados (hex, enumeraciones, llaves de imagen) */
export function sectionCss(s: MsSection): string {
  const d: SectionData = s.data
  const rules: string[] = []
  let ink: string | null = null
  if (d.fondo === 'color') {
    rules.push(`background:${d.color}`)
    ink = contrastInk(d.color)
  } else if (d.fondo === 'degradado') {
    rules.push(`background:linear-gradient(${d.angulo}deg,${d.color},${d.color2})`)
    ink = contrastInk(d.color)
  } else if (d.fondo === 'imagen' && d.imagen) {
    rules.push(`background:#222 url("/_/u/${d.imagen}") center / cover no-repeat`, `--ms-veil:rgb(0 0 0 / ${d.oscurecer}%)`)
    ink = '#ffffff'
  }
  if (ink) rules.push(`color:${ink}`, `--text:${ink}`, `--ms-ink:${ink}`)
  return rules.length ? `#s${s.id}{${rules.join(';')}}` : ''
}

export function siteCss(sections: MsSection[]): string {
  return sections.map(sectionCss).join('')
}

type BodyArgs = {
  t: T
  site: Site
  page: MsPage
  alias: string
  /** nombre mostrado cuando la cabecera no trae uno */
  title: string
  /** secciones a pintar en lugar de las del sitio (ficha de propiedad, que no es una página guardada) */
  sections?: MsSection[]
  /** bloques visibles de la página, ya filtrados por plan, agrupados por sección */
  grouped: Map<number, BlockRow[]>
  renderBlock: (b: BlockRow, i: number) => SafeHtml
  /** pie de tubio («hecho con») y enlace de reporte: los pone el render principal */
  legal: SafeHtml
}

export function renderSiteBody(a: BodyArgs): { top: SafeHtml; main: SafeHtml; bottom: SafeHtml; hasBar: boolean; hasDock: boolean } {
  const { t, site, page, alias, title } = a
  const c = site.config
  const sections = (a.sections ?? sectionsOf(site, page.id)).filter((s) => s.is_enabled && (a.grouped.get(s.id)?.length || !s.data.classic || s.data.titulo))
  const home = pageHref(alias, homePage(site).slug)

  // navegación de la cabecera
  let nav: SafeHtml = html``
  if (c.cabecera.activa && c.cabecera.nav === 'auto') {
    const items = sections.filter((s) => s.data.ancla && s.data.titulo)
    if (items.length) nav = html`<nav class="ms-nav" aria-label="${t('ms.nav')}">${items.map((s) => html`<a href="#${s.data.ancla}">${s.data.antetitulo || s.data.titulo}</a>`)}</nav>`
  } else if (c.cabecera.activa && c.cabecera.nav === 'manual' && c.cabecera.nav_manual.length) {
    const items = c.cabecera.nav_manual
      .map((n) => ({ n, href: actionHref({ tipo: n.tipo, destino: n.destino }, site, alias) }))
      .filter((x) => x.href && x.n.texto)
    if (items.length) nav = html`<nav class="ms-nav" aria-label="${t('ms.nav')}">${items.map((x) => html`<a href="${x.href}"${isExternal(x.href as string) ? html` target="_blank" rel="noopener"` : ''}>${x.n.texto}</a>`)}</nav>`
  }

  const brand = c.cabecera.logo
    ? html`<img src="${imageUrl(c.cabecera.logo)}" alt="${c.cabecera.nombre || title}" class="ms-logo-img" height="32">${c.cabecera.nombre ? html`<span class="ms-logo-name">${c.cabecera.nombre}</span>` : ''}`
    : html`<span class="ms-logo-name">${c.cabecera.nombre || title}</span>`
  const top = c.cabecera.activa
    ? html`<header class="ms-bar" data-ms-bar><div class="ms-bar-in"><a class="ms-logo" href="${home}">${brand}</a>${actionLink(c.cabecera.cta, site, alias, 'ms-cta')}</div>${nav}</header>`
    : html``

  let n = 0
  // si la página tiene portada, ella es el h1 y los títulos de sección son h2
  let firstTitled = ![...a.grouped.values()].some((l) => l.some((b) => b.type === 'hero'))
  const body = sections.map((s) => {
    const d = s.data
    const blocks = a.grouped.get(s.id) ?? []
    const H = d.titulo && firstTitled ? 'h1' : 'h2'
    if (d.titulo) firstTitled = false
    const head =
      d.antetitulo || d.titulo || d.subtitulo
        ? html`<div class="ms-head">${d.antetitulo ? html`<p class="ms-k">${d.antetitulo}</p>` : ''}${d.titulo ? raw(`<${H} class="ms-h">`) : ''}${d.titulo}${d.titulo ? raw(`</${H}>`) : ''}${d.subtitulo ? html`<p class="ms-sub">${d.subtitulo}</p>` : ''}</div>`
        : ''
    const cls = ['ms-sec', `alto-${d.alto}`, d.relleno === 'ninguno' ? 'rel-ninguno' : '', d.classic ? 'is-classic' : '', d.fondo !== 'ninguno' ? 'has-fondo' : '', d.fondo === 'imagen' && d.imagen ? 'has-veil' : ''].filter(Boolean).join(' ')
    return html`<section class="${cls}"${d.ancla ? html` id="${d.ancla}"` : ''} data-sec="${s.id}"><div class="ms-fx" id="s${s.id}"><div class="ms-in w-${d.ancho} al-${d.alinear}">${head}<div class="ms-blocks cols-${d.columnas}">${blocks.map((b) => a.renderBlock(b, n++))}</div></div></div></section>`
  })

  const f = c.pie
  const foot = html`<footer class="ms-foot"><div class="ms-in w-normal">${f.activo ? html`${f.servicios ? html`<p class="ms-foot-s">${f.servicios}</p>` : ''}${f.direccion ? html`<p class="ms-foot-a">${f.direccion}</p>` : ''}${f.texto ? html`<p class="ms-foot-t">${f.texto}</p>` : ''}` : ''}${a.legal}</div></footer>`

  const dockItems = c.barra.activa ? c.barra.acciones.filter((x) => actionHref(x, site, alias) && x.texto) : []
  const dock = dockItems.length
    ? html`<nav class="ms-dock n${dockItems.length}" aria-label="${t('ms.dock')}">${dockItems.map((x, i) => actionLink(x, site, alias, i === 0 ? 'ms-act primary' : 'ms-act'))}</nav>`
    : html``

  return {
    top,
    main: html`<main class="ms-main" data-ms>${body.length ? body : html`<p class="para empty">${t('bio.empty_public')}</p>`}</main>${foot}`,
    bottom: dock,
    hasBar: c.cabecera.activa,
    hasDock: dockItems.length > 0,
  }
}
