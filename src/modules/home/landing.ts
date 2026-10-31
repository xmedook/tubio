import { formatNumber } from '../../lib/i18n.ts'
import { html, type SafeHtml } from '../../lib/html.ts'
import { csrfField, powAttr, powField } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import { GIROS, GIRO_META, type Giro } from '../minisitio/giros.ts'
import type { Plan } from '../plans/limits.ts'
import { GIRO_COPY } from './giro-copy.ts'
import { hic } from './icons.ts'
import { homeShell, salesLink } from './shell.ts'

type Loc = 'es-MX' | 'en'
const copyOf = (g: Giro, locale: string) => GIRO_COPY[g][locale === 'en' ? 'en' : 'es-MX']

/** Teléfono de muestra de un giro; el nombre sigue lo que la persona escribe en el campo de alias (home.js) */
export function giroPhone(ctx: Ctx, g: Giro, cls = ''): SafeHtml {
  const m = GIRO_META[g]
  const c = copyOf(g, ctx.locale)
  const initials = m.exampleName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return html`<div class="dg dg-${g}${cls}" data-giro="${g}"><div class="phone"><div class="pb" style="--c1:${m.c1};--c2:${m.c2}">
    <span class="pb-cov" aria-hidden="true"></span>
    <span class="pb-av">${initials}</span><span class="pb-n" data-eco="${m.exampleName}">${m.exampleName}</span><span class="pb-d">${c.tag}</span>
    <span class="pb-btns">${c.btns.map((b, i) => html`<span class="pb-btn${i === 0 ? '' : ' alt'}">${hic(i === 0 ? 'wa' : i === 1 ? 'link' : 'map', 18)}<span>${b}</span></span>`)}</span>
    <span class="pb-card"><span class="pb-h">${hic('clock', 16)} ${ctx.t('h2.demo_open')}</span><span class="pb-r">${ctx.t('h2.demo_hours')}</span></span>
  </div></div></div>`
}

/** Portada pública (diseño «Charla» + minisitios por giro, PLAN-HELLOLINK §4). Sin JS salvo el eco del nombre y la prueba de trabajo de la lista de espera. */
export function landingPage(
  ctx: Ctx,
  opts: { registrationOpen: boolean; joined?: boolean; error?: string; sourceUrl: string; pages?: { slug: string; title: string }[]; foundersLeft?: number; plans?: Plan[]; salesWhatsapp?: string },
): SafeHtml {
  const { t, locale } = ctx
  const host = new URL(ctx.baseUrl).host
  const pow = ctx.pow()
  const n = (v: number) => formatNumber(locale, v)
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(cents / 100)
  const founders = opts.foundersLeft ?? 0
  const sales = salesLink(opts.salesWhatsapp ?? '', locale === 'en' ? 'Hi, I want a site for my business' : 'Hola, quiero un sitio para mi negocio')
  const chips = html`<fieldset class="chips"><legend class="r-l">${t('h3.pick_giro')}</legend>${GIROS.map((g, i) => html`<span class="chip"><input type="radio" name="giro" id="g-${g}" value="${g}"${i === 0 ? html` checked` : ''}><label for="g-${g}">${t(`giro.s_${g}`)}</label></span>`)}</fieldset>`
  const createHref = ctx.user ? '/panel/start' : opts.registrationOpen ? '/register' : '#cierre'

  const start = ctx.user
    ? html`<form class="reclamar" method="get" action="/panel/start">${chips}<p><button class="btn btn-acento btn-grande" type="submit">${t('h3.close_cta')}</button></p></form>`
    : opts.registrationOpen
      ? html`<form class="reclamar" id="crear" method="get" action="/register" aria-label="${t('claim.title')}">
        ${chips}
        <label for="alias" class="r-l">${t('claim.title')}</label>
        <div class="r-fila"><span class="r-host" aria-hidden="true">${host}/</span>
          <input id="alias" name="alias" required minlength="3" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t('h2.claim_ph')}" data-eco-input>
          <button class="btn btn-acento" type="submit">${t('claim.go')}</button></div>
        <p class="r-alt">${t('h2.or')} <a href="/register">${t('h2.with_email')}</a>${ctx.googleEnabled ? html` · <a href="/login/google">${t('h2.with_google')}</a>` : ''} · <a href="/login">${t('auth.login_link')}</a></p>
        <p class="r-alt"><a class="r-asist" href="/armamos-por-ti">${t('h3.assisted_cta')} →</a></p>
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


  const faq: [string, string][] = [1, 2, 3, 4, 5, 6].map((i) => [t(`h2.q${i}`), t(`h2.a${i}`)] as [string, string]).concat([[t('h3.q7'), t('h3.a7')], [t('h3.q8'), t('h3.a8')]])

  const body = html`
  <section class="hero">
    <div class="hero-txt">
      <p class="kicker">${hic('globe', 18)} ${t('h3.kicker')}</p>
      <h1>${t('h3.title')}</h1>
      <p class="lead">${t('h3.lead')}</p>
      ${founders ? html`<p class="fundadores" data-fundadores><span class="f-n" data-quedan>${n(founders)}</span><span><b>${t('h2.founders_left')}</b> ${t('h2.founders_body')}</span></p>` : ''}
      ${start}
    </div>
    <div class="demo" aria-hidden="true">
      <p class="demo-l">${t('h3.preview_for')}</p>
      ${GIROS.map((g) => giroPhone(ctx, g))}
      <div class="toast"><span class="t-av">${hic('wa', 18)}</span><span>${t('h2.demo_toast')}<small>${t('h2.demo_toast_when')}</small></span></div>
    </div>
  </section>

  <section class="ejemplos" aria-labelledby="t-ej">
    <h2 id="t-ej">${t('h3.examples')}</h2><p class="p-sub">${t('h3.examples_sub')}</p>
    <ul class="ejs">${GIROS.map((g) => html`<li><a class="ej" href="/${GIRO_META[g].example}" style="--c1:${GIRO_META[g].c1};--c2:${GIRO_META[g].c2}"><span class="ej-g">${t(`giro.${g}`)}</span><b>${GIRO_META[g].exampleName}</b><span class="ej-go">${t('h3.open_example')} →</span></a></li>`)}</ul>
  </section>

  <section class="pasos" id="como" aria-labelledby="t-pasos">
    <h2 id="t-pasos">${t('h3.steps')}</h2>
    <ol>${[1, 2, 3].map((i) => html`<li><span class="p-n">${i}</span><span><b>${t(`h3.step${i}`)}</b><span>${t(`h3.step${i}_body`, { host })}</span></span></li>`)}</ol>
    <div class="asist"><div><h3>${t('h3.assisted')}</h3><p>${t('h3.assisted_body')}</p></div><a class="btn btn-borde" href="/armamos-por-ti">${t('h3.assisted_go')}</a></div>
  </section>

  <section class="incluye" aria-labelledby="t-inc">
    <h2 id="t-inc">${t('h3.includes')}</h2>
    <ul class="checks">${[1, 2, 3, 4, 5, 6, 7].map((i) => html`<li>${hic('check', 20)}<span>${t(`h3.inc${i}`)}</span></li>`)}</ul>
  </section>

  <section class="giros" id="giros" aria-labelledby="t-giros">
    <h2 id="t-giros">${t('h3.giros')}</h2><p class="p-sub">${t('h3.giros_sub')}</p>
    <div class="giro-cards">${GIROS.map((g) => {
      const c = copyOf(g, locale)
      return html`<article class="giro-card"><h3>${t(`giro.${g}`)}</h3><ul>${c.includes.slice(0, 3).map((x) => html`<li>${hic('check', 16)}<span>${x}</span></li>`)}</ul><a href="/${GIRO_META[g].slug}">${t('h3.see_giro')} →</a></article>`
    })}</div>
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

  <section class="cierre" id="cierre"><h2>${t('h3.close')}</h2>
    <div class="cierre-b">${!ctx.user && opts.registrationOpen ? html`<a class="btn btn-acento btn-grande" href="/register">${t('h3.close_cta')}</a>` : ctx.user ? html`<a class="btn btn-acento btn-grande" href="/panel/start">${t('h3.close_cta')}</a>` : ''}
    ${sales ? html`<a class="btn btn-borde btn-grande" href="${sales}" target="_blank" rel="noopener">${hic('wa', 20)} ${t('h3.whatsapp')}</a>` : ''}</div></section>`

  return homeShell(ctx, {
    title: `tubio · ${t('h3.title')}`,
    description: t('h3.meta'),
    path: '/',
    body,
    pages: opts.pages,
    salesWhatsapp: opts.salesWhatsapp,
    bar: ctx.user || opts.registrationOpen ? { label: t('h3.bar_create'), href: createHref } : undefined,
    scripts: [...(!opts.registrationOpen && !ctx.user ? ['pow.js'] : []), 'home.js'],
  })
}
