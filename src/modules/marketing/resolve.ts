import { randomInt } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html, type SafeHtml } from '../../lib/html.ts'
import { translator, type Locale } from '../../lib/i18n.ts'
import { imageUrl } from '../../lib/uploads.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import { sendHtml } from '../../web/context.ts'
import type { Link } from '../links/repo.ts'
import { deviceInfo } from '../stats/record.ts'
import { findUserById } from '../users/repo.ts'
import { limitsOf } from '../plans/limits.ts'
import { pixelCsp, pixelsForLink, type Pixel } from './pixels.ts'

export type Chosen = { url: string; variant: string | null }

/** Reglas en orden (la primera que coincide gana); si ninguna, A/B por pesos; si no, el destino base. */
export function chooseDestination(link: Link, ctx: { country: string | null; ua: string; lang: string | null }, rnd: (n: number) => number = randomInt): Chosen {
  const base = link.target_url ?? ''
  const t = link.targeting
  const dev = deviceInfo(ctx.ua)
  const os = (dev.os ?? '').toLowerCase()
  for (const r of t.rules ?? []) {
    const hit =
      (r.type === 'country' && ctx.country === r.value) ||
      (r.type === 'device' && dev.device === r.value) ||
      (r.type === 'lang' && (ctx.lang ?? '').startsWith(r.value)) ||
      (r.type === 'os' && (os === r.value || os.replace(/\s/g, '') === r.value.replace(/\s/g, '') || (r.value === 'ios' && os === 'ios') || (r.value === 'android' && os === 'android')))
    if (hit) return { url: r.url, variant: `${r.type}:${r.value}` }
  }
  const ab = t.ab ?? []
  if (ab.length) {
    // el destino base participa con el peso que sobre hasta 100
    const used = ab.reduce((a, x) => a + x.weight, 0)
    const pool = [...ab.map((x, i) => ({ url: x.url, w: x.weight, v: `ab:${i + 1}` })), ...(used < 100 ? [{ url: base, w: 100 - used, v: 'ab:0' }] : [])]
    const total = pool.reduce((a, x) => a + x.w, 0)
    let n = rnd(Math.max(1, Math.round(total * 100))) / 100
    for (const x of pool) {
      if ((n -= x.w) < 0) return { url: x.url, variant: x.v }
    }
  }
  return { url: base, variant: null }
}

function cspFor(nonce: string, px: Pixel[], frame?: string): string {
  const p = pixelCsp(px)
  return [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' ${p.script.join(' ')}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: ${p.other.join(' ')}`,
    `connect-src 'self' ${p.other.join(' ')}`,
    `frame-src ${frame ?? "'none'"}`,
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

function shell(nonce: string, locale: Locale, title: string, body: SafeHtml, px: Pixel[], extraHead: SafeHtml = html``): SafeHtml {
  const t = translator(locale)
  return html`<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title><link rel="stylesheet" href="/_/static/css/bio.css?v=${ASSET_VERSION}">${extraHead}
${px.length ? html`<script type="module" src="/_/static/js/pixels.js?v=${ASSET_VERSION}" nonce="${nonce}"></script>` : ''}
<script type="module" src="/_/static/js/go.js?v=${ASSET_VERSION}" nonce="${nonce}"></script>
</head><body class="bio go">${body}
${px.length ? html`<div id="tb-px" data-px="${JSON.stringify(px.map((p) => ({ k: p.kind, id: p.pixel_id })))}"></div>${pixelBar(t)}` : ''}</body></html>`
}

export function pixelBar(t: ReturnType<typeof translator>): SafeHtml {
  return html`<div class="px-bar" hidden role="dialog" aria-label="${t('mk.consent_title')}"><p>${t('mk.consent_text')} <a href="/privacy">${t('legal.privacy')}</a></p>
<div><button type="button" class="btn" data-px-no>${t('mk.consent_no')}</button><button type="button" class="btn btn-primary-px" data-px-yes>${t('mk.consent_yes')}</button></div></div>`
}

/**
 * Responde un enlace corto. Devuelve true si ya respondió con una página (splash, marco o píxeles);
 * false si el que llama debe redirigir a `dest`.
 */
export function respondShort(deps: AppDeps, req: FastifyRequest, reply: FastifyReply, link: Link, dest: string): boolean {
  const owner = findUserById(deps.db, link.user_id)
  if (!owner || !limitsOf(deps.db, owner, deps.now()).marketing) return false
  const locale = (owner?.locale ?? 'es-MX') as Locale
  const t = translator(locale)
  const nonce = req.ctx.nonce
  const px = pixelsForLink(deps.db, link.user_id, JSON.stringify(link.pixel_ids))
  const consent = req.cookies.tb_px === '1'
  const title = link.title || link.alias

  if (link.splash_id) {
    const row = deps.db.prepare('SELECT data FROM splashes WHERE id = ? AND user_id = ?').get(link.splash_id, link.user_id) as { data: string } | undefined
    if (row) {
      let d: Record<string, string | number> = {}
      try {
        d = JSON.parse(row.data)
      } catch {
        /* vacío */
      }
      const secs = Math.max(0, Math.min(30, Number(d.seconds) || 5))
      reply.header('Content-Security-Policy', cspFor(nonce, px))
      reply.header('Cache-Control', 'no-store')
      sendHtml(
        reply,
        shell(nonce, locale, String(d.title || title), html`<main class="col splash">
  ${d.image ? html`<img class="splash-img" src="${imageUrl(String(d.image))}" alt="">` : ''}
  ${d.title ? html`<h1 class="heading">${String(d.title)}</h1>` : ''}
  ${d.text ? html`<p class="para">${String(d.text)}</p>` : ''}
  ${d.ad_image ? html`<a class="splash-ad" href="${String(d.ad_url || '#')}" rel="sponsored noopener" target="_blank"><img src="${imageUrl(String(d.ad_image))}" alt="${t('mk.ad')}"></a>` : ''}
  <p class="splash-count" data-go="${dest}" data-secs="${secs}">${t('mk.redirecting_in', { n: secs })}</p>
  <a class="btn" href="${dest}" rel="noopener" data-go-btn>${String(d.button || t('mk.continue'))}</a>
  <footer class="made"><a href="${deps.config.baseUrl}/">${t('bio.made_with')} <b>tubio</b></a></footer>
</main>`, px),
      )
      return true
    }
  }

  if (link.cloak) {
    let origin = ''
    try {
      origin = new URL(dest).origin
    } catch {
      return false
    }
    reply.header('Content-Security-Policy', cspFor(nonce, px, origin))
    reply.header('Cache-Control', 'no-store')
    sendHtml(
      reply,
      shell(nonce, locale, title, html`<iframe class="cloak" src="${dest}" title="${title}" referrerpolicy="no-referrer-when-downgrade"></iframe>`, px, html`${link.data.seo_description ? html`<meta name="description" content="${String(link.data.seo_description)}">` : ''}`),
    )
    return true
  }

  // píxeles en un redirect: sólo si el visitante ya aceptó la medición antes (si no, redirect directo)
  if (px.length && consent) {
    reply.header('Content-Security-Policy', cspFor(nonce, px))
    reply.header('Cache-Control', 'no-store')
    sendHtml(reply, shell(nonce, locale, title, html`<main class="col splash"><p class="splash-count" data-go="${dest}" data-secs="1">${t('mk.redirecting')}</p><a class="btn" href="${dest}" rel="noopener">${t('mk.continue')}</a></main>`, px, html`<meta http-equiv="refresh" content="2;url=${dest}">`))
    return true
  }
  return false
}
