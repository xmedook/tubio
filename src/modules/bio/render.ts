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
import { findUserById } from '../users/repo.ts'
import { BLOCK_BY_TYPE, type BlockRow, type RenderCtx } from './blocks.ts'
import { FONTS, fontFaceCss, readDesign, themeById, type Design } from './design.ts'
import { EMBED_ORIGINS } from './embeds.ts'
import { listBlocks } from './repo.ts'

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
  const vars: [string, string][] = [
    ['--bg', bg],
    ['--text', d.text_color ?? th.text],
    ['--btn-bg', d.btn_bg ?? th.btnBg],
    ['--btn-text', d.btn_text ?? th.btnText],
    ['--btn-bc', d.btn_border_color ?? th.btnBorder],
    ['--btn-bw', `${d.btn_border_width ?? th.btnBorderWidth}px`],
    ['--btn-bs', d.btn_border_style],
    ['--btn-r', `${d.btn_radius ?? Math.min(th.radius, 40)}px`],
    ['--btn-sh', shadowCss(d.btn_shadow === 'theme' ? th.shadow : d.btn_shadow)],
    ['--font', font],
    ['--fs', `${d.font_size}px`],
    ['--col', WIDTH[d.width]],
    ['--gap', GAP[d.spacing]],
    ['--bg-filter', `blur(${d.bg_blur}px) brightness(${d.bg_brightness}%)`],
    ['--ann-bg', d.announce_bg],
    ['--ann-text', d.announce_color],
  ]
  const fontId = d.font === 'theme' ? th.font : d.font
  let css = fontFaceCss(fontId) + `:root{${vars.map(([k, v]) => `${k}:${v}`).join(';')}}`
  for (const b of blocks) {
    const st = b.style
    const rules: string[] = []
    if (st.text_color) rules.push(`--b-text:${st.text_color}`, `color:${st.text_color}`)
    if (st.bg_color) rules.push(`--b-bg:${st.bg_color}`)
    if (st.border_color) rules.push(`--b-bc:${st.border_color}`)
    if (st.align && st.align !== 'inherit') rules.push(`text-align:${st.align}`, `--b-justify:${st.align === 'left' ? 'flex-start' : st.align === 'right' ? 'flex-end' : 'center'}`)
    if (rules.length) css += `#b${b.id}{${rules.join(';')}}`
  }
  return css
}

export function visibleBlocks(blocks: BlockRow[], now: number): BlockRow[] {
  return blocks.filter((b) => b.is_enabled && (!b.starts_at || now >= b.starts_at) && (!b.ends_at || now < b.ends_at) && BLOCK_BY_TYPE.has(b.type))
}

export function bioCsp(nonce: string, preview: boolean): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    'media-src https:',
    `frame-src ${EMBED_ORIGINS.join(' ')}`,
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "manifest-src 'self'",
    `frame-ancestors ${preview ? "'self'" : "'none'"}`,
  ].join('; ')
}

/** Defensa extra: sólo http(s) aunque el formulario ya lo validó */
const web = (v: string): string | null => (/^https?:\/\//i.test(v) ? v : null)

export async function renderBioPage(deps: AppDeps, req: FastifyRequest, reply: FastifyReply, link: Link) {
  const d = readDesign(link.data)
  const owner = findUserById(deps.db, link.user_id)
  const preview = (req.query as Record<string, unknown>)._preview === '1' && req.ctx.user?.id === link.user_id
  if (web(d.leap_url) && !preview && redirectAllowed(deps.db, d.leap_url)) return reply.redirect(d.leap_url, 302)

  const locale: Locale = owner && isLocale(owner.locale) ? owner.locale : 'es-MX'
  const t = translator(locale)
  const blocks = visibleBlocks(listBlocks(deps.db, link.id), deps.now())
  const host = new URL(deps.config.baseUrl).hostname
  const rc: RenderCtx = { t, locale, host, verified: !!owner?.is_verified, badgeShown: { v: false }, now: deps.now() }
  const url = linkUrl(deps.config.baseUrl, link)
  const title = d.seo_title || link.title || link.alias
  const ogImage = d.seo_image ? `${deps.config.baseUrl}${imageUrl(d.seo_image)}` : null
  const nonce = req.ctx.nonce
  const forced = getSetting(deps.db, 'branding_forced')
  const showBrand = forced || d.show_branding
  const announce = d.announce_text
    ? html`<div class="announce pos-${d.announce_position}">${web(d.announce_url) ? html`<a href="${d.announce_url}">${d.announce_text}</a>` : d.announce_text}</div>`
    : ''

  const page: SafeHtml = html`<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${d.seo_description ? html`<meta name="description" content="${d.seo_description}">` : ''}
${d.seo_keywords ? html`<meta name="keywords" content="${d.seo_keywords}">` : ''}
${d.noindex || link.password_hash || link.is_sensitive ? html`<meta name="robots" content="noindex, nofollow">` : ''}
<link rel="canonical" href="${url}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${title}">
<meta property="og:url" content="${url}">
${d.seo_description ? html`<meta property="og:description" content="${d.seo_description}">` : ''}
${ogImage ? html`<meta property="og:image" content="${ogImage}"><meta name="twitter:card" content="summary_large_image">` : html`<meta name="twitter:card" content="summary">`}
<link rel="icon" href="${d.favicon ? imageUrl(d.favicon) : '/_/static/img/favicon.svg'}">
<link rel="stylesheet" href="/_/static/css/bio.css?v=${ASSET_VERSION}">
<style nonce="${nonce}">${raw(pageCss(d, blocks))}</style>
<script type="module" src="/_/static/js/bio.js?v=${ASSET_VERSION}" nonce="${nonce}"></script>
</head>
<body class="bio al-${d.align} anim-${d.animation} hov-${d.hover}${d.bg_type === 'image' && d.bg_image ? ' has-bg-img' : ''}">
<div class="bg" aria-hidden="true"></div>
${d.announce_position === 'top' ? announce : ''}
${d.share_button ? html`<button type="button" class="share-fab" data-share aria-label="${t('bio.share')}" title="${t('bio.share')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l4 4-1.4 1.4L13 6.8V15h-2V6.8L9.4 8.4 8 7zM5 11h3v2H6v6h12v-6h-2v-2h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z"/></svg></button>` : ''}
<main class="col" data-title="${title}" data-url="${url}" data-copied="${t('links.copied')}">
${blocks.length === 0 ? html`<p class="para empty">${t('bio.empty_public')}</p>` : ''}
${blocks.map((b, i) => html`<div class="blk blk-${b.type}" id="b${b.id}" data-i="${Math.min(i, 15)}">${(BLOCK_BY_TYPE.get(b.type) as NonNullable<ReturnType<typeof BLOCK_BY_TYPE.get>>).render(rc, b)}</div>`)}
${showBrand
  ? html`<footer class="made">${!forced && d.brand_text
      ? web(d.brand_url) ? html`<a href="${d.brand_url}">${d.brand_text}</a>` : d.brand_text
      : html`<a href="${deps.config.baseUrl}/">${t('bio.made_with')} <b>tubio</b></a>`}</footer>`
  : ''}
<p class="report"><a href="/_/report/${link.alias}" rel="nofollow">${t('abuse.link')}</a> · <a href="/terms" rel="nofollow">${t('legal.terms')}</a> · <a href="/privacy" rel="nofollow">${t('legal.privacy')}</a></p>
</main>
${d.announce_position === 'bottom' ? announce : ''}
</body>
</html>`

  reply.header('Content-Security-Policy', bioCsp(nonce, preview))
  reply.header('X-Frame-Options', preview ? 'SAMEORIGIN' : 'DENY')
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  return sendHtml(reply, page)
}
