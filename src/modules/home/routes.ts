import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { isLocale } from '../../lib/i18n.ts'
import { cookieOpts, LANG_COOKIE, powOk, safeNext, sendHtml } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { getSetting } from '../settings/repo.ts'
import { landingPage } from './landing.ts'
import { updateUser } from '../users/repo.ts'

export const SOURCE_URL = process.env.TUBIO_SOURCE_URL ?? 'https://github.com/xmedook/tubio'

export function registerHome(app: FastifyInstance, deps: AppDeps): void {
  app.get('/', async (req, reply) => {
    if (req.ctx.domainId) {
      // raíz de un dominio propio: su página de inicio elegida, o nada
      const d = deps.db.prepare('SELECT home_link_id FROM domains WHERE id = ?').get(req.ctx.domainId) as { home_link_id: number | null } | undefined
      const l = d?.home_link_id ? (deps.db.prepare('SELECT alias, domain_id FROM links WHERE id = ?').get(d.home_link_id) as { alias: string; domain_id: number } | undefined) : undefined
      return l && l.domain_id === req.ctx.domainId ? reply.redirect(`/${l.alias}`, 302) : reply.callNotFound()
    }
    const joined = (req.query as { joined?: string }).joined === '1'
    return sendHtml(reply, landingPage(req.ctx, { registrationOpen: getSetting(deps.db, 'registration_open'), joined, sourceUrl: SOURCE_URL }))
  })

  app.post('/waitlist', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const page = (error: string) =>
      sendHtml(reply, landingPage(req.ctx, { registrationOpen: getSetting(deps.db, 'registration_open'), error, sourceUrl: SOURCE_URL }), 422)
    if (!powOk(deps, req.body)) return page('err.pow')
    const email = field(req.body, 'email').trim().toLowerCase()
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return page('err.email')
    deps.db.prepare('INSERT OR IGNORE INTO waitlist (email, locale, created_at) VALUES (?, ?, ?)').run(email, req.ctx.locale, deps.now())
    return reply.redirect('/?joined=1', 303)
  })

  app.get('/lang/:locale', async (req, reply) => {
    const { locale } = req.params as { locale: string }
    const next = safeNext((req.query as { next?: string }).next, '/')
    if (isLocale(locale)) {
      reply.setCookie(LANG_COOKIE, locale, cookieOpts(deps, 365 * 24 * 3600))
      if (req.ctx.user) updateUser(deps.db, req.ctx.user.id, { locale }, deps.now())
    }
    return reply.redirect(next, 303)
  })

  app.get('/robots.txt', async (_req, reply) =>
    reply.type('text/plain').send('User-agent: *\nDisallow: /panel\nDisallow: /admin\nDisallow: /_/c/\nDisallow: /_/stats/\n'),
  )
  app.get('/favicon.ico', async (_req, reply) => reply.redirect('/_/static/img/favicon.svg', 301))

  // AGPL §13: quien usa el servicio por red puede obtener el código fuente
  app.get('/source', async (_req, reply) => reply.redirect(SOURCE_URL, 302))
}
