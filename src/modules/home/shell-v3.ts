import { html, type SafeHtml } from '../../lib/html.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import { flashBox } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import { HOME_FONTS } from './fonts.ts'
import { hic } from './icons.ts'
import { salesLink } from './shell.ts'
import { brandHead, wordmark } from '../../views/brand.ts'

export type ShellV3Opts = {
  title: string
  description: string
  path: string
  body: SafeHtml
  pages?: { slug: string; title: string }[]
  salesWhatsapp?: string
  /** destino del botón principal (barra de arriba y barra fija de abajo) */
  mainHref: string
  scripts?: string[]
}

/** Cabecera, pie, barra fija y <head> del home nuevo (diseño de design, sección C). Las páginas por giro y la alta asistida siguen con `homeShell`. */
export function homeShellV3(ctx: Ctx, o: ShellV3Opts): SafeHtml {
  const { t, locale } = ctx
  const other = locale === 'es-MX' ? 'en' : 'es-MX'
  const next = encodeURIComponent(o.path)
  const sales = salesLink(o.salesWhatsapp ?? '', locale === 'en' ? 'Hi, I want a site for my business' : 'Hola, quiero un sitio para mi negocio')
  const v = ASSET_VERSION
  return html`<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${o.title}</title>
<meta name="description" content="${o.description}">
<meta property="og:title" content="${o.title}">
<meta property="og:description" content="${o.description}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#fbfaf6">
<link rel="canonical" href="${ctx.baseUrl}${o.path === '/' ? '/' : o.path}">
${brandHead(ctx.baseUrl, { og: true })}
${HOME_FONTS.map((f) => html`<link rel="preload" href="/_/fonts/${f.file}" as="font" type="font/woff2" crossorigin>`)}
<link rel="stylesheet" href="/_/static/css/home-v3.css?v=${v}">
${(o.scripts ?? []).map((s) => html`<script type="module" src="/_/static/js/${s}?v=${v}" nonce="${ctx.nonce}"></script>`)}
</head>
<body>
<a class="saltar" href="#contenido">${t('a11y.skip')}</a>
<div class="strip">${t('h4.strip')}</div>
<header class="bar"><div class="big bar-in">
  <a class="logo" href="/" aria-label="${t('h2.home_aria')}">${wordmark(30)}</a>
  <div class="bar-r">
    <a class="hl" href="${ctx.user ? '/panel' : '/login'}">${ctx.user ? t('h2.my_panel') : t('auth.login_link')}</a>
    <a class="hl" href="/lang/${other}?next=${next}" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a>
    <a class="btn" href="${o.mainHref}">${t('h4.cta_bar')}${hic('arrow', 18, '')}</a>
  </div>
</div></header>
<main id="contenido">
${flashBox(ctx)}
${o.body}
</main>
<footer class="foot"><div class="big">
  <nav aria-label="${t('h2.foot_legal')}"><a href="/privacy">${t('legal.privacy')}</a><a href="/terms">${t('legal.terms')}</a><a href="/acceptable-use">${t('legal.aup')}</a><a href="/security">${t('legal.security')}</a></nav>
  <nav aria-label="${t('h2.foot_product')}"><a href="/armamos-por-ti">${t('asist.title')}</a><a href="/directory">${t('dir.title')}</a><a href="/blog">${t('site.blog')}</a><a href="/help">${t('help.title')}</a>${(o.pages ?? []).map((p) => html`<a href="/p/${p.slug}">${p.title}</a>`)}<a href="/source">${t('h2.foot_source')}</a></nav>
  <p class="foot-n">${wordmark(22)}<span>${t('h4.foot_note')}</span></p>
</div></footer>
<div class="cta" role="region" aria-label="${t('h4.aria_bar')}"><div class="col">
  <a class="btn" href="${o.mainHref}">${t('h4.cta_bar')}${hic('arrow', 18, '')}</a>
  ${sales ? html`<a class="wa" href="${sales}" target="_blank" rel="noopener" aria-label="${t('h3.whatsapp')}">${hic('wa', 22, '')}</a>` : ''}
</div></div>
</body>
</html>`
}
