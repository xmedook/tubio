import { html, type SafeHtml } from '../../lib/html.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import { csrfField, powAttr, powField } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import { GIROS, GIRO_META, type Giro } from '../minisitio/giros.ts'
import { GIRO_COPY } from './giro-copy.ts'
import { hic } from './icons.ts'
import { homeShell, salesLink } from './shell.ts'
import { homeShellV3 } from './shell-v3.ts'

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

/**
 * Portada pública: el home de design (sección C, 31-oct-2026). Lima sobre crema, un solo camino («lo armamos por ti»), los 6 ejemplos reales,
 * el WhatsApp de ventas y un precio que sigue como marcador. Los planes y los fundadores ya no se muestran aquí (siguen en el panel).
 * Sin JS salvo el eco del nombre en la vista previa (home-v3.js) y la prueba de trabajo de la lista de espera.
 */
export function landingPage(
  ctx: Ctx,
  opts: { registrationOpen: boolean; joined?: boolean; error?: string; sourceUrl?: string; pages?: { slug: string; title: string }[]; salesWhatsapp?: string },
): SafeHtml {
  const { t, locale } = ctx
  const host = new URL(ctx.baseUrl).host
  const pow = ctx.pow()
  const sales = salesLink(opts.salesWhatsapp ?? '', locale === 'en' ? 'Hi, I want a site for my business' : 'Hola, quiero un sitio para mi negocio')
  const asist = '/armamos-por-ti'
  const arrow = hic('arrow', 18, '')
  const imgV = ASSET_VERSION

  const checks = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => html`<li>${hic('check', 20, '')}<div><b>${t(`h4.i${i}_t`)}</b><span>${t(`h4.i${i}_d`)}</span></div></li>`)
  const steps = [1, 2, 3].map((i) => html`<li><div><span class="n">0${i}</span><span class="t">${t(`h4.s${i}_t`)}<small>${t(`h4.s${i}_d`)}</small></span><span></span></div></li>`)
  const faq = [1, 2, 3, 4].map((i) => html`<details><summary>${t(`h4.q${i}`)}</summary><p>${t(`h4.a${i}`, { host })}</p></details>`)
  const examples = GIROS.map((g) => {
    const m = GIRO_META[g]
    return html`<figure class="ej"><div class="tel"><img src="/_/static/img/ejemplos/${g}.webp?v=${imgV}" width="390" height="800" loading="lazy" decoding="async" alt="${t('h4.ex_alt', { name: m.exampleName })}"></div>
      <figcaption><span class="k">${t(`giro.s_${g}`)}</span><b>${m.exampleName}</b><a class="lnk" href="/${m.example}">${t('h4.ex_open')}<span class="sr"> · ${m.exampleName}</span></a></figcaption></figure>`
  })
  const waitlist = ctx.user || opts.registrationOpen
    ? ''
    : opts.joined
      ? html`<p class="flash-ok" role="status">${t('home.waitlist_ok')}</p>`
      : html`<form class="wl" method="post" action="/waitlist" novalidate${powAttr(pow)}>${csrfField(ctx)}
        <label for="wl-email">${t('h4.wl_h')} · ${t('h4.wl_p')}</label>
        <input id="wl-email" type="email" name="email" required autocomplete="email" placeholder="${t('home.waitlist_placeholder')}">
        ${powField(ctx, pow)}
        ${opts.error ? html`<p class="error" role="alert">${t(opts.error)}</p>` : ''}
        <button class="btn" type="submit">${t('home.waitlist_submit')}${arrow}</button></form>`

  const body = html`
<section class="big hero2">
  <div>
    <span class="k">${t('h4.kicker')}</span>
    <h1 class="h1">${t('h4.h1_a')}<mark class="mk">${t('h4.h1_mark')}</mark>${t('h4.h1_b')}</h1>
    <p class="p">${t('h4.lead')}</p>
    <div class="prueba"><label for="neg">${t('h4.try_label')}</label><input id="neg" type="text" maxlength="60" placeholder="${t('h4.try_ph')}" autocomplete="off"><div class="url" aria-live="polite">${host}/<b id="slug">tunegocio</b></div></div>
    <div class="btns">
      <a class="btn" href="${asist}" data-negocio-href="${asist}">${t('h4.cta_main')}${arrow}</a>
      <a class="btn btn--2" href="#ejemplos">${t('h4.cta_examples')}</a>
      ${sales ? html`<a class="btn btn--2 btn--wa" href="${sales}" target="_blank" rel="noopener">${hic('wa', 18, '')}${t('h4.cta_person')}</a>` : ''}
    </div>
    ${opts.registrationOpen && !ctx.user ? html`<p class="alt"><a class="lnk" href="/register" data-negocio-href="/register" data-negocio-param="alias">${t('h4.cta_self')}</a></p>` : ''}
  </div>
  <div class="mini" role="img" aria-label="${t('h4.aria_try')}"><div class="m"><span class="k">${t('h4.prev_k')}</span><div class="nm" id="nm">${t('h4.prev_name')}</div><div class="b">${t('h4.prev_b1')}</div><div class="b s">${t('h4.prev_b2')}</div></div></div>
</section>

<section class="band" id="ejemplos"><div class="big">
  <span class="k">${t('h4.ex_k')}</span><h2 class="h2">${t('h4.ex_h')}</h2><p class="p">${t('h4.ex_p')}</p>
  <div class="rail" tabindex="0" role="region" aria-label="${t('h4.ex_rail')}">${examples}</div>
  <p class="giros-l">${t('h4.ex_by')}: ${GIROS.map((g) => html`<a href="/${GIRO_META[g].slug}">${t(`giro.s_${g}`)}</a>`)}</p>
</div></section>

<section class="band" id="incluye"><div class="big">
  <span class="k">${t('h4.inc_k')}</span><h2 class="h2">${t('h4.inc_h')}</h2>
  <ul class="chk">${checks}</ul>
</div></section>

<section class="band" id="como"><div class="big">
  <span class="k">${t('h4.how_k')}</span><h2 class="h2">${t('h4.how_h')}</h2>
  <ol class="nl">${steps}</ol>
</div></section>

<section class="band" id="precio"><div class="big">
  <span class="k">${t('h4.price_k')}</span><h2 class="h2">${t('h4.price_h')}</h2>
  <div class="precio"><span class="k">${t('h4.price_card')}</span><div class="n" role="img" aria-label="${t('h4.price_aria')}">$0,000</div><small>${t('h4.price_note')}</small>
    <a class="btn" href="${asist}">${t('h4.cta_site')}${arrow}</a></div>
</div></section>

<section class="band faq" id="preguntas"><div class="big">
  <span class="k">${t('h4.faq_k')}</span><h2 class="h2">${t('h4.faq_h')}</h2>
  ${faq}
</div></section>

<section class="band cierre" id="cierre"><div class="big">
  <h2 class="h2">${t('h4.close_h')}</h2><p class="p">${t('h4.close_p')}</p>
  <div class="btns"><a class="btn" href="${sales || asist}"${sales ? html` target="_blank" rel="noopener"` : ''}>${sales ? t('h4.close_wa') : t('h4.cta_main')}${arrow}</a></div>
  ${waitlist}
</div></section>`

  return homeShellV3(ctx, {
    title: `túbio · ${t('h4.title')}`,
    description: t('h4.meta'),
    path: '/',
    body,
    pages: opts.pages,
    salesWhatsapp: opts.salesWhatsapp,
    mainHref: asist,
    scripts: [...(!opts.registrationOpen && !ctx.user ? ['pow.js'] : []), 'home-v3.js'],
  })
}
