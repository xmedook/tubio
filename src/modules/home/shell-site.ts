import { html, raw, type SafeHtml } from '../../lib/html.ts'
import { brandHead, wordmark } from '../../views/brand.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import { ic, sprite } from '../../views/sprite.ts'
import { flashBox } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import { GIROS, GIRO_META } from '../minisitio/giros.ts'
import { HOME_FONTS } from './fonts.ts'

export type SiteShellOpts = {
  title: string
  description: string
  path: string
  body: SafeHtml
  pages?: { slug: string; title: string }[]
  /** destino del botón principal de la cabecera */
  mainHref: string
  jsonLd?: string
  scripts?: string[]
  /** sección activa de la navegación */
  nav?: 'giros' | 'dir' | 'help'
}

/**
 * Cabecera, pie y <head> del sitio público nuevo (diseño de design, 1-nov-2026, `sitio.css`): páginas por giro, alta asistida, acceso, ayuda y legales.
 * La portada sigue con `homeShellV3` (su propia hoja). Sin barra fija de abajo: el diseño no la lleva.
 */
export function siteShell(ctx: Ctx, o: SiteShellOpts): SafeHtml {
  const { t, locale } = ctx
  const other = locale === 'es-MX' ? 'en' : 'es-MX'
  const next = encodeURIComponent(o.path)
  const v = ASSET_VERSION
  const cur = (k: string) => (o.nav === k ? raw(' aria-current="page"') : '')
  const nav = html`<a href="/#ejemplos">${t('s1.nav_examples')}</a><a href="/restaurantes"${cur('giros')}>${t('s1.nav_giros')}</a><a href="/directory"${cur('dir')}>${t('s1.nav_dir')}</a><a href="/help"${cur('help')}>${t('s1.nav_help')}</a>`
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
<link rel="stylesheet" href="/_/static/css/sitio.css?v=${v}">
${o.jsonLd ? html`<script type="application/ld+json" nonce="${ctx.nonce}">${raw(o.jsonLd)}</script>` : ''}
${(o.scripts ?? []).map((s) => html`<script type="module" src="/_/static/js/${s}?v=${v}" nonce="${ctx.nonce}"></script>`)}
</head>
<body>
<a class="skip" href="#main">${t('a11y.skip')}</a>
${sprite()}
<header class="top"><div class="wrap">
  <a class="logo" href="/" aria-label="${t('h2.home_aria')}">${wordmark(34)}</a>
  <nav class="nav" aria-label="${t('s1.nav_main')}">${nav}</nav>
  <div class="right">
    <a class="btn btn-t hide-m" href="/lang/${other}?next=${next}" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a>
    <a class="btn btn-s hide-m" href="${ctx.user ? '/panel' : '/login'}">${ctx.user ? t('h2.my_panel') : t('auth.login_link')}</a>
    <a class="btn" href="${o.mainHref}">${t('s1.create')}</a>
    <details class="mm"><summary aria-label="${t('s1.menu')}">${ic('menu')}</summary><nav aria-label="${t('s1.menu_mobile')}">${nav}<a href="${ctx.user ? '/panel' : '/login'}">${ctx.user ? t('h2.my_panel') : t('auth.login_link')}</a><a href="/lang/${other}?next=${next}" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a></nav></details>
  </div>
</div></header>
<main id="main">
${flashBox(ctx)}
${o.body}
</main>
<footer class="foot"><div class="wrap">
  <div class="foot-g">
    <div><a class="logo" href="/" aria-label="${t('h2.home_aria')}">${wordmark(30)}</a><p style="margin-top:10px;max-width:26em">${t('s1.foot_tag')}</p></div>
    <div><h2>${t('s1.foot_giros')}</h2><ul>${GIROS.map((g) => html`<li><a href="/${GIRO_META[g].slug}">${t(`s1.g_${g}`)}</a></li>`)}</ul></div>
    <div><h2>${t('s1.foot_product')}</h2><ul><li><a href="/armamos-por-ti">${t('asist.title')}</a></li><li><a href="/directory">${t('s1.nav_dir')}</a></li><li><a href="/blog">${t('site.blog')}</a></li><li><a href="/help">${t('s1.nav_help')}</a></li>${(o.pages ?? []).map((p) => html`<li><a href="/p/${p.slug}">${p.title}</a></li>`)}<li><a href="/source">${t('h2.foot_source')}</a></li></ul></div>
    <div><h2>${t('s1.foot_legal')}</h2><ul><li><a href="/privacy">${t('legal.privacy')}</a></li><li><a href="/terms">${t('legal.terms')}</a></li><li><a href="/acceptable-use">${t('legal.aup')}</a></li><li><a href="/security">${t('legal.security')}</a></li></ul></div>
  </div>
  <p>${t('s1.foot_copy')}</p>
</div></footer>
</body>
</html>`
}
