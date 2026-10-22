import { html, type SafeHtml } from '../../lib/html.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import { csrfField, flashBox, powAttr, powField } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'

/** Portada pública. Sin JS salvo la prueba de trabajo de la lista de espera. */
export function landingPage(ctx: Ctx, opts: { registrationOpen: boolean; joined?: boolean; error?: string; sourceUrl: string; pages?: { slug: string; title: string }[] }): SafeHtml {
  const { t } = ctx
  const other = ctx.locale === 'es-MX' ? 'en' : 'es-MX'
  const pow = ctx.pow()
  const features: [string, string, string][] = [
    ['bio', t('home.f_bio'), t('home.f_bio_body')],
    ['short', t('home.f_short'), t('home.f_short_body')],
    ['qr', t('home.f_qr'), t('home.f_qr_body')],
    ['stats', t('home.f_stats'), t('home.f_stats_body')],
  ]
  const cta = ctx.user
    ? html`<a class="btn btn-primary btn-lg" href="/panel">${t('home.go_panel')}</a>`
    : opts.registrationOpen
      ? html`<a class="btn btn-primary btn-lg" href="/register">${t('home.cta_register')}</a><a class="btn btn-lg" href="/login">${t('auth.login_link')}</a>`
      : opts.joined
        ? html`<p class="flash flash-ok" role="status">${t('home.waitlist_ok')}</p>`
        : html`<form class="waitlist" method="post" action="/waitlist" novalidate${powAttr(pow)}>
  ${csrfField(ctx)}
  <label class="sr-only" for="wl-email">${t('auth.email')}</label>
  <input id="wl-email" type="email" name="email" required autocomplete="email" placeholder="${t('home.waitlist_placeholder')}">
  <button class="btn btn-primary" type="submit">${t('home.waitlist_submit')}</button>
  ${powField(ctx, pow)}
  ${opts.error ? html`<p class="error" role="alert">${t(opts.error)}</p>` : ''}
  <p class="hint">${t('home.waitlist_hint')} <a href="/login">${t('auth.login_link')}</a></p>
</form>`

  return html`<html lang="${ctx.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tubio · ${t('home.title')}</title>
<meta name="description" content="${t('home.lead')}">
<meta property="og:title" content="tubio · ${t('home.title')}">
<meta property="og:description" content="${t('home.lead')}">
<link rel="canonical" href="${ctx.baseUrl}/">
<link rel="stylesheet" href="/_/static/css/app.css?v=${ASSET_VERSION}">
<link rel="icon" href="/_/static/img/favicon.svg" type="image/svg+xml">
<script type="module" src="/_/static/js/pow.js?v=${ASSET_VERSION}" nonce="${ctx.nonce}"></script>
</head>
<body class="home">
<header class="home-top">
  <a class="brand" href="/">tu<span>bio</span></a>
  <nav><a href="/lang/${other}?next=/" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a> <a href="/login">${t('auth.login_link')}</a></nav>
</header>
<main id="main">
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">${t('home.eyebrow')}</p>
      <h1>${t('home.title')}</h1>
      <p class="lead">${t('home.lead')}</p>
      ${flashBox(ctx)}
      <div class="hero-cta">${cta}</div>
    </div>
    <div class="hero-phone" aria-hidden="true">
      <div class="mock">
        <span class="mock-avatar"></span>
        <span class="mock-name">Ana · fotografía</span>
        <span class="mock-icons"><i></i><i></i><i></i><i></i></span>
        <span class="mock-btn mock-btn-hi">Agenda una sesión</span>
        <span class="mock-btn">Portafolio 2026</span>
        <span class="mock-btn">Tienda de impresiones</span>
        <span class="mock-btn">Curso en línea</span>
      </div>
    </div>
  </section>
  <section class="features" aria-label="${t('home.features')}">
    ${features.map(([k, title, body]) => html`<article class="feature f-${k}"><h2>${title}</h2><p>${body}</p></article>`)}
  </section>
  <section class="free">
    <h2>${t('home.free_title')}</h2>
    <p>${t('home.free_body')}</p>
    <p><a class="btn" href="${opts.sourceUrl}">${t('home.free_cta')}</a></p>
  </section>
</main>
<footer class="foot"><a href="/blog">${t('site.blog')}</a> · ${(opts.pages ?? []).map((p) => html`<a href="/p/${p.slug}">${p.title}</a> · `)}<a href="/terms">${t('legal.terms')}</a> · <a href="/privacy">${t('legal.privacy')}</a> · <a href="/acceptable-use">${t('legal.aup')}</a> · <a href="/source">${t('foot.source')}</a></footer>
</body>
</html>`
}
