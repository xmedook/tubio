import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html, raw, type SafeHtml } from '../../lib/html.ts'
import { isLocale, translator, type Locale } from '../../lib/i18n.ts'
import { imageUrl } from '../../lib/uploads.ts'
import { redirectAllowed } from '../../lib/urls.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import { sendHtml } from '../../web/context.ts'
import { linkUrl, type Link } from '../links/repo.ts'
import { getSetting } from '../settings/repo.ts'
import { blockTypeAllowed, limitsOf } from '../plans/limits.ts'
import { pixelCsp, pixelsForLink } from '../marketing/pixels.ts'
import { pixelBar } from '../marketing/resolve.ts'
import { findUserById } from '../users/repo.ts'
import { BLOCK_BY_TYPE, type BlockRow, type RenderCtx } from './blocks.ts'
import { FONTS, fontFaceCss, readDesign, themeById, type Design, type FontId } from './design.ts'
import { EMBED_ORIGINS } from './embeds.ts'
import { listBlocks } from './repo.ts'
import { groupBlocks, isClassic, loadSite, pageBySlug, sectionsOf } from '../minisitio/repo.ts'
import { renderSiteBody, siteCss } from '../minisitio/render.ts'

const WIDTH = { narrow: '420px', normal: '560px', wide: '720px' }
const GAP = { compact: '.6rem', normal: '.9rem', relaxed: '1.3rem' }

function shadowCss(kind: 'none' | 'soft' | 'hard'): string {
  if (kind === 'soft') return '0 2px 4px rgb(0 0 0 / 6%), 0 6px 18px rgb(0 0 0 / 10%)'
  if (kind === 'hard') return '4px 4px 0 0 var(--btn-bc)'
  return 'none'
}

/** CSS de la página: sólo valores validados (hex, números, enumeraciones) */
export function pageCss(d: Design, blocks: BlockRow[]): string {
  const th = themeById(d.theme)
  let bg = th.bg
  if (d.bg_type === 'color') bg = d.bg_color
  else if (d.bg_type === 'gradient') bg = `linear-gradient(${d.bg_angle}deg, ${d.bg_color}, ${d.bg_color2})`
  else if (d.bg_type === 'image' && d.bg_image) bg = `${d.bg_color} url("/_/u/${d.bg_image}") center / cover no-repeat`
  const font = d.font === 'theme' ? FONTS[th.font] : FONTS[d.font]
  // color liso para las capas translúcidas (cabecera, barra): un degradado no sirve dentro de color-mix()
  const solid = d.bg_type === 'theme' ? (/^#[0-9a-f]{3,8}$/i.test(th.bg) ? th.bg : /#[0-9a-f]{6}/i.exec(th.bg)?.[0] ?? '#ffffff') : d.bg_color
  const vars: [string, string][] = [
    ['--bg', bg],
    ['--bg-solid', solid],
    ['--text', d.text_color ?? th.text],
    ['--page-text', d.text_color ?? th.text], // el de la página, para superficies que no heredan el de una sección (hoja de WhatsApp)
    ['--btn-bg', d.btn_bg ?? th.btnBg],
    ['--btn-text', d.btn_text ?? th.btnText],
    ['--btn-bc', d.btn_border_color ?? th.btnBorder],
    ['--btn-bw', `${d.btn_border_width ?? th.btnBorderWidth}px`],
    ['--btn-bs', d.btn_border_style],
    ['--btn-r', `${d.btn_radius ?? Math.min(th.radius, 40)}px`],
    ['--btn-sh', shadowCss(d.btn_shadow === 'theme' ? th.shadow : d.btn_shadow)],
    ['--font', font],
    ['--font-h', d.font_heading === 'theme' ? 'var(--font)' : FONTS[d.font_heading]],
    ['--font-n', d.font_num === 'theme' ? 'var(--font-h)' : FONTS[d.font_num]],
    ['--fs', `${d.font_size}px`],
    ['--col', WIDTH[d.width]],
    ['--gap', GAP[d.spacing]],
    ['--bg-filter', `blur(${d.bg_blur}px) brightness(${d.bg_brightness}%)`],
    ['--ann-bg', d.announce_bg],
    ['--ann-text', d.announce_color],
  ]
  const fontId = d.font === 'theme' ? th.font : d.font
 const faces = [...new Set([fontId, d.font_heading, d.font_num].filter((f) => f !== 'theme'))] as FontId[]
  let css = faces.map(fontFaceCss).join('') + `:root{${vars.map(([k, v]) => `${k}:${v}`).join(';')}}`
  for (const b of blocks) {
    const st = b.style
    const rules: string[] = []
    if (st.text_color) rules.push(`--b-text:${st.text_color}`, `color:${st.text_color}`)
    if (st.bg_color) rules.push(`--b-bg:${st.bg_color}`)
    if (st.border_color) rules.push(`--b-bc:${st.border_color}`)
    if (st.align && st.align !== 'inherit') rules.push(`text-align:${st.align}`, `--b-justify:${st.align === 'left' ? 'flex-start' : st.align === 'right' ? 'flex-end' : 'center'}`)
    if (rules.length) css += `#b${b.id}{${rules.join(';')}}`
    if (b.type === 'html') css += `#b${b.id} .embed{height:${Math.min(1200, Math.max(60, Number(b.data.height) || 300))}px}`
  }
  return css
}

/** clases del contenedor: tipo + estilo de tarjeta (marco con sombra dura, giro) */
export function blkClass(b: BlockRow): string {
  let c = `blk blk-${b.type}`
  if (b.style.frame === 'hard') c += ' fr-hard'
  if (b.style.bg_color) c += ' has-bg'
  const tilt = Number(b.style.tilt)
  if (tilt && Number.isInteger(tilt) && Math.abs(tilt) <= 2) c += ` tilt-${tilt < 0 ? 'n' : 'p'}${Math.abs(tilt)}`
  return c
}

export function visibleBlocks(blocks: BlockRow[], now: number): BlockRow[] {
  return blocks.filter((b) => b.is_enabled && (!b.starts_at || now >= b.starts_at) && (!b.ends_at || now < b.ends_at) && BLOCK_BY_TYPE.has(b.type))
}

export function bioCsp(nonce: string, preview: boolean, frameOrigins: string[] = EMBED_ORIGINS): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https://i.ytimg.com",
    "font-src 'self'",
    "media-src 'self' https:",
    `frame-src ${frameOrigins.length ? [...new Set(frameOrigins)].join(' ') : "'none'"}`,
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "manifest-src 'self'",
    "worker-src 'none'",
    `frame-ancestors ${preview ? "'self'" : "'none'"}`,
  ].join('; ')
}

/** Defensa extra: sólo http(s) aunque el formulario ya lo validó */
const web = (v: string): string | null => (/^https?:\/\//i.test(v) ? v : null)

/** `override.blocks`: bloques en memoria (vista previa de plantillas) en lugar de los de la BD */
export async function renderBioPage(deps: AppDeps, req: FastifyRequest, reply: FastifyReply, link: Link, override?: { blocks: BlockRow[] }, pageSlug = '') {
  const d = readDesign(link.data)
  const owner = findUserById(deps.db, link.user_id)
  const px = owner && limitsOf(deps.db, owner, deps.now()).marketing ? pixelsForLink(deps.db, link.user_id, JSON.stringify(link.pixel_ids)) : []
  const preview = (req.query as Record<string, unknown>)._preview === '1' && req.ctx.user?.id === link.user_id
  if (web(d.leap_url) && !preview && redirectAllowed(deps.db, d.leap_url)) return reply.redirect(d.leap_url, 302)

  const ownerLocale: Locale = owner && isLocale(owner.locale) ? owner.locale : 'es-MX'
  // textos del sistema en el idioma declarado de la página si lo tenemos; si no, el de la cuenta
  const locale: Locale = d.lang.startsWith('en') ? 'en' : d.lang.startsWith('es') ? 'es-MX' : ownerLocale
  const t = translator(locale)
  const ownerLim = owner ? limitsOf(deps.db, owner, deps.now()) : null
  const visible = visibleBlocks(override?.blocks ?? listBlocks(deps.db, link.id), deps.now()).filter((b) => blockTypeAllowed(ownerLim, b.type))
  // minisitio: sitio con páginas y secciones; una bio sin filas de sitio (o sin nada añadido) sale idéntica a siempre
  const site = override ? null : loadSite(deps.db, link.id)
  const classic = !site || isClassic(site)
  const page = site && !classic ? pageBySlug(site, pageSlug) : undefined
  if ((classic && pageSlug) || (!classic && (!page || !page.is_enabled))) return reply.callNotFound()
  const grouped = site && page ? groupBlocks(site, visible) : null
  const pageSections = site && page ? sectionsOf(site, page.id).filter((s) => s.is_enabled) : []
  const blocks = grouped ? pageSections.flatMap((s) => grouped.get(s.id) ?? []) : visible
  const host = new URL(deps.config.baseUrl).hostname
  const rc: RenderCtx = { t, locale, host, verified: !!owner?.is_verified, badgeShown: { v: false }, now: deps.now(), db: deps.db,
    csrf: req.ctx.csrf, pow: req.ctx.pow, sent: Number((req.query as { sent?: string }).sent) || null, cookies: req.cookies, ownerName: owner?.name || link.title || link.alias, site: { alias: link.alias, title: link.title || link.alias, wa: site?.config.whatsapp ?? loadSite(deps.db, link.id).config.whatsapp }, h1: { v: false },
    formError: (() => { const q = req.query as { err?: string; b?: string }; return q.err && /^\w{2,20}$/.test(q.err) && Number(q.b) ? { id: Number(q.b), key: q.err } : null })() }
  const url = linkUrl(deps.config.baseUrl, link) + (page?.slug ? `/${page.slug}` : '')
  const siteTitle = d.seo_title || link.title || link.alias
  const title = page && page.slug ? page.data.seo_title || (page.title ? `${page.title} · ${siteTitle}` : siteTitle) : siteTitle
  const seoDescription = (page && page.slug && page.data.seo_description) || d.seo_description
  const seoImage = (page && page.slug && page.data.seo_image) || d.seo_image
  const ogImage = seoImage ? `${deps.config.baseUrl}${imageUrl(seoImage)}` : null
  const nonce = req.ctx.nonce
  // la marca sólo se puede quitar o cambiar en planes que lo incluyen
  const forced = getSetting(deps.db, 'branding_forced') || !(owner && limitsOf(deps.db, owner, deps.now()).remove_branding)
  const showBrand = forced || d.show_branding
  const announce = d.announce_text
    ? html`<div class="announce pos-${d.announce_position}">${web(d.announce_url) ? html`<a href="${d.announce_url}">${d.announce_text}</a>` : d.announce_text}</div>`
    : ''

  const renderBlock = (b: BlockRow, i: number) =>
    html`<div class="${blkClass(b)}" id="b${b.id}" data-i="${Math.min(i, 15)}">${(BLOCK_BY_TYPE.get(b.type) as NonNullable<ReturnType<typeof BLOCK_BY_TYPE.get>>).render(rc, b)}</div>`
  const madeHtml = showBrand
    ? html`<footer class="made">${!forced && d.brand_text
        ? web(d.brand_url) ? html`<a href="${d.brand_url}">${d.brand_text}</a>` : d.brand_text
        : html`<a href="${deps.config.baseUrl}/">${t('bio.made_with')} <b>tubio</b></a>`}</footer>`
    : ''
  const reportHtml = html`<p class="report"><a href="/_/report/${link.alias}" rel="nofollow">${t('abuse.link')}</a> · <a href="/terms" rel="nofollow">${t('legal.terms')}</a> · <a href="/privacy" rel="nofollow">${t('legal.privacy')}</a></p>`
  const usesSiteBlocks = blocks.some((b) => BLOCK_BY_TYPE.get(b.type)?.group === 'site')
  const sb = site && page ? renderSiteBody({ t, site, page, alias: link.alias, title: link.title || link.alias, grouped: grouped as Map<number, BlockRow[]>, renderBlock, legal: html`${madeHtml}${reportHtml}` }) : null

  const doc: SafeHtml = html`<html lang="${d.lang || locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${seoDescription ? html`<meta name="description" content="${seoDescription}">` : ''}
${d.seo_keywords ? html`<meta name="keywords" content="${d.seo_keywords}">` : ''}
${d.noindex || link.password_hash || link.is_sensitive ? html`<meta name="robots" content="noindex, nofollow">` : ''}
<link rel="canonical" href="${url}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${title}">
<meta property="og:url" content="${url}">
${seoDescription ? html`<meta property="og:description" content="${seoDescription}">` : ''}
${ogImage ? html`<meta property="og:image" content="${ogImage}"><meta name="twitter:card" content="summary_large_image">` : html`<meta name="twitter:card" content="summary">`}
<link rel="icon" href="${d.favicon ? imageUrl(d.favicon) : '/_/static/img/favicon.svg'}">
<link rel="stylesheet" href="/_/static/css/bio.css?v=${ASSET_VERSION}">
${sb || usesSiteBlocks ? html`<link rel="stylesheet" href="/_/static/css/site.css?v=${ASSET_VERSION}">` : ''}
${d.pwa && !link.password_hash ? html`<link rel="manifest" href="/_/pwa/${link.alias}/manifest.webmanifest"><link rel="apple-touch-icon" href="/_/pwa/${link.alias}/icon-192.png"><meta name="theme-color" content="${d.btn_bg ?? '#1d4ed8'}">` : ''}
<style nonce="${nonce}">${raw(pageCss(d, blocks) + (sb ? siteCss(pageSections) : ''))}</style>
<script type="module" src="/_/static/js/bio.js?v=${ASSET_VERSION}" nonce="${nonce}"></script>
${sb || usesSiteBlocks ? html`<script type="module" src="/_/static/js/site.js?v=${ASSET_VERSION}" nonce="${nonce}"></script>` : ''}
${blocks.some((b) => b.type === 'wa_request') ? html`<script type="module" src="/_/static/js/wa.js?v=${ASSET_VERSION}" nonce="${nonce}"></script>` : ''}
${blocks.some((b) => b.type === 'menu' || b.type === 'services' || b.type === 'menu_pdf') ? html`<script type="module" src="/_/static/js/catalog.js?v=${ASSET_VERSION}" nonce="${nonce}"></script>` : ''}
${blocks.some((b) => BLOCK_BY_TYPE.get(b.type)?.group === 'capture') ? html`<script type="module" src="/_/static/js/pow.js?v=${ASSET_VERSION}" nonce="${nonce}"></script>` : ''}
</head>
<body class="bio al-${d.align} anim-${d.animation} hov-${d.hover}${d.bg_type === 'image' && d.bg_image ? ' has-bg-img' : ''}${sb ? ` ms${sb.hasBar ? ' has-bar' : ''}${sb.hasDock ? ' has-dock' : ''}` : ''}"${sb ? html` data-title="${title}" data-url="${url}" data-copied="${t('links.copied')}"` : ''}>
<div class="bg" aria-hidden="true"></div>
${d.announce_position === 'top' ? announce : ''}
${d.share_button ? html`<button type="button" class="share-fab" data-share aria-label="${t('bio.share')}" title="${t('bio.share')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l4 4-1.4 1.4L13 6.8V15h-2V6.8L9.4 8.4 8 7zM5 11h3v2H6v6h12v-6h-2v-2h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg></button>` : ''}
${sb
  ? html`${sb.top}${d.pwa ? html`<button type="button" class="btn pwa-install" data-pwa hidden>${t('bio.pwa_install')}</button>` : ''}${sb.main}${sb.bottom}`
  : html`<main class="col" data-title="${title}" data-url="${url}" data-copied="${t('links.copied')}">
${blocks.length === 0 ? html`<p class="para empty">${t('bio.empty_public')}</p>` : ''}
${d.pwa ? html`<button type="button" class="btn pwa-install" data-pwa hidden>${t('bio.pwa_install')}</button>` : ''}
${blocks.map((b, i) => renderBlock(b, i))}
${madeHtml}
${reportHtml}
</main>`}
${d.announce_position === 'bottom' ? announce : ''}
${px.length && !preview ? html`<div id="tb-px" data-px="${JSON.stringify(px.map((p) => ({ k: p.kind, id: p.pixel_id })))}"></div>${pixelBar(t)}<script type="module" src="/_/static/js/pixels.js?v=${ASSET_VERSION}" nonce="${nonce}"></script>` : ''}
</body>
</html>`

  // frame-src sólo con los orígenes que usan los bloques de esta página
  const frames = blocks.flatMap((b) => BLOCK_BY_TYPE.get(b.type)?.frameOrigins?.(b, host) ?? [])
  let csp = bioCsp(nonce, preview, frames)
  if (px.length) {
    const o = pixelCsp(px)
    csp = csp
      .replace(`script-src 'self' 'nonce-${nonce}'`, `script-src 'self' 'nonce-${nonce}' ${o.script.join(' ')}`)
      .replace("img-src 'self' data:", `img-src 'self' data: ${o.other.join(' ')}`)
      .replace("connect-src 'self'", `connect-src 'self' ${o.other.join(' ')}`)
  }
  reply.header('Content-Security-Policy', csp)
  reply.header('X-Frame-Options', preview ? 'SAMEORIGIN' : 'DENY')
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  return sendHtml(reply, doc)
}
