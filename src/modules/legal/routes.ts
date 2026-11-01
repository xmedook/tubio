import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import type { Locale } from '../../lib/i18n.ts'
import { sendHtml } from '../../web/context.ts'
import { getSetting } from '../settings/repo.ts'
import { SOURCE_URL } from '../home/routes.ts'
import { docPage } from '../home/doc-page.ts'

/** Fecha de la versión vigente de los textos legales (cámbiala al editarlos) */
export const LEGAL_UPDATED = '2026-10-22'
const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../content/legal')
export const LEGAL_PAGES = { terms: 'terms', privacy: 'privacy', 'acceptable-use': 'acceptable-use', security: 'security' } as const

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
    SECURITY_EMAIL: securityEmail(),
  })
  const securityEmail = () => e.TUBIO_SECURITY_EMAIL || e.TUBIO_CONTACT_EMAIL || 'hola@tubio.link'

  // RFC 9116
  app.get('/.well-known/security.txt', async (_req, reply) => {
    const base = deps.config.baseUrl
    const expires = new Date(deps.now() + 300 * 86400_000).toISOString().replace(/\.\d+Z$/, 'Z')
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.type('text/plain; charset=utf-8').send(
      [`Contact: mailto:${securityEmail()}`, `Expires: ${expires}`, 'Preferred-Languages: es, en', `Canonical: ${base}/.well-known/security.txt`, `Policy: ${base}/security`, ''].join('\n'),
    )
  })
  app.get('/security.txt', async (_req, reply) => reply.redirect('/.well-known/security.txt', 301))

  for (const [path, file] of Object.entries(LEGAL_PAGES)) {
    app.get(`/${path}`, async (req, reply) => {
      const v = vars()
      // renderMarkdown escapa todo el texto, valores incluidos
      const md = load(file, req.ctx.locale).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => v[k] ?? '')
      reply.header('Cache-Control', 'public, max-age=3600')
      return sendHtml(reply, docPage(req.ctx, { md, path: `/${path}`, kicker: req.ctx.t('s6.legal'), tocLabel: req.ctx.t('s6.toc_legal') }))
    })
  }
}
