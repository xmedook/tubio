import { formatNumber } from '../../lib/i18n.ts'
import { html, type SafeHtml } from '../../lib/html.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import { csrfField, flashBox, powAttr, powField } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import type { Plan } from '../plans/limits.ts'
import { hic } from './icons.ts'

/** Portada pública (diseño «Charla» de design, 23-oct-2026). Sin JS salvo la prueba de trabajo de la lista de espera. */
export function landingPage(
  ctx: Ctx,
  opts: { registrationOpen: boolean; joined?: boolean; error?: string; sourceUrl: string; pages?: { slug: string; title: string }[]; foundersLeft?: number; plans?: Plan[] },
): SafeHtml {
  const { t, locale } = ctx
  const other = locale === 'es-MX' ? 'en' : 'es-MX'
  const host = new URL(ctx.baseUrl).host
  const pow = ctx.pow()
  const n = (v: number) => formatNumber(locale, v)
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(cents / 100)
  const founders = opts.foundersLeft ?? 0

  const start = ctx.user
    ? html`<p><a class="btn btn-acento btn-grande" href="/panel">${t('home.go_panel')}</a></p>`
    : opts.registrationOpen
      ? html`<form class="reclamar" method="get" action="/register" role="search" aria-label="${t('claim.title')}">
        <label for="alias" class="r-l">${t('claim.title')}</label>
        <div class="r-fila"><span class="r-host" aria-hidden="true">${host}/</span>
          <input id="alias" name="alias" required minlength="3" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t('h2.claim_ph')}">
          <button class="btn btn-acento" type="submit">${t('claim.go')}</button></div>
        <p class="r-alt">${t('h2.or')} <a href="/register">${t('h2.with_email')}</a>${ctx.googleEnabled ? html` · <a href="/login/google">${t('h2.with_google')}</a>` : ''} · <a href="/login">${t('auth.login_link')}</a></p>
      </form>`
      : opts.joined
        ? html`<p class="flash-ok" role="status">${t('home.waitlist_ok')}</p>`
        : html`<form class="reclamar" method="post" action="/waitlist" novalidate${powAttr(pow)}>${csrfField(ctx)}
        <label for="wl-email" class="r-l">${t('home.waitlist_hint')}</label>
        <div class="r-fila"><input id="wl-email" type="email" name="email" required autocomplete="email" placeholder="${t('home.waitlist_placeholder')}">
          <button class="btn btn-acento" type="submit">${t('home.waitlist_submit')}</button></div>
        ${powField(ctx, pow)}
        ${opts.error ? html`<p class="error" role="alert">${t(opts.error)}</p>` : ''}
      </form>`

  const lim = (v: number, key: string) => (v < 0 ? t(`h2.unl_${key}`) : t(`h2.n_${key}`, { n: n(v) }))
  const planItems = (p: Plan): string[] => {
    const l = p.limits
    const items = [lim(l.bio_pages, 'bio'), lim(l.links, 'links'), lim(l.qr, 'qr'), t('h2.stats_days', { n: l.stats_days >= 365 ? t('h2.years', { n: Math.round(l.stats_days / 365) }) : t('h2.days', { n: l.stats_days }) })]
    if (l.custom_domains) items.push(l.custom_domains === 1 ? t('h2.one_domain') : t('h2.n_domains', { n: l.custom_domains }))
    if (l.team_members) items.push(t('h2.team', { n: l.team_members }))
    if (l.api) items.push(t('h2.api'))
    if (l.remove_branding && !l.api) items.push(t('h2.no_branding'))
    items.push(l.storage_mb >= 1024 ? t('h2.storage_gb', { n: Math.round(l.storage_mb / 1024) }) : t('h2.storage_mb', { n: l.storage_mb }))
    return items
  }
  const plans = (opts.plans ?? []).map((p) => {
    const top = p.slug === 'business'
    return html`<article class="plan${top ? ' destacado' : ''}"><header><h3>${p.name}</h3>${top && founders ? html`<span class="sello" data-fundadores>${t('h2.founders_seal')}</span>` : ''}</header>
      <p class="precio"><b>${p.price_month === null ? money(0) : money(p.price_month)}</b> <span>${p.price_month === null ? t('h2.forever') : p.price_year ? t('h2.per_month_or_year', { year: money(p.price_year) }) : t('h2.per_month')}</span></p>
      <ul>${planItems(p).map((x) => html`<li>${hic('check', 18)}<span>${x}</span></li>`)}</ul>
      <a class="btn ${top ? 'btn-acento' : 'btn-borde'}" href="/register">${p.price_month === null ? t('h2.start_free') : p.trial_days ? t('h2.try_days', { n: p.trial_days }) : t('plan.choose')}</a></article>`
  })

  const dias = [42, 38, 51, 47, 60, 55, 72, 66, 58, 61, 79, 84, 70, 68, 90, 95, 88, 76, 81, 99, 104, 97, 92, 110, 118, 101, 96, 124, 131, 127]
  const mx = Math.max(...dias)
  const bw = 300 / dias.length
  const bars = dias.map((v, i) => html`<rect x="${(i * bw + 1).toFixed(1)}" y="${(96 - (v / mx) * 96).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${((v / mx) * 96).toFixed(1)}" rx="2"/>`)
  const faq: [string, string][] = [1, 2, 3, 4, 5, 6].map((i) => [t(`h2.q${i}`), t(`h2.a${i}`)])

  return html`<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tubio · ${t('h2.title')}</title>
<meta name="description" content="${t('h2.meta')}">
<meta property="og:title" content="tubio · ${t('h2.title')}">
<meta property="og:description" content="${t('h2.meta')}">
<meta name="theme-color" content="#F2EEE3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0D1310" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${ctx.baseUrl}/">
<link rel="icon" href="/_/static/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/_/static/css/home-tokens.css?v=${ASSET_VERSION}">
<link rel="stylesheet" href="/_/static/css/home.css?v=${ASSET_VERSION}">
${!opts.registrationOpen && !ctx.user ? html`<script type="module" src="/_/static/js/pow.js?v=${ASSET_VERSION}" nonce="${ctx.nonce}"></script>` : ''}
</head>
<body>
<a class="saltar" href="#contenido">${t('a11y.skip')}</a>
<header class="cab">
  <div class="cab-in">
    <a class="marca" href="/" aria-label="${t('h2.home_aria')}">tubio</a>
    <nav class="cab-nav" aria-label="${t('nav.main')}">
      <a href="#funciones">${t('h2.nav_features')}</a><a href="#planes">${t('h2.nav_plans')}</a><a href="#preguntas">${t('h2.nav_faq')}</a>
    </nav>
    <a class="cab-l" href="/lang/${other}?next=/" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a>
    <a class="btn btn-chico btn-borde" href="${ctx.user ? '/panel' : '/login'}">${ctx.user ? t('h2.my_panel') : t('auth.login_link')}</a>
  </div>
</header>

<main id="contenido">
  ${flashBox(ctx)}
  <section class="hero">
    <div class="hero-txt">
      <p class="kicker">${hic('globe', 18)} ${t('h2.kicker')}</p>
      <h1>${t('h2.title')}</h1>
      <p class="lead">${t('h2.lead')}</p>
      ${founders ? html`<p class="fundadores" data-fundadores><span class="f-n" data-quedan>${n(founders)}</span><span><b>${t('h2.founders_left')}</b> ${t('h2.founders_body')}</span></p>` : ''}
      ${start}
    </div>
    <div class="demo" aria-hidden="true">
      <div class="phone"><div class="pb">
        <span class="pb-av">LC</span><span class="pb-n">Café La Ceiba</span><span class="pb-d">${t('h2.demo_desc')}</span>
        <span class="pb-btns">${([['wa', 'h2.demo_wa'], ['link', 'h2.demo_menu'], ['map', 'h2.demo_map'], ['cal', 'h2.demo_book']] as const).map(([i, k]) => html`<span class="pb-btn">${hic(i, 18)}<span>${t(k)}</span></span>`)}</span>
        <span class="pb-card"><span class="pb-h">${hic('clock', 16)} ${t('h2.demo_open')}</span><span class="pb-r">${t('h2.demo_hours')}</span></span>
        <span class="pb-soc">${hic('ig', 20)}${hic('tt', 20)}${hic('fb', 20)}</span>
      </div></div>
      <div class="toast"><span class="t-av">${hic('chart', 18)}</span><span>${t('h2.demo_toast')}<small>${t('h2.demo_toast_when')}</small></span></div>
    </div>
  </section>

  <section class="pasos" aria-labelledby="t-pasos">
    <h2 id="t-pasos">${t('h2.steps')}</h2>
    <ol>${[1, 2, 3].map((i) => html`<li><span class="p-n">${i}</span><span><b>${t(`h2.step${i}`)}</b><span>${t(`h2.step${i}_body`, { host })}</span></span></li>`)}</ol>
  </section>

  <section class="funciones" id="funciones" aria-labelledby="t-func">
    <div class="f-txt">
      <h2 id="t-func">${t('h2.features')}</h2>
      <ul class="filas">${(['btn', 'link', 'qr', 'chart'] as const).map((i, k) => html`<li><span class="f-av">${hic(i, 22)}</span><span class="f-b"><b>${t(`h2.f${k + 1}`)}</b><span>${t(`h2.f${k + 1}_body`, { host })}</span></span></li>`)}</ul>
    </div>
    <div class="f-vis"><div class="phone sm" aria-hidden="true"><div class="pp"><span class="pp-top"><b>tubio</b>${hic('search', 18)}</span>
      ${([['LC', 'Café La Ceiba', 'laceiba', '1 284'], ['link', t('h2.demo_menu'), 'ceiba-menu', '612'], ['qr', t('h2.demo_qr'), 'q/mesa', '388'], ['link', t('h2.demo_book'), 'ceiba-grupos', '97']] as const).map(([a, name, path, c]) => html`<span class="pp-row"><span class="pp-av">${a === 'LC' ? a : hic(a, 18)}</span><span class="pp-b"><b>${name}</b><span>${host}/${path}</span></span><span class="pp-c">${c}</span></span>`)}
      <span class="pp-fab">${hic('plus', 22)}</span><span class="pp-tabs">${([['link', t('nav.links')], ['qr', 'QR'], ['chart', t('nav.stats')], ['user', t('nav.account')]] as const).map(([i, label], k) => html`<span class="pp-tab${k === 0 ? ' on' : ''}"><span class="pp-ti">${hic(i, 18)}</span>${label}</span>`)}</span></div></div></div>
  </section>

  <section class="privacidad" aria-labelledby="t-priv">
    <div><h2 id="t-priv">${t('h2.privacy')}</h2><p>${t('h2.privacy_body')}</p></div>
    <figure class="stats" aria-label="${t('h2.stats_example')}">
      <p class="st-l">${t('h2.stats_label')}</p><p class="st-n">${n(2631)}</p><p class="st-d">${t('h2.stats_delta')}</p>
      <svg viewBox="0 0 300 96" width="100%" role="img" aria-label="${t('h2.stats_chart')}">${bars}</svg>
      <dl class="st-k"><div><dt>${t('h2.stats_clicks')}</dt><dd>${n(1075)}</dd></div><div><dt>${t('h2.stats_scans')}</dt><dd>${n(388)}</dd></div><div><dt>${t('h2.stats_ips')}</dt><dd>0</dd></div></dl>
    </figure>
  </section>

  ${plans.length ? html`<section class="planes" id="planes" aria-labelledby="t-planes">
    <h2 id="t-planes">${t('h2.nav_plans')}</h2>
    <p class="p-sub">${t('h2.plans_sub')}</p>
    <div class="p-lista">${plans}</div>
  </section>` : ''}

  <section class="libre" aria-labelledby="t-libre">
    <h2 id="t-libre">${t('h2.libre')}</h2>
    <p>${t('h2.libre_body')}</p>
    <a class="btn btn-borde" href="${opts.sourceUrl}">${t('h2.libre_cta')}</a>
  </section>

  <section class="faq" id="preguntas" aria-labelledby="t-faq">
    <h2 id="t-faq">${t('h2.faq')}</h2>
    ${faq.map(([q, a]) => html`<details><summary>${q}${hic('plus', 20, 'ic mas')}</summary><p>${a}</p></details>`)}
  </section>

  ${!ctx.user && opts.registrationOpen ? html`<section class="cierre"><h2>${t('h2.close')}</h2><a class="btn btn-acento btn-grande" href="/register">${t('h2.close_cta')}</a></section>` : ''}
</main>

<footer class="pie">
  <div class="pie-in">
    <div class="pie-marca"><span class="marca">tubio</span><p>${t('h2.foot_tag')}</p></div>
    <nav aria-label="${t('h2.foot_product')}"><h3>${t('h2.foot_product')}</h3><a href="/directory">${t('dir.title')}</a><a href="/blog">${t('site.blog')}</a><a href="/help">${t('help.title')}</a><a href="#planes">${t('h2.nav_plans')}</a>${(opts.pages ?? []).map((p) => html`<a href="/p/${p.slug}">${p.title}</a>`)}</nav>
    <nav aria-label="${t('h2.foot_legal')}"><h3>${t('h2.foot_legal')}</h3><a href="/terms">${t('legal.terms')}</a><a href="/privacy">${t('legal.privacy')}</a><a href="/acceptable-use">${t('legal.aup')}</a><a href="/security">${t('legal.security')}</a></nav>
    <nav aria-label="${t('h2.foot_code')}"><h3>${t('h2.foot_code')}</h3><a href="/source">${t('h2.foot_source')}</a><a href="/lang/${other}?next=/" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a></nav>
  </div>
</footer>
</body>
</html>`
}
