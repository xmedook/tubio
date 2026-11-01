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
  noindex?: boolean
  /** texto del botón principal de la cabecera (por defecto «Crear mi liga») */
  mainLabel?: string
}

type HeadOpts = Pick<SiteShellOpts, 'title' | 'description' | 'path' | 'jsonLd' | 'scripts'> & { noindex?: boolean }

export function siteHead(ctx: Ctx, o: HeadOpts): SafeHtml {
  const v = ASSET_VERSION
  return html`<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${o.title}</title>
<meta name="description" content="${o.description}">
<meta property="og:title" content="${o.title}">
<meta property="og:description" content="${o.description}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#fbfaf6">
${o.noindex ? html`<meta name="robots" content="noindex">` : ''}
<link rel="canonical" href="${ctx.baseUrl}${o.path === '/' ? '/' : o.path}">
${brandHead(ctx.baseUrl, { og: true })}
${HOME_FONTS.map((f) => html`<link rel="preload" href="/_/fonts/${f.file}" as="font" type="font/woff2" crossorigin>`)}
<link rel="stylesheet" href="/_/static/css/sitio.css?v=${v}">
${o.jsonLd ? html`<script type="application/ld+json" nonce="${ctx.nonce}">${raw(o.jsonLd)}</script>` : ''}
${(o.scripts ?? []).map((s) => html`<script type="module" src="/_/static/js/${s}?v=${v}" nonce="${ctx.nonce}"></script>`)}
</head>`
}

/**
 * Cabecera, pie y <head> del sitio público nuevo (diseño de design, 1-nov-2026, `sitio.css`): páginas por giro, alta asistida, acceso, ayuda y legales.
 * Sin barra fija de abajo: el diseño no la lleva.
 */
export function siteShell(ctx: Ctx, o: SiteShellOpts): SafeHtml {
  const { t, locale } = ctx
  const other = locale === 'es-MX' ? 'en' : 'es-MX'
  const next = encodeURIComponent(o.path)
  const cur = (k: string) => (o.nav === k ? raw(' aria-current="page"') : '')
  const nav = html`<a href="/#ejemplos">${t('s1.nav_examples')}</a><a href="/restaurantes"${cur('giros')}>${t('s1.nav_giros')}</a><a href="/directory"${cur('dir')}>${t('s1.nav_dir')}</a><a href="/help"${cur('help')}>${t('s1.nav_help')}</a>`
  return html`<html lang="${locale}">
${siteHead(ctx, o)}
<body>
<a class="skip" href="#main">${t('a11y.skip')}</a>
${sprite()}
<header class="top"><div class="wrap">
  <a class="logo" href="/" aria-label="${t('h2.home_aria')}">${wordmark(34)}</a>
  <nav class="nav" aria-label="${t('s1.nav_main')}">${nav}</nav>
  <div class="right">
    <a class="btn btn-t hide-m" href="/lang/${other}?next=${next}" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a>
    <a class="btn btn-s hide-m" href="${ctx.user ? '/panel' : '/login'}">${ctx.user ? t('h2.my_panel') : t('auth.login_link')}</a>
    <a class="btn" href="${o.mainHref}">${o.mainLabel ?? t('s1.create')}</a>
    <details class="mm"><summary aria-label="${t('s1.menu')}">${ic('menu')}</summary><nav aria-label="${t('s1.menu_mobile')}">${nav}<a href="${ctx.user ? '/panel' : '/login'}">${ctx.user ? t('h2.my_panel') : t('auth.login_link')}</a><a href="/lang/${other}?next=${next}" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a></nav></details>
  </div>
</div></header>
<main id="main">
${flashBox(ctx)}
${o.body}
</main>
<footer class="foot"><div class="wrap">
  <div class="foot-g">
    <div><a class="logo" href="/" aria-label="${t('h2.home_aria')}">${wordmark(30)}</a><p class="foot-tag">${t('s1.foot_tag')}</p></div>
    <div><h2>${t('s1.foot_giros')}</h2><ul>${GIROS.map((g) => html`<li><a href="/${GIRO_META[g].slug}">${t(`s1.g_${g}`)}</a></li>`)}</ul></div>
    <div><h2>${t('s1.foot_product')}</h2><ul><li><a href="/armamos-por-ti">${t('asist.title')}</a></li><li><a href="/directory">${t('s1.nav_dir')}</a></li><li><a href="/blog">${t('site.blog')}</a></li><li><a href="/help">${t('s1.nav_help')}</a></li>${(o.pages ?? []).map((p) => html`<li><a href="/p/${p.slug}">${p.title}</a></li>`)}<li><a href="/source">${t('h2.foot_source')}</a></li></ul></div>
    <div><h2>${t('s1.foot_legal')}</h2><ul><li><a href="/privacy">${t('legal.privacy')}</a></li><li><a href="/terms">${t('legal.terms')}</a></li><li><a href="/acceptable-use">${t('legal.aup')}</a></li><li><a href="/security">${t('legal.security')}</a></li></ul></div>
  </div>
  <p>${t('s1.foot_copy')}</p>
</div></footer>
</body>
</html>`
}

export type AuthSiteOpts = { title: string; path: string; h1: SafeHtml; sub?: string; body: SafeHtml; noindex?: boolean; scripts?: string[] }

/** Pantallas de acceso (diseño de design, bloque 3): panel de marca a la izquierda desde 960 px y tarjeta con el formulario. */
export function authSite(ctx: Ctx, o: AuthSiteOpts): SafeHtml {
  const { t, locale } = ctx
  const other = locale === 'es-MX' ? 'en' : 'es-MX'
  return html`<html lang="${locale}">
${siteHead(ctx, { title: `${o.title} · túbio`, description: t('s3.side_h'), path: o.path, noindex: o.noindex ?? true, scripts: [...(ctx.pow() ? ['pow.js'] : []), ...(o.scripts ?? [])] })}
<body>
<a class="skip" href="#main">${t('a11y.skip')}</a>
${sprite()}
<div class="auth">
<aside class="auth-side"><a class="logo" href="/" aria-label="${t('h2.home_aria')}">${wordmark(34, 'tinta')}</a>
  <div><h2 class="h2" style="color:var(--papel);margin-bottom:16px">${t('s3.side_h')}</h2>
  <ul class="ck" style="color:var(--papel)">${[1, 2, 3].map((n) => html`<li>${ic('check')}<div><b>${t(`s3.side${n}`)}</b><span style="color:#c9ccbf">${t(`s3.side${n}d`)}</span></div></li>`)}</ul></div>
  <p class="p sm"><span class="chip chip-lima">${t('s3.side_chip')}</span></p></aside>
<main id="main" class="auth-card">
  <a class="logo" href="/" aria-label="${t('h2.home_aria')}" style="justify-self:start">${wordmark(34)}</a>
  <div><h1 class="h2" style="margin-bottom:8px">${o.h1}</h1>${o.sub ? html`<p class="p">${o.sub}</p>` : ''}</div>
  ${flashBox(ctx)}
  ${o.body}
  <p class="p sm"><a href="/lang/${other}?next=${encodeURIComponent(o.path)}" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a> · <a href="/terms">${t('legal.terms')}</a> · <a href="/privacy">${t('legal.privacy')}</a></p>
</main>
</div>
</body>
</html>`
}
