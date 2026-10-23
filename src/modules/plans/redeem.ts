import { randomInt } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { formatDateTime } from '../../lib/i18n.ts'
import { panelLayout } from '../../views/layout.ts'
import { csrfField, emptyState, input, postButton, select } from '../../views/ui.ts'
import { adminGuard, setFlash, sendHtml, userGuard } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { actorOf } from '../auth/routes.ts'
import { notifyUser } from '../inbox/repo.ts'
import { audit } from '../settings/repo.ts'
import { findUserById, updateUser, type User } from '../users/repo.ts'
import { getPlan, listPlans, planOf } from './limits.ts'

type Code = { code: string; plan_id: number; days: number; max_uses: number | null; used: number; expires_at: number | null; note: string; created_at: number }
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const genCode = (prefix: string) => `${prefix}${Array.from({ length: 8 }, () => ALPHA[randomInt(ALPHA.length)]).join('')}`

/** Canjea un código; devuelve la clave del error o null */
export function redeem(deps: AppDeps, userId: number, raw: string): string | null {
  const { db } = deps
  const now = deps.now()
  const code = raw.trim().toUpperCase().replace(/\s+/g, '')
  const c = db.prepare('SELECT * FROM redeem_codes WHERE code = ?').get(code) as Code | undefined
  if (!c) return 'redeem.invalid'
  if (c.expires_at && c.expires_at < now) return 'redeem.expired'
  if (c.max_uses !== null && c.used >= c.max_uses) return 'redeem.used_up'
  if (db.prepare('SELECT 1 FROM redemptions WHERE code = ? AND user_id = ?').get(code, userId)) return 'redeem.already'
  const u = findUserById(db, userId)
  const plan = getPlan(db, c.plan_id)
  if (!u || !plan) return 'redeem.invalid'
  if (!u.email_verified_at && u.role !== 'admin') return 'err.verify_first'
  const cur = planOf(db, u, now)
  // no se baja de plan con un código: el tiempo pagado de uno mayor no se recorta
  if (cur.slug !== 'free' && cur.slug !== 'admin' && cur.id !== plan.id && cur.sort > plan.sort) return 'redeem.lower_plan'
  const base = cur.id === plan.id && u.plan_expires_at && u.plan_expires_at > now ? u.plan_expires_at : now
  if (cur.id === plan.id && u.plan_id === plan.id && !u.plan_expires_at) return 'redeem.lifetime'
  db.transaction(() => {
    db.prepare('INSERT INTO redemptions (code, user_id, created_at) VALUES (?, ?, ?)').run(code, userId, now)
    db.prepare('UPDATE redeem_codes SET used = used + 1 WHERE code = ?').run(code)
    updateUser(db, userId, { plan_id: plan.id, plan_expires_at: base + c.days * 86400_000 }, now)
  })()
  audit(db, { actorId: userId, userId, action: 'plan.redeem', target: code, meta: { plan: plan.slug, days: c.days } }, now)
  notifyUser(db, userId, { kind: 'plan', title: `Canjeaste ${c.days} días del plan ${plan.name}`, url: '/panel/plan' }, now)
  return null
}

export function registerRedeem(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  app.post('/panel/plan/redeem', { preHandler: userGuard, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = req.ctx.user as User
    const err = redeem(deps, u.id, field(req.body, 'code'))
    setFlash(reply, deps, err ? { type: 'error', key: err } : { type: 'ok', key: 'redeem.ok' })
    return reply.redirect('/panel/plan', 303)
  })

  app.get('/admin/redeem', { preHandler: adminGuard }, async (req, reply) => {
    const ctx = req.ctx
    const { t, locale } = ctx
    const plans = listPlans(db).filter((p) => p.slug !== 'free')
    const codes = db.prepare('SELECT * FROM redeem_codes ORDER BY created_at DESC LIMIT 300').all() as Code[]
    const name = (id: number) => plans.find((p) => p.id === id)?.name ?? `#${id}`
    return sendHtml(reply, panelLayout(ctx, {
      title: t('redeem.admin'),
      active: 'admin',
      path: '/admin/redeem',
      body: html`<h1>${t('redeem.admin')}</h1><p class="muted">${t('redeem.admin_intro')}</p>
<form class="card" method="post" action="/admin/redeem" novalidate>${csrfField(ctx)}
  <div class="grid-3">
    ${select({ ctx, name: 'plan', label: t('redeem.plan'), value: 'business', options: plans.map((p) => ({ value: p.slug, label: p.name })) })}
    ${input({ ctx, name: 'days', type: 'number', label: t('redeem.days'), value: '30', min: 1, max: 3650, required: true })}
    ${input({ ctx, name: 'max_uses', type: 'number', label: t('pay.max_uses'), min: 1, hint: t('redeem.max_hint') })}
  </div>
  <div class="grid-3">
    ${input({ ctx, name: 'code', label: t('redeem.code'), maxlength: 40, hint: t('redeem.code_hint') })}
    ${input({ ctx, name: 'count', type: 'number', label: t('redeem.count'), value: '1', min: 1, max: 500 })}
    ${input({ ctx, name: 'expires', type: 'date', label: t('plan.expires_label') })}
  </div>
  ${input({ ctx, name: 'note', label: t('redeem.note'), maxlength: 120 })}
  <button class="btn btn-primary" type="submit">${t('redeem.create')}</button>
</form>
${codes.length ? html`<ul class="list">${codes.map((c) => html`<li><div class="grow"><div class="title mono">${c.code}</div><div class="sub">${name(c.plan_id)} · ${t('redeem.n_days', { n: c.days })} · ${c.used}/${c.max_uses ?? '∞'}${c.expires_at ? ` · ${formatDateTime(locale, c.expires_at, (ctx.user as User).timezone)}` : ''}${c.note ? ` · ${c.note}` : ''}</div></div>
${postButton(ctx, '/admin/redeem/delete', t('common.delete'), { cls: 'btn btn-sm btn-danger', hidden: { code: c.code }, confirm: t('redeem.delete_confirm') })}</li>`)}</ul>` : emptyState(t('redeem.none'), '')}`,
    }))
  })

  app.post('/admin/redeem', { preHandler: adminGuard }, async (req, reply) => {
    const b = req.body
    const plan = listPlans(db).find((p) => p.slug === field(b, 'plan') && p.slug !== 'free')
    const days = Number(field(b, 'days'))
    const maxUses = Number(field(b, 'max_uses')) || null
    const count = Math.min(500, Math.max(1, Number(field(b, 'count')) || 1))
    const custom = field(b, 'code').trim().toUpperCase()
    const exp = field(b, 'expires')
    if (!plan || !Number.isInteger(days) || days < 1 || days > 3650 || (custom && !/^[A-Z0-9_-]{3,40}$/.test(custom))) {
      setFlash(reply, deps, { type: 'error', key: 'err.form' })
      return reply.redirect('/admin/redeem', 303)
    }
    const now = deps.now()
    const ins = db.prepare('INSERT OR IGNORE INTO redeem_codes (code, plan_id, days, max_uses, expires_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const expires = /^\d{4}-\d{2}-\d{2}$/.test(exp) ? Date.parse(exp + 'T23:59:59Z') : null
    // un código propio (p. ej. FERIA2026 con N usos) o N códigos de un solo uso
    if (custom) ins.run(custom, plan.id, days, maxUses, expires, field(b, 'note').slice(0, 120), now)
    else for (let i = 0; i < count; i++) ins.run(genCode(plan.slug.slice(0, 1).toUpperCase()), plan.id, days, maxUses ?? 1, expires, field(b, 'note').slice(0, 120), now)
    audit(db, { actorId: actorOf(req), action: 'admin.redeem_create', meta: { plan: plan.slug, days, count: custom ? 1 : count } }, now)
    return reply.redirect('/admin/redeem', 303)
  })

  app.post('/admin/redeem/delete', { preHandler: adminGuard }, async (req, reply) => {
    db.prepare('DELETE FROM redeem_codes WHERE code = ?').run(field(req.body, 'code'))
    return reply.redirect('/admin/redeem', 303)
  })
}
