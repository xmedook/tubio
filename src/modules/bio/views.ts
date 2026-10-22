import { html, type SafeHtml } from '../../lib/html.ts'
import { formatNumber, plural } from '../../lib/i18n.ts'
import { imageUrl } from '../../lib/uploads.ts'
import { panelLayout } from '../../views/layout.ts'
import { checkbox, csrfField, input, postButton, select, type Errors } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import { linkUrl, type Link } from '../links/repo.ts'
import { linkTabs } from '../links/views.ts'
import { blockFields, type BlockValues } from './block-form.ts'
import { BLOCK_BY_TYPE, BLOCKS, MAX_BLOCKS_PER_PAGE, type BlockDef, type BlockRow } from './blocks.ts'
import { FONT_IDS, FONTS, THEMES, type Design } from './design.ts'

const GROUPS: BlockDef['group'][] = ['basic', 'business', 'capture', 'social', 'media']

function preview(ctx: Ctx, link: Link): SafeHtml {
  const { t } = ctx
  return html`<aside class="editor-preview" aria-label="${t('bio.preview')}">
  <div class="phone"><iframe src="/${link.alias}?_preview=1" title="${t('bio.preview')}" loading="lazy" data-preview></iframe></div>
  <p class="muted center"><a href="${linkUrl(ctx.baseUrl, link)}" target="_blank" rel="noopener">${t('bio.open_page')} ↗</a></p>
</aside>`
}

export function editorPage(ctx: Ctx, link: Link, blocks: BlockRow[], locked: string[] = [], maxBlocks = MAX_BLOCKS_PER_PAGE): SafeHtml {
  const { t } = ctx
  const now = ctx.now
  const scheduled = (b: BlockRow) => (b.starts_at && now < b.starts_at) || (b.ends_at && now >= b.ends_at)
  const full = blocks.length >= maxBlocks
  return panelLayout(ctx, {
    title: t('bio.blocks'),
    active: 'links',
    path: `/panel/links/${link.id}/blocks`,
    wide: true,
    head: html`<script src="/_/static/vendor/sortablejs/Sortable.min.js" defer nonce="${ctx.nonce}"></script><script type="module" src="/_/static/js/editor.js" nonce="${ctx.nonce}"></script>`,
    body: html`${linkTabs(ctx, link, 'blocks')}
<div class="editor">
  <section class="editor-main">
    <details class="card add-block"${blocks.length === 0 ? html` open` : ''}>
      <summary class="btn btn-primary">+ ${t('bio.add_block')}</summary>
      ${full ? html`<p class="error">${t('bio.max_blocks', { n: maxBlocks })} <a href="/panel/plan">${t('plan.see_plans')}</a></p>` : GROUPS.map(
        (g) => html`<h3>${t(`bio.group_${g}`)}</h3><div class="picker">${BLOCKS.filter((b) => b.group === g).map(
          (b) => html`<a class="pick${locked.includes(b.type) ? ' locked' : ''}" href="${locked.includes(b.type) ? '/panel/plan' : `/panel/links/${link.id}/blocks/new?type=${b.type}`}"><span class="pick-ico pi-${b.type}" aria-hidden="true"></span>${t(`bio.type_${b.type}`)}${locked.includes(b.type) ? html` <span class="tag">${t('plan.upgrade_short')}</span>` : ''}</a>`,
        )}</div>`,
      )}
    </details>
    ${blocks.length === 0
      ? html`<p class="muted">${t('bio.no_blocks')}</p>`
      : html`<ol class="blocks" data-sortable data-order-url="/panel/links/${link.id}/blocks/order" data-csrf="${ctx.csrf}" aria-label="${t('bio.blocks')}">
      ${blocks.map((b, i) => {
        const def = BLOCK_BY_TYPE.get(b.type)
        return html`<li data-id="${b.id}"${b.is_enabled ? '' : html` class="off"`}>
        <span class="handle" title="${t('bio.drag')}" aria-hidden="true">⋮⋮</span>
        <div class="grow">
          <div class="title">${t(`bio.type_${b.type}`)}${b.is_enabled ? '' : html` <span class="tag tag-off">${t('links.disabled')}</span>`}${scheduled(b) ? html` <span class="tag">${t('bio.scheduled')}</span>` : ''}</div>
          <div class="sub">${def?.summary(b) ?? ''}</div>
        </div>
        ${def?.clickable ? html`<span class="muted nowrap">${plural(t, ctx.locale, 'links.n_clicks', b.clicks)}</span>` : ''}
        <div class="btn-row">
          <form method="post" action="/panel/blocks/${b.id}/move" class="inline">${csrfField(ctx)}<input type="hidden" name="dir" value="up"><button class="btn btn-sm" type="submit" aria-label="${t('bio.move_up')}"${i === 0 ? html` disabled` : ''}>↑</button></form>
          <form method="post" action="/panel/blocks/${b.id}/move" class="inline">${csrfField(ctx)}<input type="hidden" name="dir" value="down"><button class="btn btn-sm" type="submit" aria-label="${t('bio.move_down')}"${i === blocks.length - 1 ? html` disabled` : ''}>↓</button></form>
          <a class="btn btn-sm" href="/panel/blocks/${b.id}">${t('common.edit')}</a>
          ${postButton(ctx, `/panel/blocks/${b.id}/toggle`, b.is_enabled ? t('bio.hide') : t('bio.show'), { cls: 'btn btn-sm' })}
          ${postButton(ctx, `/panel/blocks/${b.id}/delete`, t('common.delete'), { cls: 'btn btn-sm btn-danger', confirm: t('bio.delete_confirm') })}
        </div>
      </li>`
      })}
    </ol>`}
  </section>
  ${preview(ctx, link)}
</div>`,
  })
}

export function blockFormPage(ctx: Ctx, link: Link, def: BlockDef, block: BlockRow | undefined, values: BlockValues, errors: Errors, targets: { id: number; name: string; kind: string }[] = []): SafeHtml {
  const { t } = ctx
  const action = block ? `/panel/blocks/${block.id}` : `/panel/links/${link.id}/blocks?type=${def.type}`
  const sep = action.includes('?') ? '&' : '?'
  return panelLayout(ctx, {
    title: t(`bio.type_${def.type}`),
    active: 'links',
    path: action,
    wide: true,
    body: html`${linkTabs(ctx, link, 'blocks')}
<div class="editor">
  <section class="editor-main">
    <h2>${block ? t('bio.edit_block', { type: t(`bio.type_${def.type}`) }) : t('bio.new_block', { type: t(`bio.type_${def.type}`) })}</h2>
    ${Object.keys(errors).length ? html`<p class="flash flash-error" role="alert">${t('err.form')}</p>` : ''}
    <form method="post" action="${action}${sep}_csrf=${encodeURIComponent(ctx.csrf)}" enctype="multipart/form-data" novalidate>
      ${blockFields(ctx, def, values, errors, targets)}
      <div class="btn-row sticky-actions">
        <button class="btn btn-primary" type="submit">${block ? t('common.save') : t('bio.add')}</button>
        <a class="btn" href="/panel/links/${link.id}/blocks">${t('common.cancel')}</a>
      </div>
    </form>
  </section>
  ${preview(ctx, link)}
</div>`,
  })
}

function themeCard(ctx: Ctx, id: string, current: string): SafeHtml {
  return html`<label class="theme-card">
  <input type="radio" name="theme" value="${id}"${id === current ? html` checked` : ''}>
  <span class="theme-swatch th-${id}" aria-hidden="true"><span></span><span></span><span></span></span>
  <span class="theme-name">${ctx.t(`bio.theme_${id}`)}</span>
</label>`
}

function colorOrTheme(ctx: Ctx, name: string, label: string, value: string | null): SafeHtml {
  return html`<div class="field color-opt">
  ${input({ ctx, name, type: 'color', label, value: value ?? '#000000' })}
  ${checkbox({ name: `${name}__theme`, label: ctx.t('bio.f.use_theme'), checked: value === null })}
</div>`
}

function imageOpt(ctx: Ctx, name: string, label: string, key: string | null, hint?: string): SafeHtml {
  return html`<div class="img-field">
  ${key ? html`<img class="img-preview" src="${imageUrl(key)}" alt="">` : ''}
  ${input({ ctx, name, type: 'file', label: key ? `${label} — ${ctx.t('bio.f.replace_image')}` : label, accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif', hint })}
  ${key ? checkbox({ name: `${name}__remove`, label: ctx.t('bio.f.remove_image') }) : ''}
</div>`
}

export function designPage(ctx: Ctx, link: Link, d: Design, errors: Errors = {}, hiddenThemes: string[] = []): SafeHtml {
  const { t } = ctx
  const opts = (name: string, values: readonly string[]) => values.map((v) => ({ value: v, label: t(`bio.d.${name}.${v}`) }))
  return panelLayout(ctx, {
    title: t('bio.design'),
    active: 'links',
    path: `/panel/links/${link.id}/design`,
    wide: true,
    head: html`<link rel="stylesheet" href="/_/themes.css">`,
    body: html`${linkTabs(ctx, link, 'design')}
<div class="editor">
  <section class="editor-main">
    ${Object.keys(errors).length ? html`<p class="flash flash-error" role="alert">${t('err.form')}</p>` : ''}
    <form method="post" action="/panel/links/${link.id}/design?_csrf=${encodeURIComponent(ctx.csrf)}" enctype="multipart/form-data" novalidate>
      <fieldset><legend>${t('bio.d.theme')}</legend>
        <div class="themes">${THEMES.filter((th) => th.id === d.theme || !hiddenThemes.includes(th.id)).map((th) => themeCard(ctx, th.id, d.theme))}</div>
      </fieldset>

      <details class="opt" open><summary>${t('bio.d.background')}</summary><div class="opt-body">
        ${select({ ctx, name: 'bg_type', label: t('bio.d.bg_type'), value: d.bg_type, options: opts('bg_type', ['theme', 'color', 'gradient', 'image']) })}
        <div class="grid-3">
          ${input({ ctx, name: 'bg_color', type: 'color', label: t('bio.d.bg_color'), value: d.bg_color })}
          ${input({ ctx, name: 'bg_color2', type: 'color', label: t('bio.d.bg_color2'), value: d.bg_color2 })}
          ${input({ ctx, name: 'bg_angle', type: 'number', label: t('bio.d.bg_angle'), value: d.bg_angle, min: 0, max: 360 })}
        </div>
        ${imageOpt(ctx, 'bg_image', t('bio.d.bg_image'), d.bg_image)}
        <div class="grid-2">
          ${input({ ctx, name: 'bg_blur', type: 'range', label: t('bio.d.bg_blur'), value: d.bg_blur, min: 0, max: 20 })}
          ${input({ ctx, name: 'bg_brightness', type: 'range', label: t('bio.d.bg_brightness'), value: d.bg_brightness, min: 40, max: 140 })}
        </div>
      </div></details>

      <details class="opt"><summary>${t('bio.d.typography')}</summary><div class="opt-body">
        <div class="grid-2">
          ${select({ ctx, name: 'font', label: t('bio.d.font'), value: d.font, options: [{ value: 'theme', label: t('bio.f.use_theme') }, ...FONT_IDS.map((f) => ({ value: f, label: t(`bio.font_${f}`) }))] })}
          ${input({ ctx, name: 'font_size', type: 'number', label: t('bio.d.font_size'), value: d.font_size, min: 14, max: 20 })}
        </div>
        ${colorOrTheme(ctx, 'text_color', t('bio.f.text_color'), d.text_color)}
      </div></details>

      <details class="opt"><summary>${t('bio.d.buttons')}</summary><div class="opt-body">
        <div class="grid-3">
          ${colorOrTheme(ctx, 'btn_bg', t('bio.f.bg_color'), d.btn_bg)}
          ${colorOrTheme(ctx, 'btn_text', t('bio.f.text_color'), d.btn_text)}
          ${colorOrTheme(ctx, 'btn_border_color', t('bio.f.border_color'), d.btn_border_color)}
        </div>
        <div class="grid-3">
          ${input({ ctx, name: 'btn_border_width', type: 'number', label: t('bio.d.border_width'), value: d.btn_border_width ?? '', min: 0, max: 4, hint: t('bio.d.empty_theme') })}
          ${select({ ctx, name: 'btn_border_style', label: t('bio.d.border_style'), value: d.btn_border_style, options: opts('border_style', ['solid', 'dashed', 'dotted']) })}
          ${input({ ctx, name: 'btn_radius', type: 'number', label: t('bio.d.radius'), value: d.btn_radius ?? '', min: 0, max: 40, hint: t('bio.d.empty_theme') })}
        </div>
        ${select({ ctx, name: 'btn_shadow', label: t('bio.d.shadow'), value: d.btn_shadow, options: opts('shadow', ['theme', 'none', 'soft', 'hard']) })}
      </div></details>

      <details class="opt"><summary>${t('bio.d.layout')}</summary><div class="opt-body">
        <div class="grid-3">
          ${select({ ctx, name: 'width', label: t('bio.d.width'), value: d.width, options: opts('width', ['narrow', 'normal', 'wide']) })}
          ${select({ ctx, name: 'spacing', label: t('bio.d.spacing'), value: d.spacing, options: opts('spacing', ['compact', 'normal', 'relaxed']) })}
          ${select({ ctx, name: 'align', label: t('bio.f.align'), value: d.align, options: opts('align', ['center', 'left']) })}
          ${select({ ctx, name: 'animation', label: t('bio.d.animation'), value: d.animation, options: opts('animation', ['none', 'fade', 'rise', 'pop']) })}
          ${select({ ctx, name: 'hover', label: t('bio.d.hover'), value: d.hover, options: opts('hover', ['none', 'lift', 'grow', 'glow']) })}
        </div>
      </div></details>

      <details class="opt"${d.announce_text ? html` open` : ''}><summary>${t('bio.d.announce')}</summary><div class="opt-body">
        ${input({ ctx, name: 'announce_text', label: t('bio.d.announce_text'), value: d.announce_text, maxlength: 200, error: errors.announce_text })}
        ${input({ ctx, name: 'announce_url', type: 'url', label: t('bio.f.url_optional'), value: d.announce_url, error: errors.announce_url, placeholder: 'https://' })}
        <div class="grid-3">
          ${input({ ctx, name: 'announce_bg', type: 'color', label: t('bio.f.bg_color'), value: d.announce_bg })}
          ${input({ ctx, name: 'announce_color', type: 'color', label: t('bio.f.text_color'), value: d.announce_color })}
          ${select({ ctx, name: 'announce_position', label: t('bio.d.position'), value: d.announce_position, options: opts('position', ['top', 'bottom']) })}
        </div>
      </div></details>

      <details class="opt"><summary>${t('bio.d.seo')}</summary><div class="opt-body">
        ${input({ ctx, name: 'seo_title', label: t('bio.d.seo_title'), value: d.seo_title, maxlength: 70, error: errors.seo_title })}
        ${input({ ctx, name: 'seo_description', label: t('bio.d.seo_description'), value: d.seo_description, maxlength: 200 })}
        ${input({ ctx, name: 'seo_keywords', label: t('bio.d.seo_keywords'), value: d.seo_keywords, maxlength: 200 })}
        ${imageOpt(ctx, 'seo_image', t('bio.d.seo_image'), d.seo_image, t('bio.d.seo_image_hint'))}
        ${imageOpt(ctx, 'favicon', t('bio.d.favicon'), d.favicon)}
        ${checkbox({ name: 'noindex', label: t('bio.d.noindex'), checked: d.noindex })}
      </div></details>

      <details class="opt"${d.leap_url ? html` open` : ''}><summary>${t('bio.d.extras')}</summary><div class="opt-body">
        ${checkbox({ name: 'share_button', label: t('bio.d.share_button'), checked: d.share_button })}
        ${checkbox({ name: 'pwa', label: t('bio.d.pwa'), checked: d.pwa, hint: t('bio.d.pwa_hint') })}
        ${checkbox({ name: 'directory', label: t('dir.opt_in'), checked: d.directory, hint: t('dir.opt_in_hint') })}
        ${select({ ctx, name: 'category', label: t('dir.category'), value: d.category, options: ['', 'creator', 'business', 'music', 'art', 'food', 'education', 'tech', 'health', 'nonprofit', 'other'].map((c) => ({ value: c, label: t(`dir.cat_${c || 'none'}`) })) })}
        ${checkbox({ name: 'show_branding', label: t('bio.d.show_branding'), checked: d.show_branding, hint: t('bio.d.branding_hint') })}
        <div class="grid-2">
          ${input({ ctx, name: 'brand_text', label: t('bio.d.brand_text'), value: d.brand_text, maxlength: 60 })}
          ${input({ ctx, name: 'brand_url', type: 'url', label: t('bio.d.brand_url'), value: d.brand_url, error: errors.brand_url, placeholder: 'https://' })}
        </div>
        ${input({ ctx, name: 'leap_url', type: 'url', label: t('bio.d.leap_url'), value: d.leap_url, error: errors.leap_url, hint: t('bio.d.leap_hint'), placeholder: 'https://' })}
      </div></details>

      <div class="btn-row sticky-actions"><button class="btn btn-primary" type="submit">${t('common.save')}</button></div>
    </form>
  </section>
  ${preview(ctx, link)}
</div>`,
  })
}

/** CSS de las muestras de tema en el panel (valores fijos del código) */
export function themeSwatchCss(): string {
  return THEMES.map(
    (th) =>
      `.th-${th.id}{background:${th.bg};color:${th.text};font-family:${FONTS[th.font]}}.th-${th.id} span{background:${th.btnBg};border:${Math.max(1, th.btnBorderWidth)}px solid ${th.btnBorder};border-radius:${Math.min(th.radius, 8)}px}`,
  ).join('')
}
