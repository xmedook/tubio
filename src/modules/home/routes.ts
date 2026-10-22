import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { isLocale } from '../../lib/i18n.ts'
import { authLayout } from '../../views/layout.ts'
import { cookieOpts, LANG_COOKIE, safeNext, sendHtml } from '../../web/context.ts'
import { updateUser } from '../users/repo.ts'

export const SOURCE_URL = process.env.TUBIO_SOURCE_URL ?? 'https://github.com/xmedook/tubio'

export function registerHome(app: FastifyInstance, deps: AppDeps): void {
  app.get('/', async (req, reply) => {
    const { t } = req.ctx
    return sendHtml(
      reply,
      authLayout(req.ctx, {
        title: t('home.title'),
        path: '/',
        body: html`<h1>${t('home.title')}</h1>
<p class="lead">${t('home.lead')}</p>
${req.ctx.user
  ? html`<a class="btn btn-primary btn-block" href="/panel">${t('home.go_panel')}</a>`
  : html`<a class="btn btn-primary btn-block" href="/register">${t('auth.register_submit')}</a>
         <p class="auth-alt"><a href="/login">${t('auth.login_link')}</a></p>`}`,
      }),
    )
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

  // AGPL §13: quien usa el servicio por red puede obtener el código fuente
  app.get('/source', async (_req, reply) => reply.redirect(SOURCE_URL, 302))
}
