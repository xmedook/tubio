import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { randomAlias } from '../../lib/alias.ts'
import { html } from '../../lib/html.ts'
import { checkTarget } from '../../lib/urls.ts'
import { panelLayout } from '../../views/layout.ts'
import { csrfField, textarea } from '../../views/ui.ts'
import { sendHtml, userGuard, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { DAILY_CAP_UNVERIFIED, DAILY_CAP_VERIFIED, limitsOf, usageOf } from '../plans/limits.ts'
import { audit } from '../settings/repo.ts'
import type { User } from '../users/repo.ts'
import { aliasTaken, createLink, linkUrl, type Link, type LinkInput } from './repo.ts'

/** Crear muchos enlaces cortos a la vez: una URL por renglón (hasta 100 por envío). */
export const BULK_MAX = 100

type Row = { line: number; input: string; link?: Link; error?: string }

function page(ctx: Ctx, opts: { value?: string; rows?: Row[]; error?: string; room: number }) {
  const { t } = ctx
  return panelLayout(ctx, {
    title: t('bulk.title'),
    active: 'links',
    path: '/panel/links/bulk',
    body: html`<h1>${t('bulk.title')}</h1><p class="muted">${t('bulk.intro', { max: BULK_MAX, room: opts.room })}</p>
${opts.error ? html`<p class="flash flash-error" role="alert">${t(opts.error)}</p>` : ''}
${opts.rows ? html`<ul class="list">${opts.rows.map((r) => html`<li><div class="grow"><div class="title">${r.link ? linkUrl(ctx.baseUrl, r.link).replace(/^https?:\/\//, '') : html`<span class="error">${t(r.error ?? 'err.invalid')}</span>`}</div><div class="sub">${t('bulk.line', { n: r.line })} · ${r.input}</div></div>
${r.link ? html`<button type="button" class="btn btn-sm" data-copy="${linkUrl(ctx.baseUrl, r.link)}" data-copied="${t('links.copied')}">${t('links.copy')}</button>` : ''}</li>`)}</ul>
${opts.rows.some((r) => r.link) ? html`<p><button type="button" class="btn" data-copy="${opts.rows.filter((r) => r.link).map((r) => linkUrl(ctx.baseUrl, r.link as Link)).join('\n')}" data-copied="${t('links.copied')}">${t('bulk.copy_all')}</button> <a class="btn" href="/panel?kind=short">${t('bulk.see_links')}</a></p>` : ''}` : ''}
<form method="post" action="/panel/links/bulk" class="card">${csrfField(ctx)}
  ${textarea({ ctx, name: 'urls', label: t('bulk.urls'), value: opts.value ?? '', rows: 10, required: true, maxlength: 60_000 })}
  <p class="hint">${t('bulk.hint')}</p>
  <button class="btn btn-primary" type="submit">${t('bulk.create')}</button>
</form>`,
  })
}

export function registerBulk(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const room = (user: User) => {
    const lim = limitsOf(db, user, deps.now())
    const byPlan = lim.links < 0 ? Infinity : Math.max(0, lim.links - usageOf(db, user.id).links)
    const cap = user.role === 'admin' ? Infinity : user.email_verified_at ? DAILY_CAP_VERIFIED : DAILY_CAP_UNVERIFIED
    const today = db.prepare('SELECT COUNT(*) FROM links WHERE user_id = ? AND created_at > ?').pluck().get(user.id, deps.now() - 86400_000) as number
    return Math.min(BULK_MAX, byPlan, Math.max(0, cap - today))
  }

  app.get('/panel/links/bulk', { preHandler: userGuard }, async (req, reply) => sendHtml(reply, page(req.ctx, { room: room(req.ctx.user as User) })))

  app.post('/panel/links/bulk', { preHandler: userGuard, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const user = req.ctx.user as User
    const value = field(req.body, 'urls').slice(0, 60_000)
    const lines = value.split(/\r?\n/).map((s, i) => ({ line: i + 1, input: s.trim() })).filter((l) => l.input)
    if (!lines.length) return sendHtml(reply, page(req.ctx, { value, error: 'bulk.empty', room: room(user) }), 422)
    let left = room(user)
    if (left <= 0) return sendHtml(reply, page(req.ctx, { value, error: 'err.plan_links', room: 0 }), 402)
    const rows: Row[] = []
    const now = deps.now()
    db.transaction(() => {
      for (const l of lines.slice(0, BULK_MAX)) {
        if (left <= 0) {
          rows.push({ ...l, error: 'bulk.no_room' })
          continue
        }
        const r = checkTarget(db, l.input)
        if (!r.ok) {
          rows.push({ ...l, error: r.error })
          continue
        }
        let alias = randomAlias()
        while (aliasTaken(db, alias)) alias = randomAlias()
        const input: LinkInput = { kind: 'short', alias, title: '', target_url: r.url, redirect_code: 302, data: {}, is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false, project_id: null }
        const link = createLink(db, user.id, input, now)
        rows.push({ ...l, link })
        left--
      }
    })()
    if (lines.length > BULK_MAX) rows.push({ line: lines[BULK_MAX]!.line, input: '…', error: 'bulk.too_many' })
    audit(db, { actorId: req.ctx.member?.id ?? user.id, userId: user.id, action: 'link.bulk_create', meta: { n: rows.filter((r) => r.link).length } }, now)
    return sendHtml(reply, page(req.ctx, { rows, room: room(user) }))
  })
}
