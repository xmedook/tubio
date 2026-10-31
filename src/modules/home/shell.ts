import { html, raw, type SafeHtml } from '../../lib/html.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import { flashBox } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import { hic } from './icons.ts'

/** WhatsApp de ventas (E.164 sin +) → enlace con mensaje de arranque; '' si no hay número */
export const salesLink = (number: string, text: string): string => (number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : '')

export type ShellOpts = {
  title: string
  description: string
  path: string
  body: SafeHtml
  pages?: { slug: string; title: string }[]
  salesWhatsapp?: string
  /** botón de la barra móvil: texto y destino; sin él no hay barra */
  bar?: { label: string; href: string }
  scripts?: string[]
  noindex?: boolean
  /** JSON-LD ya serializado */
  jsonLd?: string
}

/** Cabecera, pie y <head> de la portada y de las páginas por giro (diseño «Charla») */
export function homeShell(ctx: Ctx, o: ShellOpts): SafeHtml {
  const { t, locale } = ctx
  const other = locale === 'es-MX' ? 'en' : 'es-MX'
  const sales = salesLink(o.salesWhatsapp ?? '', locale === 'en' ? 'Hi, I want a site for my business' : 'Hola, quiero un sitio para mi negocio')
  const next = encodeURIComponent(o.path)
  return html`<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${o.title}</title>
<meta name="description" content="${o.description}">
<meta property="og:title" content="${o.title}">
<meta property="og:description" content="${o.description}">
<meta name="theme-color" content="#F2EEE3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D1310" media="(prefers-color-scheme: dark)">
${o.noindex ? html`<meta name="robots" content="noindex">` : html`<link rel="canonical" href="${ctx.baseUrl}${o.path === '/' ? '/' : o.path}">`}
<link rel="icon" href="/_/static/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/_/static/css/home-tokens.css?v=${ASSET_VERSION}">
<link rel="stylesheet" href="/_/static/css/home.css?v=${ASSET_VERSION}">
${(o.scripts ?? []).map((s) => html`<script type="module" src="/_/static/js/${s}?v=${ASSET_VERSION}" nonce="${ctx.nonce}"></script>`)}
${o.jsonLd ? html`<script type="application/ld+json" nonce="${ctx.nonce}">${raw(o.jsonLd)}</script>` : ''}
</head>
<body${o.bar ? html` class="con-barra"` : ''}>
<a class="saltar" href="#contenido">${t('a11y.skip')}</a>
<header class="cab">
  <div class="cab-in">
    <a class="marca" href="/" aria-label="${t('h2.home_aria')}">tubio</a>
    <nav class="cab-nav" aria-label="${t('nav.main')}">
      <a href="/#como">${t('h3.nav_how')}</a><a href="/#giros">${t('h3.nav_giros')}</a><a href="/#planes">${t('h2.nav_plans')}</a><a href="/#preguntas">${t('h2.nav_faq')}</a>
    </nav>
    ${sales ? html`<a class="cab-wa" href="${sales}" target="_blank" rel="noopener">${hic('wa', 18)}<span>${t('h3.whatsapp_short')}</span><span class="sr-only"> — ${t('h3.whatsapp')}</span></a>` : ''}
    <a class="cab-l" href="/lang/${other}?next=${next}" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a>
    <a class="btn btn-chico btn-borde" href="${ctx.user ? '/panel' : '/login'}">${ctx.user ? t('h2.my_panel') : t('auth.login_link')}</a>
  </div>
</header>

<main id="contenido">
  ${flashBox(ctx)}
  ${o.body}
</main>

<footer class="pie">
  <div class="pie-in">
    <div class="pie-marca"><span class="marca">tubio</span><p>${t('h2.foot_tag')}</p></div>
    <nav aria-label="${t('h2.foot_product')}"><h3>${t('h2.foot_product')}</h3><a href="/directory">${t('dir.title')}</a><a href="/blog">${t('site.blog')}</a><a href="/help">${t('help.title')}</a><a href="/#planes">${t('h2.nav_plans')}</a><a href="/armamos-por-ti">${t('asist.title')}</a>${(o.pages ?? []).map((p) => html`<a href="/p/${p.slug}">${p.title}</a>`)}</nav>
    <nav aria-label="${t('h2.foot_legal')}"><h3>${t('h2.foot_legal')}</h3><a href="/terms">${t('legal.terms')}</a><a href="/privacy">${t('legal.privacy')}</a><a href="/acceptable-use">${t('legal.aup')}</a><a href="/security">${t('legal.security')}</a></nav>
    <nav aria-label="${t('h2.foot_code')}"><h3>${t('h2.foot_code')}</h3><a href="/source">${t('h2.foot_source')}</a><a href="/lang/${other}?next=${next}" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a></nav>
  </div>
</footer>
${o.bar ? html`<div class="barra-m" role="region" aria-label="${t('h3.bar_create')}"><a class="btn btn-acento" href="${o.bar.href}">${o.bar.label}</a>${sales ? html`<a class="btn btn-borde" href="${sales}" target="_blank" rel="noopener" aria-label="${t('h3.whatsapp')}">${hic('wa', 20)}<span>${t('h3.whatsapp_short')}</span></a>` : ''}</div>` : ''}
</body>
</html>`
}
