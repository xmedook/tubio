import { html, type SafeHtml } from '../../lib/html.ts'
import { imageUrl } from '../../lib/uploads.ts'
import { icon } from '../../views/icons.ts'
import { ASSET_VERSION, panelLayout } from '../../views/layout.ts'
import { checkbox, csrfField, input, postButton, select, type Errors } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import { type Link } from '../links/repo.ts'
import { linkTabs } from '../links/views.ts'
import { blockIcon, preview, viewToggle } from '../bio/views.ts'
import { BLOCKS } from '../bio/blocks.ts'
import type { MsPage, MsSection, Site } from './repo.ts'
import { sectionsOf } from './repo.ts'
import { ACTION_TYPES, ALTOS, ANCHOS, FONDO_TIPOS, MS_MAX_NAV, MS_MAX_PAGES, MS_MAX_SECTIONS, type Action, type SectionData, type SiteConfig } from './schema.ts'

const GROUPS = ['site', 'basic', 'business', 'capture', 'social', 'media'] as const

const head = (ctx: Ctx) => html`<script type="module" src="/_/static/js/editor.js?v=${ASSET_VERSION}" nonce="${ctx.nonce}"></script>`

const opts = (ctx: Ctx, key: string, values: readonly string[]) => values.map((v) => ({ value: v, label: ctx.t(`ms.${key}.${v}`) }))

function imageOpt(ctx: Ctx, name: string, label: string, key: string | null): SafeHtml {
  return html`<div class="img-field">
  ${key ? html`<img class="img-preview" src="${imageUrl(key)}" alt="">` : ''}
  ${input({ ctx, name, type: 'file', label: key ? `${label} — ${ctx.t('bio.f.replace_image')}` : label, accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif' })}
  ${key ? checkbox({ name: `${name}__remove`, label: ctx.t('bio.f.remove_image') }) : ''}
</div>`
}

function actionFields(ctx: Ctx, prefix: string, a: Action, errors: Errors, legend: string): SafeHtml {
  const { t } = ctx
  return html`<fieldset class="ms-action"><legend>${legend}</legend>
  <div class="grid-2">
    ${input({ ctx, name: `${prefix}_texto`, label: t('ms.a.texto'), value: a.texto, maxlength: 24 })}
    ${select({ ctx, name: `${prefix}_tipo`, label: t('ms.a.tipo'), value: a.tipo, options: opts(ctx, 'a', ACTION_TYPES) })}
  </div>
  ${input({ ctx, name: `${prefix}_destino`, label: t('ms.a.destino'), value: a.destino, error: errors[`${prefix}_destino`], maxlength: 2048, hint: t('ms.a.destino_hint') })}
  ${input({ ctx, name: `${prefix}_mensaje`, label: t('ms.a.mensaje'), value: a.mensaje, maxlength: 300 })}
</fieldset>`
}

// ---------------------------------------------------------------- pestaña «Sitio»
export function sitePage(ctx: Ctx, link: Link, site: Site, cfg: SiteConfig, errors: Errors = {}): SafeHtml {
  const { t } = ctx
  const c = cfg.cabecera
  const emptyAct: Action = { texto: '', tipo: 'enlace', destino: '', mensaje: '' }
  return panelLayout(ctx, {
    title: t('ms.tab'),
    active: 'links',
    path: `/panel/links/${link.id}/site`,
    wide: true,
    head: head(ctx),
    body: html`${linkTabs(ctx, link, 'site')}
${viewToggle(ctx)}
<div class="editor" data-editor>
  <section class="editor-main">
    <p class="muted">${t('ms.intro')}</p>

    <h2>${t('ms.pages')}</h2>
    <ol class="blocks ms-pages">
      ${site.pages.map(
        (p, i) => html`<li class="blk${p.is_enabled ? '' : ' off'}">
        <a class="grow block-main" href="/panel/ms/pages/${p.id}"><span class="av s" aria-hidden="true">${icon('bio')}</span><span class="row-b"><span class="title">${p.slug === '' ? t('ms.page_home') : p.title || p.slug}</span><span class="sub">/${link.alias}${p.slug ? `/${p.slug}` : ''}${p.is_enabled ? '' : html` · <b>${t('bio.hidden')}</b>`}</span></span></a>
        ${site.materialized ? html`<details class="row-menu"><summary class="icon-btn" aria-label="${t('nav.more')}">${icon('more')}</summary><div class="menu-body">
          <a href="/panel/ms/pages/${p.id}">${t('common.edit')}</a>
          <a href="/panel/links/${link.id}/blocks?p=${p.id}">${t('ms.open_blocks')}</a>
          ${i > 0 ? postButton(ctx, `/panel/ms/pages/${p.id}/move`, t('bio.move_up'), { hidden: { dir: 'up' } }) : ''}
          ${i < site.pages.length - 1 ? postButton(ctx, `/panel/ms/pages/${p.id}/move`, t('bio.move_down'), { hidden: { dir: 'down' } }) : ''}
          ${p.slug !== '' ? postButton(ctx, `/panel/ms/pages/${p.id}/delete`, t('common.delete'), { cls: 'danger', confirm: t('ms.page_delete_confirm') }) : ''}
        </div></details>` : ''}
      </li>`,
      )}
    </ol>
    ${site.pages.length < MS_MAX_PAGES
      ? html`<details class="opt"${!site.materialized ? html` open` : ''}><summary>${t('ms.page_add')}</summary><div class="opt-body">
      <form method="post" action="/panel/links/${link.id}/site/pages">${csrfField(ctx)}
        ${input({ ctx, name: 'title', label: t('ms.page_title'), maxlength: 60, required: true, error: errors.title })}
        ${input({ ctx, name: 'slug', label: t('ms.page_slug'), maxlength: 40, hint: t('ms.page_slug_hint'), error: errors.slug })}
        <button class="btn btn-primary" type="submit">${t('ms.page_add')}</button>
      </form></div></details>`
      : html`<p class="muted">${t('ms.err_pages_limit', { n: MS_MAX_PAGES })}</p>`}

    <h2>${t('ms.site_settings')}</h2>
    ${Object.keys(errors).length ? html`<p class="flash flash-error" role="alert">${t('err.form')}</p>` : ''}
    <form method="post" action="/panel/links/${link.id}/site?_csrf=${encodeURIComponent(ctx.csrf)}" enctype="multipart/form-data" novalidate>
      ${input({ ctx, name: 'whatsapp', label: t('ms.whatsapp'), value: cfg.whatsapp, inputmode: 'numeric', maxlength: 15, hint: t('ms.whatsapp_hint'), error: errors.whatsapp })}

      <details class="opt"${c.activa ? html` open` : ''}><summary>${t('ms.header')}</summary><div class="opt-body">
        ${checkbox({ name: 'cab_activa', label: t('ms.header_on'), checked: c.activa })}
        ${input({ ctx, name: 'cab_nombre', label: t('ms.header_name'), value: c.nombre, maxlength: 40 })}
        ${imageOpt(ctx, 'cab_logo', t('ms.header_logo'), c.logo)}
        ${select({ ctx, name: 'cab_nav', label: t('ms.header_nav'), value: c.nav, options: opts(ctx, 'nav_mode', ['auto', 'manual', 'ninguna']) })}
        <p class="hint">${t('ms.header_nav_hint')}</p>
        ${Array.from({ length: MS_MAX_NAV }, (_, i) => c.nav_manual[i] ?? { texto: '', tipo: 'ancla' as const, destino: '' }).map(
          (n, i) => html`<div class="grid-3">
          ${input({ ctx, name: `nav_${i}_texto`, label: t('ms.nav_item', { n: i + 1 }), value: n.texto, maxlength: 24 })}
          ${select({ ctx, name: `nav_${i}_tipo`, label: t('ms.a.tipo'), value: n.tipo, options: opts(ctx, 'a', ['ancla', 'pagina', 'enlace']) })}
          ${input({ ctx, name: `nav_${i}_destino`, label: t('ms.a.destino'), value: n.destino, maxlength: 2048, error: errors[`nav_${i}_destino`] })}
        </div>`,
        )}
        ${actionFields(ctx, 'cta', c.cta, errors, t('ms.cta'))}
      </div></details>

      <details class="opt"${cfg.barra.activa ? html` open` : ''}><summary>${t('ms.dock_title')}</summary><div class="opt-body">
        ${checkbox({ name: 'bar_activa', label: t('ms.dock_on'), checked: cfg.barra.activa, hint: t('ms.dock_hint') })}
        ${[0, 1, 2].map((i) => actionFields(ctx, `bar_${i}`, cfg.barra.acciones[i] ?? emptyAct, errors, t('ms.action_n', { n: i + 1 })))}
      </div></details>

      <details class="opt"${cfg.pie.activo ? html` open` : ''}><summary>${t('ms.footer')}</summary><div class="opt-body">
        ${checkbox({ name: 'pie_activo', label: t('ms.footer_on'), checked: cfg.pie.activo })}
        ${input({ ctx, name: 'pie_servicios', label: t('ms.footer_services'), value: cfg.pie.servicios, maxlength: 160 })}
        ${input({ ctx, name: 'pie_direccion', label: t('ms.footer_address'), value: cfg.pie.direccion, maxlength: 160 })}
        ${input({ ctx, name: 'pie_texto', label: t('ms.footer_text'), value: cfg.pie.texto, maxlength: 200 })}
      </div></details>

      <div class="btn-row sticky-actions">
        <button class="btn btn-primary" type="submit">${t('common.save')}</button>
      </div>
    </form>
  </section>
  ${preview(ctx, link)}
</div>`,
  })
}

// ---------------------------------------------------------------- una página
export type PageValues = { title: string; slug: string; is_enabled: boolean; seo_title: string; seo_description: string; seo_image: string | null }

export function pageEditPage(ctx: Ctx, link: Link, site: Site, page: MsPage, v: PageValues, errors: Errors = {}): SafeHtml {
  const { t } = ctx
  const sections = sectionsOf(site, page.id)
  return panelLayout(ctx, {
    title: page.slug === '' ? t('ms.page_home') : page.title || page.slug,
    active: 'links',
    path: `/panel/ms/pages/${page.id}`,
    wide: true,
    head: head(ctx),
    body: html`${linkTabs(ctx, link, 'site')}
${viewToggle(ctx)}
<div class="editor" data-editor>
  <section class="editor-main">
    <p><a href="/panel/links/${link.id}/site">← ${t('ms.pages')}</a></p>
    <h2>${t('ms.page_edit', { name: page.slug === '' ? t('ms.page_home') : page.title || page.slug })}</h2>
    ${Object.keys(errors).length ? html`<p class="flash flash-error" role="alert">${t('err.form')}</p>` : ''}
    <form method="post" action="/panel/ms/pages/${page.id}?_csrf=${encodeURIComponent(ctx.csrf)}" enctype="multipart/form-data" novalidate>
      ${page.slug === ''
        ? html`<p class="muted">${t('ms.page_home_note')}</p>`
        : html`${input({ ctx, name: 'title', label: t('ms.page_title'), value: v.title, maxlength: 60, required: true, error: errors.title })}
        ${input({ ctx, name: 'slug', label: t('ms.page_slug'), value: v.slug, maxlength: 40, hint: t('ms.page_slug_hint'), error: errors.slug })}
        ${checkbox({ name: 'is_enabled', label: t('ms.page_enabled'), checked: v.is_enabled })}`}
      <details class="opt"><summary>${t('ms.seo')}</summary><div class="opt-body">
        ${input({ ctx, name: 'seo_title', label: t('ms.seo_title'), value: v.seo_title, maxlength: 70 })}
        ${input({ ctx, name: 'seo_description', label: t('ms.seo_description'), value: v.seo_description, maxlength: 200 })}
        ${imageOpt(ctx, 'seo_image', t('ms.seo_image'), v.seo_image)}
      </div></details>
      <div class="btn-row"><button class="btn btn-primary" type="submit">${t('common.save')}</button></div>
    </form>

    <h2>${t('ms.sections')}</h2>
    <ol class="blocks ms-sections">
      ${sections.map(
        (s, i) => html`<li class="blk${s.is_enabled ? '' : ' off'}">
        <a class="grow block-main" href="/panel/ms/sections/${s.id}"><span class="av s" aria-hidden="true">${icon('text')}</span><span class="row-b"><span class="title">${s.data.titulo || t('ms.section_n', { n: i + 1 })}</span><span class="sub">${s.data.ancla ? `#${s.data.ancla} · ` : ''}${t(`ms.s.fondo.${s.data.fondo}`)} · ${t(`ms.s.ancho.${s.data.ancho}`)}${s.is_enabled ? '' : html` · <b>${t('bio.hidden')}</b>`}</span></span></a>
        <details class="row-menu"><summary class="icon-btn" aria-label="${t('nav.more')}">${icon('more')}</summary><div class="menu-body">
          <a href="/panel/ms/sections/${s.id}">${t('common.edit')}</a>
          <a href="/panel/links/${link.id}/blocks?p=${page.id}#s${s.id}">${t('ms.open_blocks')}</a>
          ${i > 0 ? postButton(ctx, `/panel/ms/sections/${s.id}/move`, t('bio.move_up'), { hidden: { dir: 'up' } }) : ''}
          ${i < sections.length - 1 ? postButton(ctx, `/panel/ms/sections/${s.id}/move`, t('bio.move_down'), { hidden: { dir: 'down' } }) : ''}
          ${sections.length > 1 ? postButton(ctx, `/panel/ms/sections/${s.id}/delete`, t('common.delete'), { cls: 'danger', confirm: t('ms.section_delete_confirm') }) : ''}
        </div></details>
      </li>`,
      )}
    </ol>
    ${sections.length < MS_MAX_SECTIONS ? postButton(ctx, `/panel/ms/pages/${page.id}/sections`, t('ms.section_add'), { cls: 'btn' }) : html`<p class="muted">${t('ms.err_sections_limit', { n: MS_MAX_SECTIONS })}</p>`}
    <p><a class="btn btn-primary" href="/panel/links/${link.id}/blocks?p=${page.id}">${t('ms.open_blocks')}</a></p>
  </section>
  ${preview(ctx, link, page.slug)}
</div>`,
  })
}

// ---------------------------------------------------------------- una sección
export function sectionEditPage(ctx: Ctx, link: Link, page: MsPage, section: MsSection, d: SectionData, enabled: boolean, errors: Errors = {}): SafeHtml {
  const { t } = ctx
  return panelLayout(ctx, {
    title: d.titulo || t('ms.section_edit'),
    active: 'links',
    path: `/panel/ms/sections/${section.id}`,
    wide: true,
    head: head(ctx),
    body: html`${linkTabs(ctx, link, 'site')}
${viewToggle(ctx)}
<div class="editor" data-editor>
  <section class="editor-main">
    <p><a href="/panel/ms/pages/${page.id}">← ${page.slug === '' ? t('ms.page_home') : page.title || page.slug}</a></p>
    <h2>${t('ms.section_edit')}</h2>
    ${Object.keys(errors).length ? html`<p class="flash flash-error" role="alert">${t('err.form')}</p>` : ''}
    <form method="post" action="/panel/ms/sections/${section.id}?_csrf=${encodeURIComponent(ctx.csrf)}" enctype="multipart/form-data" novalidate>
      ${input({ ctx, name: 'antetitulo', label: t('ms.s.antetitulo'), value: d.antetitulo, maxlength: 60 })}
      ${input({ ctx, name: 'titulo', label: t('ms.s.titulo'), value: d.titulo, maxlength: 120 })}
      ${input({ ctx, name: 'subtitulo', label: t('ms.s.subtitulo'), value: d.subtitulo, maxlength: 240 })}
      ${input({ ctx, name: 'ancla', label: t('ms.s.ancla'), value: d.ancla, maxlength: 40, hint: t('ms.s.ancla_hint'), error: errors.ancla })}
      <fieldset><legend>${t('ms.s.fondo_t')}</legend>
        ${select({ ctx, name: 'fondo', label: t('ms.s.fondo_t'), value: d.fondo, options: opts(ctx, 's.fondo', FONDO_TIPOS).map((o) => ({ value: o.value, label: t(`ms.s.fondo.${o.value}`) })) })}
        <div class="grid-3">
          ${input({ ctx, name: 'color', type: 'color', label: t('ms.s.color'), value: d.color })}
          ${input({ ctx, name: 'color2', type: 'color', label: t('ms.s.color2'), value: d.color2 })}
          ${input({ ctx, name: 'angulo', type: 'number', label: t('ms.s.angulo'), value: d.angulo, min: 0, max: 360 })}
        </div>
        ${imageOpt(ctx, 'imagen', t('ms.s.imagen'), d.imagen)}
        ${input({ ctx, name: 'oscurecer', type: 'range', label: t('ms.s.oscurecer'), value: d.oscurecer, min: 0, max: 80 })}
      </fieldset>
      <div class="grid-2">
        ${select({ ctx, name: 'alto', label: t('ms.s.alto_t'), value: d.alto, options: ALTOS.map((v) => ({ value: v, label: t(`ms.s.alto.${v}`) })) })}
        ${select({ ctx, name: 'ancho', label: t('ms.s.ancho_t'), value: d.ancho, options: ANCHOS.map((v) => ({ value: v, label: t(`ms.s.ancho.${v}`) })) })}
      </div>
      <div class="grid-2">
        ${select({ ctx, name: 'columnas', label: t('ms.s.columnas'), value: d.columnas, options: [1, 2, 3].map((n) => ({ value: String(n), label: String(n) })) })}
        ${select({ ctx, name: 'alinear', label: t('ms.s.alinear_t'), value: d.alinear, options: (['izquierda', 'centro'] as const).map((v) => ({ value: v, label: t(`ms.s.alinear.${v}`) })) })}
      </div>
      ${select({ ctx, name: 'relleno', label: t('ms.s.relleno_t'), value: d.relleno, options: (['normal', 'ninguno'] as const).map((v) => ({ value: v, label: t(`ms.s.relleno.${v}`) })) })}
      ${checkbox({ name: 'is_enabled', label: t('ms.s.visible'), checked: enabled })}
      <div class="btn-row sticky-actions">
        <button class="btn btn-primary" type="submit">${t('common.save')}</button>
        <a class="btn" href="/panel/ms/pages/${page.id}">${t('common.cancel')}</a>
      </div>
    </form>
  </section>
  ${preview(ctx, link, page.slug)}
</div>`,
  })
}

// ---------------------------------------------------------------- elegir bloque para una sección
export function blockPickerPage(ctx: Ctx, link: Link, page: MsPage, section: MsSection, label: string, locked: string[], full: boolean, max: number): SafeHtml {
  const { t } = ctx
  return panelLayout(ctx, {
    title: t('bio.add_block'),
    active: 'links',
    path: `/panel/links/${link.id}/blocks/pick`,
    wide: true,
    head: head(ctx),
    body: html`${linkTabs(ctx, link, 'blocks')}
<section class="editor-main">
  <p><a href="/panel/links/${link.id}/blocks?p=${page.id}#s${section.id}">← ${t('bio.blocks')}</a></p>
  <h2>${t('ms.pick_title', { section: label })}</h2>
  ${full
    ? html`<p class="error">${t('bio.max_blocks', { n: max })} <a href="/panel/plan">${t('plan.see_plans')}</a></p>`
    : html`<div class="add-block"><div class="field pick-search"><label class="sr-only" for="pick-q">${t('bio.search_blocks')}</label><input id="pick-q" type="search" placeholder="${t('bio.search_blocks')}" data-pick-search autocomplete="off"></div>
  ${GROUPS.map(
    (g) => html`<h3 data-pick-group>${t(`bio.group_${g}`)}</h3><div class="picker">${BLOCKS.filter((b) => b.group === g && !b.hidden).map(
      (b) => html`<a class="pick${locked.includes(b.type) ? ' locked' : ''}" href="${locked.includes(b.type) ? '/panel/plan' : `/panel/links/${link.id}/blocks/new?type=${b.type}&s=${section.id}`}"><span class="tipo-ic" aria-hidden="true">${icon(blockIcon(b.type, b.group))}</span>${t(`bio.type_${b.type}`)}${locked.includes(b.type) ? html` <span class="tag">${t('plan.upgrade_short')}</span>` : ''}</a>`,
    )}</div>`,
  )}</div>`}
</section>`,
  })
}
