import { html, type SafeHtml } from '../../lib/html.ts'
import type { Ctx } from '../../web/context.ts'
import { GIROS, GIRO_META, type Giro } from '../minisitio/giros.ts'
import { GIRO_COPY } from './giro-copy.ts'
import { hic } from './icons.ts'
import { giroPhone } from './landing.ts'
import { homeShell, salesLink } from './shell.ts'

/** Página pública de un giro (`/restaurantes`, `/belleza`…): misma estructura, ejemplo vivo y bloques del giro (SEO local) */
export function giroPage(ctx: Ctx, g: Giro, opts: { registrationOpen: boolean; pages?: { slug: string; title: string }[]; salesWhatsapp?: string }): SafeHtml {
  const { t, locale } = ctx
  const m = GIRO_META[g]
  const c = GIRO_COPY[g][locale === 'en' ? 'en' : 'es-MX']
  const path = `/${m.slug}`
  const create = ctx.user ? `/panel/start?giro=${g}` : opts.registrationOpen ? `/register?giro=${g}` : '/#cierre'
  const sales = salesLink(opts.salesWhatsapp ?? '', locale === 'en' ? `Hi, I want a site for my ${g} business` : `Hola, quiero un sitio para mi negocio (${t(`giro.${g}`)})`)
  const faq = [...c.faq, { q: t('h3.q8'), a: t('h3.a8') }]
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }).replace(/</g, '\\u003c')

  const body = html`
  <section class="hero">
    <div class="hero-txt">
      <p class="kicker">${hic('globe', 18)} ${t(`giro.${g}`)}</p>
      <h1>${c.h1}</h1>
      <p class="lead">${c.lead}</p>
      <div class="gp-cta">
        <a class="btn btn-acento btn-grande" href="${create}">${t('h3.giro_create')}</a>
        <a class="btn btn-borde btn-grande" href="/${m.example}">${t('h3.giro_example')}</a>
      </div>
      <p class="r-alt"><a class="r-asist" href="/armamos-por-ti">${t('h3.assisted_cta')} →</a>${sales ? html` · <a href="${sales}" target="_blank" rel="noopener">${t('h3.whatsapp')}</a>` : ''}</p>
    </div>
    <div class="demo" aria-hidden="true">${giroPhone(ctx, g, ' solo')}</div>
  </section>

  <section class="incluye" aria-labelledby="t-inc">
    <h2 id="t-inc">${t('h3.giro_includes')}</h2>
    <ul class="checks">${c.includes.map((x) => html`<li>${hic('check', 20)}<span>${x}</span></li>`)}</ul>
  </section>

  <section class="faq" aria-labelledby="t-faq">
    <h2 id="t-faq">${t('h3.giro_faq')}</h2>
    ${faq.map((f) => html`<details><summary>${f.q}${hic('plus', 20, 'ic mas')}</summary><p>${f.a}</p></details>`)}
  </section>

  <section class="gp-otros" aria-labelledby="t-otros">
    <h2 id="t-otros">${t('h3.giro_others')}</h2>
    <ul>${GIROS.filter((x) => x !== g).map((x) => html`<li><a href="/${GIRO_META[x].slug}">${t(`giro.${x}`)}</a></li>`)}</ul>
  </section>

  <section class="cierre"><h2>${t('h3.close')}</h2><div class="cierre-b"><a class="btn btn-acento btn-grande" href="${create}">${t('h3.close_cta')}</a>${sales ? html`<a class="btn btn-borde btn-grande" href="${sales}" target="_blank" rel="noopener">${hic('wa', 20)} ${t('h3.whatsapp')}</a>` : ''}</div></section>`

  return homeShell(ctx, {
    title: `${c.h1} · tubio`,
    description: c.meta,
    path,
    body,
    pages: opts.pages,
    salesWhatsapp: opts.salesWhatsapp,
    bar: { label: t('h3.bar_create'), href: create },
    scripts: [],
    jsonLd: ld,
  })
}
