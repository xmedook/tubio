import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { formatDateTime } from '../../lib/i18n.ts'
import { panelLayout } from '../../views/layout.ts'
import { emptyState } from '../../views/ui.ts'
import { sendHtml, userGuard } from '../../web/context.ts'
import type { User } from '../users/repo.ts'
import { listNotifications, markAllRead } from './repo.ts'

export function registerInbox(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  app.get('/panel/inbox', { preHandler: userGuard }, async (req, reply) => {
    const ctx = req.ctx
    const { t, locale } = ctx
    const me = (ctx.member ?? ctx.user) as User
    const owner = ctx.user as User
    const list = listNotifications(db, owner.id)
    const page = panelLayout(ctx, {
      title: t('inbox.title'),
      active: 'account',
      path: '/panel/inbox',
      body: html`<h1>${t('inbox.title')}</h1>
${list.length === 0
  ? emptyState(t('inbox.none'), html`<p class="muted">${t('inbox.none_body')}</p>`)
  : html`<ul class="list notif-list">${list.map((n) => html`<li class="${n.read_at ? '' : 'unread'}">
  <a class="row-a" href="${n.url || '/panel'}"><span class="row-b"><span class="row-1"><b class="title">${n.title}</b><time>${formatDateTime(locale, n.created_at, me.timezone)}</time></span>${n.body ? html`<span class="row-2"><span class="u">${n.body}</span></span>` : ''}</span></a>
</li>`)}</ul>`}`,
    })
    // al verlas quedan leídas (la página ya salió con su marca de «nueva»)
    markAllRead(db, owner.id, deps.now())
    return sendHtml(reply, page)
  })
}
