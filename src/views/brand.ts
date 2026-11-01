import { html, type SafeHtml } from '../lib/html.ts'
import { ASSET_VERSION } from './layout.ts'

/**
 * Marca «túbio» (logo final de design, 1-nov-2026, opción B con acento). Archivos en public/img/brand/ y public/img/favicon.*.
 * Wordmark: viewBox 301×111. «papel» = tinta sobre fondo claro; «tinta» = claro con la tilde y el punto en lima, sobre fondo oscuro.
 */
const RATIO = 300.99 / 111

/** Wordmark SVG. `tono`: 'auto' (claro/oscuro del sistema), 'papel' (fondo claro) o 'tinta' (fondo oscuro). El acento y el punto ya vienen en el archivo. */
export function wordmark(h: number, tono: 'auto' | 'papel' | 'tinta' = 'papel', cls = 'wm'): SafeHtml {
  const w = Math.round(h * RATIO)
  const src = (t: string) => `/_/static/img/brand/tubio-logotipo-${t}.svg?v=${ASSET_VERSION}`
  const img = (t: string) => html`<img class="${cls}" src="${src(t)}" width="${w}" height="${h}" alt="">`
  if (tono !== 'auto') return img(tono)
  return html`<picture><source media="(prefers-color-scheme: dark)" srcset="${src('tinta')}">${img('papel')}</picture>`
}

/** Íconos, manifiesto y tarjeta de redes del <head> (todas las páginas de túbio). `origin` = baseUrl del sitio. */
export function brandHead(origin: string, o: { og?: boolean } = {}): SafeHtml {
  const v = ASSET_VERSION
  return html`<link rel="icon" href="/_/static/img/favicon.svg?v=${v}" type="image/svg+xml">
<link rel="icon" href="/_/static/img/brand/tubio-favicon-32.png?v=${v}" type="image/png" sizes="32x32">
<link rel="icon" href="/_/static/img/brand/tubio-favicon-16.png?v=${v}" type="image/png" sizes="16x16">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/_/static/img/brand/apple-touch-icon.png?v=${v}">
<link rel="manifest" href="/manifest.webmanifest">${o.og ? html`
<meta property="og:site_name" content="túbio">
<meta property="og:image" content="${origin}/_/static/img/og-tubio.png?v=${v}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="túbio">
<meta name="twitter:card" content="summary_large_image">` : ''}`
}
