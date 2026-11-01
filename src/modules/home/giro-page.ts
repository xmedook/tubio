import { html, raw, type SafeHtml } from '../../lib/html.ts'
import { ic } from '../../views/sprite.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import type { Ctx } from '../../web/context.ts'
import { GIROS, GIRO_META, type Giro } from '../minisitio/giros.ts'
import { GIRO_COPY } from './giro-copy.ts'
import { GIRO_SITE } from './giro-site.ts'
import { salesLink } from './shell.ts'
import { siteShell } from './shell-site.ts'

/** Página pública de un giro (`/restaurantes`, `/belleza`…) con el diseño del sitio (bloque 1, 1-nov-2026): titular con marcatextos, teléfono con el ejemplo, seis bloques, pasos, precio como marcador y FAQ (SEO local). */
export function giroPage(ctx: Ctx, g: Giro, opts: { registrationOpen: boolean; pages?: { slug: string; title: string }[]; salesWhatsapp?: string }): SafeHtml {
  const { t, locale } = ctx
  const loc = locale === 'en' ? 'en' : 'es-MX'
  const m = GIRO_META[g]
  const c = GIRO_SITE[g][loc]
  const meta = GIRO_COPY[g][loc].meta
  const path = `/${m.slug}`
  const create = ctx.user ? `/panel/start?giro=${g}` : opts.registrationOpen ? `/register?giro=${g}` : '/#cierre'
  const sales = salesLink(opts.salesWhatsapp ?? '', locale === 'en' ? `Hi, I want a site for my ${g} business` : `Hola, quiero un sitio para mi negocio (${t(`giro.${g}`)})`)
  const faq = c.faq
  const label = t(`s1.g_${g}`)
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }).replace(/</g, '\\u003c')
  const arrow = ic('ar')

  const body = html`
<section class="hero"><div class="wrap hero-g">
  <div>
    <span class="chip chip-azul">${c.chip}</span>
    <h1 class="h1">${raw(c.h1)}</h1>
    <p class="lead">${c.lead}</p>
    <div class="btns row" style="margin-top:24px"><a class="btn" href="${create}">${t('s1.create')} ${arrow}</a><a class="btn btn-s" href="/armamos-por-ti">${t('s1.assisted')}</a></div>
    <p class="sm p" style="margin-top:14px">${t('s1.no_card')}${sales ? html` · <a href="${sales}" target="_blank" rel="noopener">${t('s1.whatsapp')}</a>` : ''}</p>
  </div>
  <div><div class="tel tilt"><img src="/_/static/img/ejemplos/${g}.webp?v=${ASSET_VERSION}" width="390" height="800" decoding="async" alt="${t('s1.example_alt', { giro: label })}"></div>
  <p class="sm" style="text-align:center;margin-top:14px"><a href="/${m.example}">${t('s1.example_see')}</a></p></div>
</div></section>

<section class="sec" id="ejemplos"><div class="wrap">
  <div class="sec-h"><span class="k">${t('s1.what_k')}</span><h2 class="h2">${t('s1.what_h', { giro: label.toLowerCase() })}</h2><p class="lead">${t('s1.what_lead')}</p></div>
  <div class="grid g3">${c.cards.map((x) => html`<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:10px;align-items:center"><h3 class="h4">${x.t}</h3><span class="chip chip-${x.chip}">${x.chipText}</span></div><p class="p sm">${x.d}</p></div>`)}</div>
</div></section>

<section class="sec"><div class="wrap hero-g">
  <div class="sec-h" style="margin:0"><span class="k">${t('s1.how_k')}</span><h2 class="h2">${t('s1.how_h')}</h2></div>
  <ol class="steps">${[1, 2, 3].map((n) => html`<li><div><b>${t(`s1.st${n}`)}</b><span>${t(`s1.st${n}d`)}</span></div></li>`)}</ol>
</div></section>

<section class="sec"><div class="wrap">
  <div class="sec-h"><span class="k">${t('s1.price_k')}</span><h2 class="h2">${t('s1.price_h')}</h2></div>
  <div class="card hi" style="max-width:520px;display:grid;gap:12px"><span class="k">${t('s1.price_of', { giro: label.toLowerCase() })}</span><div style="font:700 44px/1 var(--fd);letter-spacing:-.04em" aria-label="${t('s1.price_aria')}">${t('s1.price_val')}</div><p class="p sm">${t('s1.price_note')}</p><a class="btn" href="${create}">${t('s1.create')} ${arrow}</a></div>
</div></section>

<section class="sec"><div class="wrap hero-g">
  <div class="sec-h" style="margin:0"><span class="k">${t('s1.faq_k')}</span><h2 class="h2">${t('s1.faq_h')}</h2></div>
  <div class="faq">${faq.map((f) => html`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}</div>
</div></section>

<section class="sec"><div class="wrap">
  <div class="sec-h"><span class="k">${t('s1.others_k')}</span><h2 class="h2">${t('s1.others_h')}</h2></div>
  <div class="btns row" style="display:flex;flex-wrap:wrap;gap:10px">${GIROS.map((x) => (x === g ? html`<a class="btn btn-s btn-sm" href="/${GIRO_META[x].slug}" aria-current="page" style="background:var(--soft)">${t(`s1.g_${x}`)}</a>` : html`<a class="btn btn-s btn-sm" href="/${GIRO_META[x].slug}">${t(`s1.g_${x}`)}</a>`))}</div>
</div></section>

<section class="band" id="cierre"><div class="wrap hero-g">
  <div><h2 class="h2">${t('s1.band_h')}</h2><p class="lead" style="margin-top:10px">${t('s1.band_lead')}</p></div>
  <div class="btns row"><a class="btn" href="${create}">${t('s1.create')}</a><a class="btn btn-s" href="/armamos-por-ti">${t('s1.band_assist')}</a></div>
</div></section>`

  return siteShell(ctx, { title: `${c.h1.replace(/<[^>]+>/g, '')} · túbio`, description: meta, path, body, pages: opts.pages, mainHref: create, jsonLd: ld, nav: 'giros' })
}
