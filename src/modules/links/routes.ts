import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { panelLayout } from '../../views/layout.ts'
import { sendHtml, userGuard } from '../../web/context.ts'

export function registerLinks(app: FastifyInstance, _deps: AppDeps): void {
  app.get('/panel', { preHandler: userGuard }, async (req, reply) => {
    const { t } = req.ctx
    return sendHtml(reply, panelLayout(req.ctx, { title: t('nav.links'), active: 'links', path: req.url, body: html`<h1>${t('nav.links')}</h1>` }))
  })
}
