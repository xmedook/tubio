import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html, raw } from '../../lib/html.ts'
import type { Locale } from '../../lib/i18n.ts'
import { renderMarkdown } from '../../lib/markdown.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import { sendHtml } from '../../web/context.ts'
import { getSetting } from '../settings/repo.ts'
import { SOURCE_URL } from '../home/routes.ts'

/** Fecha de la versión vigente de los textos legales (cámbiala al editarlos) */
export const LEGAL_UPDATED = '2026-10-22'
const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../content/legal')
export const LEGAL_PAGES = { terms: 'terms', privacy: 'privacy', 'acceptable-use': 'acceptable-use' } as const

function load(name: string, locale: Locale): string {
  try {
    return readFileSync(join(DIR, `${name}.${locale}.md`), 'utf8')
  } catch {
    return readFileSync(join(DIR, `${name}.es-MX.md`), 'utf8')
  }
}

export function registerLegal(app: FastifyInstance, deps: AppDeps): void {
  const e = process.env
  const pending = '[pendiente]'
  const vars = (): Record<string, string> => ({
    UPDATED: LEGAL_UPDATED,
    OWNER_NAME: e.TUBIO_LEGAL_OWNER || pending,
    OWNER_ADDRESS: e.TUBIO_LEGAL_ADDRESS || pending,
    PRIVACY_EMAIL: e.TUBIO_PRIVACY_EMAIL || pending,
    CONTACT_EMAIL: e.TUBIO_CONTACT_EMAIL || e.TUBIO_PRIVACY_EMAIL || pending,
    JURISDICTION: e.TUBIO_JURISDICTION || pending,
    SOURCE_URL,
    RETENTION: String(getSetting(deps.db, 'stats_retention_days')),
  })

  for (const [path, file] of Object.entries(LEGAL_PAGES)) {
    app.get(`/${path}`, async (req, reply) => {
      const v = vars()
      // renderMarkdown escapa todo el texto, valores incluidos
      const md = load(file, req.ctx.locale).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => v[k] ?? '')
      const body = renderMarkdown(md)
      const title = /^#\s+(.+)$/m.exec(md)?.[1] ?? 'tubio'
      reply.header('Cache-Control', 'public, max-age=3600')
      return sendHtml(
        reply,
        html`<html lang="${req.ctx.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · tubio</title><link rel="stylesheet" href="/_/static/css/app.css?v=${ASSET_VERSION}"><link rel="icon" href="/_/static/img/favicon.svg"></head>
<body class="legal"><main id="main" class="wrap legal-text"><p><a class="brand" href="/">tu<span>bio</span></a></p>${raw(body)}
<p class="muted small"><a href="/terms">${req.ctx.t('legal.terms')}</a> · <a href="/privacy">${req.ctx.t('legal.privacy')}</a> · <a href="/acceptable-use">${req.ctx.t('legal.aup')}</a></p></main></body></html>`,
      )
    })
  }
}
