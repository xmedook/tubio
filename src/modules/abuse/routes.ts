import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { translator, type Locale } from '../../lib/i18n.ts'
import { authLayout } from '../../views/layout.ts'
import { csrfField, input, powAttr, powField, select, textarea, type Errors } from '../../views/ui.ts'
import { powOk, sendHtml, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { findByAlias } from '../links/repo.ts'
import { audit } from '../settings/repo.ts'

export const ABUSE_REASONS = ['phishing', 'malware', 'spam', 'illegal', 'impersonation', 'adult', 'other'] as const

function reportPage(ctx: Ctx, alias: string, errors: Errors = {}, sent = false) {
  const { t } = ctx
  const pow = ctx.pow()
  return authLayout(ctx, {
    title: t('abuse.title'),
    path: `/_/report/${alias}`,
    body: sent
      ? html`<h1>${t('abuse.title')}</h1><p role="status">${t('abuse.thanks')}</p>`
      : html`<h1>${t('abuse.title')}</h1>
<p>${t('abuse.intro', { alias })}</p>
<form method="post" action="/_/report/${alias}" novalidate${powAttr(pow)}>
  ${csrfField(ctx)}
  ${select({ ctx, name: 'reason', label: t('abuse.reason'), options: ABUSE_REASONS.map((r) => ({ value: r, label: t(`abuse.r_${r}`) })) })}
  ${textarea({ ctx, name: 'details', label: t('abuse.details'), error: errors.details, maxlength: 2000, rows: 4 })}
  ${input({ ctx, name: 'email', type: 'email', label: t('abuse.email'), error: errors.email, autocomplete: 'email', hint: t('abuse.email_hint') })}
  ${errors._form ? html`<p class="error" role="alert">${t(errors._form)}</p>` : ''}
  ${powField(ctx, pow)}
  <button class="btn btn-primary btn-block" type="submit">${t('abuse.submit')}</button>
</form>`,
  })
}

export function registerAbuse(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  app.get('/_/report/:alias', async (req, reply) => {
    const link = findByAlias(db, (req.params as { alias: string }).alias)
    if (!link) return reply.callNotFound()
    reply.header('X-Robots-Tag', 'noindex')
    return sendHtml(reply, reportPage(req.ctx, link.alias))
  })

  app.post('/_/report/:alias', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const link = findByAlias(db, (req.params as { alias: string }).alias)
    if (!link) return reply.callNotFound()
    if (!powOk(deps, req.body)) return sendHtml(reply, reportPage(req.ctx, link.alias, { _form: 'err.pow' }), 422)
    const reason = field(req.body, 'reason')
    const details = field(req.body, 'details').trim()
    const email = field(req.body, 'email').trim().toLowerCase()
    const errors: Errors = {}
    if (details.length > 2000) errors.details = 'err.too_long'
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'err.email'
    if (Object.keys(errors).length) return sendHtml(reply, reportPage(req.ctx, link.alias, errors), 422)
    const now = deps.now()
    db.prepare('INSERT INTO abuse_reports (link_id, alias, reason, details, reporter_email, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      link.id,
      link.alias,
      (ABUSE_REASONS as readonly string[]).includes(reason) ? reason : 'other',
      details,
      email.slice(0, 254),
      now,
    )
    audit(db, { userId: link.user_id, action: 'abuse.report', target: `link:${link.id}`, meta: { reason } }, now)
    // aviso a los admins: como máximo uno por hora
    const lastNotice = db.prepare("SELECT MAX(ts) FROM audit_log WHERE action = 'abuse.notify'").pluck().get() as number | null
    if (!lastNotice || now - lastNotice > 3600_000) {
      const open = db.prepare("SELECT COUNT(*) FROM abuse_reports WHERE status = 'open'").pluck().get() as number
      const admins = db.prepare("SELECT email, locale FROM users WHERE role = 'admin' AND status = 'active'").all() as { email: string; locale: string }[]
      for (const a of admins) {
        const t = translator(a.locale as Locale)
        await deps.mailer.send({ to: a.email, subject: t('mail.abuse_subject', { n: open }), text: t('mail.abuse_body', { n: open, link: `${deps.config.baseUrl}/admin/reports` }) })
      }
      audit(db, { action: 'abuse.notify', meta: { open } }, now)
    }
    return sendHtml(reply, reportPage(req.ctx, link.alias, {}, true))
  })
}
