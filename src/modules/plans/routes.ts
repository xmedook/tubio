import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html, type SafeHtml } from '../../lib/html.ts'
import { formatDateTime, formatNumber } from '../../lib/i18n.ts'
import { panelLayout } from '../../views/layout.ts'
import { sendHtml, userGuard, type Ctx } from '../../web/context.ts'
import type { User } from '../users/repo.ts'
import { listPlans, planOf, usageOf, type Limits, type Plan } from './limits.ts'

export function money(locale: string, cents: number | null, currency = 'MXN'): string {
  if (cents === null) return ''
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
}

function lim(ctx: Ctx, n: number): string {
  return n < 0 ? ctx.t('plan.unlimited') : formatNumber(ctx.locale, n)
}

function bar(ctx: Ctx, label: string, used: number, max: number, unit = ''): SafeHtml {
  const pct = max < 0 ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100))
  return html`<div class="usage"><div class="usage-h"><span>${label}</span><span>${formatNumber(ctx.locale, used)}${unit} / ${lim(ctx, max)}${max >= 0 ? unit : ''}</span></div>
<progress value="${max < 0 ? 0 : pct}" max="100" class="${pct >= 90 ? 'hi' : ''}" aria-label="${label}"></progress></div>`
}

const yes = (ctx: Ctx, v: boolean) => (v ? html`<span class="ok">✓</span>` : html`<span class="muted">—</span>`)

export function plansTable(ctx: Ctx, plans: Plan[], current?: string): SafeHtml {
  const { t } = ctx
  const rows: [string, (l: Limits) => SafeHtml | string][] = [
    [t('plan.r_bio'), (l) => lim(ctx, l.bio_pages)],
    [t('plan.r_links'), (l) => lim(ctx, l.links)],
    [t('plan.r_blocks'), (l) => lim(ctx, l.blocks_per_page)],
    [t('plan.r_qr'), (l) => lim(ctx, l.qr)],
    [t('plan.r_stats'), (l) => t('plan.days', { n: l.stats_days })],
    [t('plan.r_storage'), (l) => (l.storage_mb >= 1024 ? `${l.storage_mb / 1024} GB` : `${l.storage_mb} MB`)],
    [t('plan.r_branding'), (l) => yes(ctx, l.remove_branding)],
    [t('plan.r_marketing'), (l) => yes(ctx, l.marketing)],
    [t('plan.r_domains'), (l) => (l.custom_domains ? String(l.custom_domains) : html`<span class="muted">—</span>`)],
    [t('plan.r_notify'), (l) => (l.capture_targets.length > 1 ? t('plan.all') : t('notify.kind_email'))],
    [t('plan.r_code'), (l) => yes(ctx, l.custom_code)],
    [t('plan.r_team'), (l) => (l.team_members ? t('plan.people', { n: l.team_members }) : html`<span class="muted">—</span>`)],
    [t('plan.r_api'), (l) => yes(ctx, l.api)],
  ]
  return html`<div class="table-scroll"><table class="data plans"><thead><tr><th></th>${plans.map((p) => html`<th scope="col"${p.slug === current ? html` class="current"` : ''}>${p.name}<span class="price">${p.price_month === null ? t('plan.free') : html`${money(ctx.locale, p.price_month, p.currency)}<small>/${t('plan.month')}</small>`}</span>${p.price_year ? html`<small class="muted">${t('plan.or_year', { price: money(ctx.locale, p.price_year, p.currency) })}</small>` : ''}</th>`)}</tr></thead>
<tbody>${rows.map(([label, f]) => html`<tr><th scope="row">${label}</th>${plans.map((p) => html`<td${p.slug === current ? html` class="current"` : ''}>${f(p.limits)}</td>`)}</tr>`)}
${current !== undefined ? html`<tr><th></th>${plans.map((p) => html`<td${p.slug === current ? html` class="current"` : ''}>${p.slug === current ? html`<span class="tag">${t('plan.yours')}</span>` : p.price_month === null ? '' : html`<a class="btn btn-primary btn-sm" href="/panel/checkout?plan=${p.slug}&period=month">${p.trial_days ? t('plan.choose_trial') : t('plan.choose')}</a>`}</td>`)}</tr>` : ''}</tbody></table></div>`
}

export function registerPlans(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  app.get('/panel/plan', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    const ctx = req.ctx
    const { t } = ctx
    const plan = planOf(db, user, deps.now())
    const u = usageOf(db, user.id)
    const l = plan.limits
    return sendHtml(reply, panelLayout(ctx, {
      title: t('plan.title'),
      active: 'account',
      path: '/panel/plan',
      body: html`<h1>${t('plan.title')}</h1>
<div class="card"><h2>${t('plan.current', { name: plan.name })}${user.founder_no ? html` <span class="tag">${t('founders.badge', { n: user.founder_no })}</span>` : ''}</h2>
  ${user.plan_expires_at && plan.slug !== 'free' ? html`<p class="muted">${t('plan.expires', { when: formatDateTime(ctx.locale, user.plan_expires_at, user.timezone) })}</p>` : ''}
  ${bar(ctx, t('plan.r_bio'), u.bio_pages, l.bio_pages)}
  ${bar(ctx, t('plan.r_links'), u.links, l.links)}
  ${bar(ctx, t('plan.r_qr'), u.qr, l.qr)}
  ${bar(ctx, t('plan.r_storage'), u.storage_mb, l.storage_mb, ' MB')}
</div>
<h2>${t('plan.compare')}</h2>
${plansTable(ctx, listPlans(db, true), plan.slug)}
<p><a href="/panel/payments">${t('pay.history')}</a></p>`,
    }))
  })
}
