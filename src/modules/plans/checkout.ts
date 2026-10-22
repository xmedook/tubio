import { createReadStream, existsSync } from 'node:fs'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { formatDateTime, translator, type Locale } from '../../lib/i18n.ts'
import { findFile, readMultipart, storeFile, uploadPath, UploadError, type MultipartData } from '../../lib/uploads.ts'
import { panelLayout } from '../../views/layout.ts'
import { csrfField, emptyState, input, postButton, select } from '../../views/ui.ts'
import { adminGuard, sendHtml, setFlash, userGuard, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { actorOf } from '../auth/routes.ts'
import { audit } from '../settings/repo.ts'
import { findUserById, updateUser, type User } from '../users/repo.ts'
import { activatePayment, checkCoupon, newReference, PERIODS, priceOf, quote, type Coupon, type Payment, type Period } from './billing.ts'
import { getPlan, getPlanBySlug, listPlans, planOf, type Plan } from './limits.ts'
import { receiptPdf } from './receipt.ts'
import { creditReferral } from '../growth/routes.ts'
import { money } from './routes.ts'

const env = process.env
export const bank = () =>
  env.TUBIO_BANK_CLABE
    ? { name: env.TUBIO_BANK_NAME ?? '', holder: env.TUBIO_BANK_HOLDER ?? env.TUBIO_LEGAL_OWNER ?? '', clabe: env.TUBIO_BANK_CLABE, account: env.TUBIO_BANK_ACCOUNT ?? '' }
    : null

const PROOF_TYPES = /^(image\/(png|jpeg|webp|heic|heif)|application\/pdf)$/

export function registerCheckout(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const me = (req: FastifyRequest) => req.ctx.user as User

  const payPlan = (req: FastifyRequest): { plan: Plan; period: Period } | null => {
    const q = req.query as { plan?: string; period?: string }
    const plan = q.plan ? getPlanBySlug(db, q.plan) : undefined
    const period = PERIODS.includes(q.period as Period) ? (q.period as Period) : 'month'
    if (!plan || !plan.is_public || priceOf(plan, period) === null) return null
    return { plan, period }
  }

  function checkoutPage(ctx: Ctx, user: User, plan: Plan, period: Period, coupon: Coupon | null, couponError?: string) {
    const { t, locale } = ctx
    const q = quote(plan, period, coupon)!
    const current = planOf(db, user, deps.now())
    const canTrial = plan.trial_days > 0 && !user.trial_used_at && current.slug === 'free'
    const b = bank()
    const periods = PERIODS.filter((p) => priceOf(plan, p) !== null)
    return panelLayout(ctx, {
      title: t('pay.checkout'),
      active: 'account',
      path: '/panel/checkout',
      body: html`<h1>${t('pay.checkout_plan', { plan: plan.name })}</h1>
<div class="card">
  <form method="get" action="/panel/checkout" class="toolbar">
    <input type="hidden" name="plan" value="${plan.slug}">
    ${select({ ctx, name: 'period', label: t('pay.period'), value: period, options: periods.map((p) => ({ value: p, label: `${t(`pay.period_${p}`)} · ${money(locale, priceOf(plan, p), plan.currency)}` })) })}
    ${input({ ctx, name: 'coupon', label: t('pay.coupon'), value: coupon?.code ?? '', error: couponError, maxlength: 40 })}
    <button class="btn" type="submit">${t('pay.update')}</button>
  </form>
  <table class="data"><tbody>
    <tr><th>${t('receipt.price')}</th><td class="num">${money(locale, q.gross, plan.currency)}</td></tr>
    ${q.discount ? html`<tr><th>${t('receipt.discount')} (${coupon?.code})</th><td class="num">−${money(locale, q.discount, plan.currency)}</td></tr>` : ''}
    <tr><th>${t('pay.total_iva')}</th><td class="num"><strong>${money(locale, q.total, plan.currency)}</strong></td></tr>
  </tbody></table>
</div>
${canTrial
  ? html`<div class="card"><h2>${t('pay.trial_title', { n: plan.trial_days })}</h2><p>${t('pay.trial_body')}</p>${postButton(ctx, `/panel/trial?plan=${plan.slug}`, t('pay.trial_start', { n: plan.trial_days }), { cls: 'btn btn-primary' })}</div>`
  : ''}
<div class="card"><h2>${t('pay.method_transfer')}</h2>
${b
  ? html`<p>${t('pay.transfer_intro')}</p>
  <form method="post" action="/panel/checkout?plan=${plan.slug}&period=${period}" novalidate>${csrfField(ctx)}
    <input type="hidden" name="coupon" value="${coupon?.code ?? ''}">
    ${input({ ctx, name: 'billing_name', label: t('pay.billing_name'), value: user.name, maxlength: 120, hint: t('pay.billing_name_hint') })}
    <button class="btn btn-primary" type="submit">${t('pay.transfer_start')}</button></form>`
  : html`<p class="muted">${t('pay.transfer_soon')}</p>`}
</div>
<div class="card"><h2>${t('pay.card')}</h2><p class="muted">${t('pay.card_soon')}</p></div>`,
    })
  }

  app.get('/panel/checkout', { preHandler: userGuard }, async (req, reply) => {
    const pp = payPlan(req)
    if (!pp) return reply.redirect('/panel/plan', 303)
    const code = String((req.query as { coupon?: string }).coupon ?? '').trim()
    let coupon: Coupon | null = null
    let err: string | undefined
    if (code) {
      const c = checkCoupon(db, code, pp.plan, deps.now())
      if ('error' in c) err = c.error
      else coupon = c.coupon
    }
    return sendHtml(reply, checkoutPage(req.ctx, me(req), pp.plan, pp.period, coupon, err))
  })

  app.post('/panel/checkout', { preHandler: userGuard, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    if (req.ctx.session?.impersonator_id) return reply.code(403).send('impersonating')
    const pp = payPlan(req)
    if (!pp || !bank()) return reply.redirect('/panel/plan', 303)
    const user = me(req)
    const code = field(req.body, 'coupon').trim()
    let coupon: Coupon | null = null
    if (code) {
      const c = checkCoupon(db, code, pp.plan, deps.now())
      if ('error' in c) return sendHtml(reply, checkoutPage(req.ctx, user, pp.plan, pp.period, null, c.error), 422)
      coupon = c.coupon
    }
    // un solo pago pendiente por usuario: se reemplaza
    db.prepare("UPDATE payments SET status = 'cancelled' WHERE user_id = ? AND status = 'pending' AND proof_file_id IS NULL").run(user.id)
    const q = quote(pp.plan, pp.period, coupon)!
    let ref = newReference()
    while (db.prepare('SELECT 1 FROM payments WHERE reference = ?').get(ref)) ref = newReference()
    const id = Number(
      db
        .prepare('INSERT INTO payments (user_id, plan_id, period, amount, discount, currency, method, reference, coupon_code, billing_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(user.id, pp.plan.id, pp.period, q.gross, q.discount, pp.plan.currency, 'transfer', ref, coupon?.code ?? null, field(req.body, 'billing_name').trim().slice(0, 120), deps.now()).lastInsertRowid,
    )
    audit(db, { actorId: user.id, userId: user.id, action: 'pay.created', target: `payment:${id}`, meta: { plan: pp.plan.slug, period: pp.period } }, deps.now())
    return reply.redirect(`/panel/payments/${id}`, 303)
  })

  app.post('/panel/trial', { preHandler: userGuard }, async (req, reply) => {
    const user = me(req)
    const plan = getPlanBySlug(db, String((req.query as { plan?: string }).plan ?? ''))
    if (!plan || !plan.trial_days || user.trial_used_at || planOf(db, user, deps.now()).slug !== 'free') return reply.redirect('/panel/plan', 303)
    const now = deps.now()
    updateUser(db, user.id, { plan_id: plan.id, plan_expires_at: now + plan.trial_days * 86400_000, trial_used_at: now }, now)
    audit(db, { actorId: user.id, userId: user.id, action: 'pay.trial', meta: { plan: plan.slug } }, now)
    setFlash(reply, deps, { type: 'ok', key: 'pay.trial_started', vars: { plan: plan.name, n: plan.trial_days } })
    return reply.redirect('/panel/plan', 303)
  })

  const ownPayment = (req: FastifyRequest): Payment | undefined =>
    db.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(Number((req.params as { id: string }).id), me(req).id) as Payment | undefined

  function paymentPage(ctx: Ctx, user: User, p: Payment, error?: string) {
    const { t, locale } = ctx
    const plan = getPlan(db, p.plan_id)!
    const b = bank()
    const total = p.amount - p.discount
    return panelLayout(ctx, {
      title: p.reference,
      active: 'account',
      path: `/panel/payments/${p.id}`,
      body: html`<h1>${t('pay.payment', { ref: p.reference })}</h1>
<p><span class="tag">${t(`pay.status_${p.status}`)}</span> ${plan.name} · ${t(`pay.period_${p.period}`)} · <strong>${money(locale, total, p.currency)}</strong></p>
${p.status === 'pending' && b
  ? html`<div class="card"><h2>${t('pay.transfer_data')}</h2>
  <table class="data"><tbody>
    <tr><th>${t('pay.bank')}</th><td>${b.name}</td></tr>
    <tr><th>${t('pay.holder')}</th><td>${b.holder}</td></tr>
    <tr><th>CLABE</th><td class="mono">${b.clabe} <button type="button" class="btn-link" data-copy="${b.clabe}" data-copied="${t('links.copied')}">${t('links.copy')}</button></td></tr>
    ${b.account ? html`<tr><th>${t('pay.account')}</th><td class="mono">${b.account}</td></tr>` : ''}
    <tr><th>${t('pay.amount')}</th><td><strong>${money(locale, total, p.currency)}</strong></td></tr>
    <tr><th>${t('pay.reference')}</th><td class="mono"><strong>${p.reference}</strong> <button type="button" class="btn-link" data-copy="${p.reference}" data-copied="${t('links.copied')}">${t('links.copy')}</button></td></tr>
  </tbody></table>
  <p class="hint">${t('pay.reference_hint')}</p>
  ${p.proof_file_id
    ? html`<p class="flash flash-info">${t('pay.proof_received')}</p>`
    : html`<form method="post" action="/panel/payments/${p.id}/proof?_csrf=${encodeURIComponent(ctx.csrf)}" enctype="multipart/form-data" novalidate>
      ${input({ ctx, name: 'proof', type: 'file', label: t('pay.proof'), error, required: true, accept: 'image/png,image/jpeg,image/webp,application/pdf', hint: t('pay.proof_hint') })}
      <button class="btn btn-primary" type="submit">${t('pay.proof_send')}</button></form>`}
  ${postButton(ctx, `/panel/payments/${p.id}/cancel`, t('pay.cancel'), { cls: 'btn btn-sm', confirm: t('pay.cancel_confirm') })}
</div>`
  : ''}
${p.status === 'paid' ? html`<p><a class="btn btn-primary" href="/panel/payments/${p.id}/receipt.pdf">${t('pay.receipt')}</a></p>` : ''}
${p.status === 'rejected' && p.notes ? html`<p class="flash flash-error">${p.notes}</p>` : ''}
<p><a href="/panel/payments">${t('pay.history')}</a></p>`,
    })
  }

  app.get('/panel/payments', { preHandler: userGuard }, async (req, reply) => {
    const ctx = req.ctx
    const { t, locale } = ctx
    const user = me(req)
    const rows = db.prepare('SELECT p.*, pl.name AS plan_name FROM payments p JOIN plans pl ON pl.id = p.plan_id WHERE p.user_id = ? ORDER BY p.created_at DESC').all(user.id) as (Payment & { plan_name: string })[]
    return sendHtml(reply, panelLayout(ctx, {
      title: t('pay.history'),
      active: 'account',
      path: '/panel/payments',
      body: html`<h1>${t('pay.history')}</h1>${rows.length === 0 ? emptyState(t('pay.none'), html`<a class="btn" href="/panel/plan">${t('plan.see_plans')}</a>`) : html`<ul class="list">${rows.map((p) => html`<li><div class="grow"><div class="title"><a href="/panel/payments/${p.id}">${p.reference}</a> <span class="tag">${t(`pay.status_${p.status}`)}</span></div>
<div class="sub">${p.plan_name} · ${t(`pay.period_${p.period}`)} · ${money(locale, p.amount - p.discount, p.currency)} · ${formatDateTime(locale, p.created_at, user.timezone)}</div></div>
${p.status === 'paid' ? html`<a class="btn btn-sm" href="/panel/payments/${p.id}/receipt.pdf">${t('pay.receipt')}</a>` : ''}</li>`)}</ul>`}`,
    }))
  })

  app.get('/panel/payments/:id', { preHandler: userGuard }, async (req, reply) => {
    const p = ownPayment(req)
    if (!p) return reply.callNotFound()
    return sendHtml(reply, paymentPage(req.ctx, me(req), p))
  })

  app.post('/panel/payments/:id/proof', { preHandler: userGuard, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const p = ownPayment(req)
    if (!p || p.status !== 'pending') return reply.callNotFound()
    const user = me(req)
    let mp: MultipartData
    try {
      mp = await readMultipart(req)
    } catch (e) {
      return sendHtml(reply, paymentPage(req.ctx, user, p, e instanceof UploadError ? e.key : 'err.invalid'), 413)
    }
    const up = mp.files.find((f) => f.field === 'proof')
    if (!up) return sendHtml(reply, paymentPage(req.ctx, user, p, 'err.file_required'), 422)
    let stored
    try {
      stored = await storeFile(deps, user.id, up.buffer, up.filename)
    } catch (e) {
      return sendHtml(reply, paymentPage(req.ctx, user, p, e instanceof UploadError ? e.key : 'err.invalid'), 422)
    }
    if (!PROOF_TYPES.test(stored.mime)) return sendHtml(reply, paymentPage(req.ctx, user, p, 'err.proof_type'), 422)
    db.prepare('UPDATE payments SET proof_file_id = ? WHERE id = ?').run(stored.id, p.id)
    for (const a of db.prepare("SELECT email, locale FROM users WHERE role = 'admin' AND status = 'active'").all() as { email: string; locale: string }[]) {
      const t = translator(a.locale as Locale)
      await deps.mailer.send({ to: a.email, subject: t('mail.pay_proof_subject', { ref: p.reference }), text: t('mail.pay_proof_body', { ref: p.reference, email: user.email, link: `${deps.config.baseUrl}/admin/payments` }), button: t('admin.payments') })
    }
    setFlash(reply, deps, { type: 'ok', key: 'pay.proof_received' })
    return reply.redirect(`/panel/payments/${p.id}`, 303)
  })

  app.post('/panel/payments/:id/cancel', { preHandler: userGuard }, async (req, reply) => {
    const p = ownPayment(req)
    if (!p || p.status !== 'pending') return reply.callNotFound()
    db.prepare("UPDATE payments SET status = 'cancelled' WHERE id = ?").run(p.id)
    return reply.redirect('/panel/payments', 303)
  })

  async function receiptOf(p: Payment, reply: FastifyReply) {
    const plan = getPlan(db, p.plan_id)!
    const owner = findUserById(db, p.user_id)!
    const t = translator((owner.locale as Locale) ?? 'es-MX')
    const pdf = await receiptPdf(p, plan, {
      issuer: env.TUBIO_LEGAL_OWNER ?? 'tubio',
      issuerAddress: env.TUBIO_LEGAL_ADDRESS ?? '',
      issuerRfc: env.TUBIO_LEGAL_RFC ?? '',
      contact: env.TUBIO_CONTACT_EMAIL ?? '',
      locale: owner.locale,
      customer: owner.name || owner.email,
      email: owner.email,
      t,
    })
    reply.header('Content-Disposition', `attachment; filename="recibo-${p.reference}.pdf"`)
    return reply.type('application/pdf').send(pdf)
  }

  app.get('/panel/payments/:id/receipt.pdf', { preHandler: userGuard }, async (req, reply) => {
    const p = ownPayment(req)
    if (!p || p.status !== 'paid') return reply.callNotFound()
    return receiptOf(p, reply)
  })

  // ---------- admin ----------
  app.get('/admin/payments', { preHandler: adminGuard }, async (req, reply) => {
    const ctx = req.ctx
    const { t, locale } = ctx
    const admin = me(req)
    const status = (req.query as { status?: string }).status === 'all' ? 'all' : 'pending'
    const rows = db
      .prepare(`SELECT p.*, pl.name AS plan_name, u.email FROM payments p JOIN plans pl ON pl.id = p.plan_id JOIN users u ON u.id = p.user_id ${status === 'pending' ? "WHERE p.status = 'pending'" : ''} ORDER BY p.created_at DESC LIMIT 200`)
      .all() as (Payment & { plan_name: string; email: string })[]
    const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all() as Coupon[]
    return sendHtml(reply, panelLayout(ctx, {
      title: t('admin.payments'),
      active: 'admin',
      path: '/admin/payments',
      wide: true,
      body: html`<h1>${t('admin.payments')}</h1>
<nav class="btn-row"><a class="btn btn-sm" href="/admin/payments"${status === 'pending' ? html` aria-current="page"` : ''}>${t('pay.status_pending')}</a><a class="btn btn-sm" href="/admin/payments?status=all"${status === 'all' ? html` aria-current="page"` : ''}>${t('admin.all')}</a></nav>
${rows.length === 0 ? emptyState(t('pay.none'), '') : html`<ul class="list">${rows.map((p) => html`<li><div class="grow">
  <div class="title">${p.reference} <span class="tag">${t(`pay.status_${p.status}`)}</span> · <a href="/admin/users/${p.user_id}">${p.email}</a></div>
  <div class="sub">${p.plan_name} · ${t(`pay.period_${p.period}`)} · ${money(locale, p.amount - p.discount, p.currency)}${p.coupon_code ? ` · ${p.coupon_code}` : ''} · ${formatDateTime(locale, p.created_at, admin.timezone)}${p.billing_name ? ` · ${p.billing_name}` : ''}</div>
  ${p.proof_file_id ? html`<a href="/admin/payments/${p.id}/proof" target="_blank" rel="noopener">${t('pay.see_proof')}</a>` : html`<span class="muted">${t('pay.no_proof')}</span>`}</div>
  ${p.status === 'pending'
    ? html`<div class="btn-row">${postButton(ctx, `/admin/payments/${p.id}/approve`, t('pay.approve'), { cls: 'btn btn-sm btn-primary', confirm: t('pay.approve_confirm') })}
      <form method="post" action="/admin/payments/${p.id}/reject" class="inline btn-row">${csrfField(ctx)}<input name="notes" placeholder="${t('pay.reject_reason')}" class="inline-input" maxlength="300"><button class="btn btn-sm btn-danger" type="submit">${t('pay.reject')}</button></form></div>`
    : p.status === 'paid' ? html`<a class="btn btn-sm" href="/admin/payments/${p.id}/receipt.pdf">${t('pay.receipt')}</a>` : ''}
</li>`)}</ul>`}
<h2>${t('admin.coupons')}</h2>
<form class="card" method="post" action="/admin/coupons" novalidate>${csrfField(ctx)}
  <div class="grid-3">${input({ ctx, name: 'code', label: t('pay.coupon'), required: true, maxlength: 40 })}${input({ ctx, name: 'percent_off', type: 'number', label: t('pay.percent_off'), min: 1, max: 100, required: true })}${input({ ctx, name: 'max_uses', type: 'number', label: t('pay.max_uses'), min: 1 })}</div>
  <div class="grid-2">${input({ ctx, name: 'expires', type: 'date', label: t('plan.expires_label') })}${input({ ctx, name: 'plans', label: t('pay.coupon_plans'), hint: t('pay.coupon_plans_hint'), placeholder: 'pro,business' })}</div>
  <button class="btn btn-primary" type="submit">${t('pay.coupon_create')}</button></form>
${coupons.length ? html`<ul class="list">${coupons.map((c) => html`<li><div class="grow"><div class="title mono">${c.code}</div><div class="sub">−${c.percent_off}% · ${c.used}/${c.max_uses ?? '∞'}${c.expires_at ? ` · ${formatDateTime(locale, c.expires_at, admin.timezone)}` : ''} · ${c.plans}</div></div>
${postButton(ctx, '/admin/coupons/delete', t('common.delete'), { cls: 'btn btn-sm btn-danger', hidden: { code: c.code } })}</li>`)}</ul>` : ''}`,
    }))
  })

  const adminPayment = (req: FastifyRequest) => db.prepare('SELECT * FROM payments WHERE id = ?').get(Number((req.params as { id: string }).id)) as Payment | undefined

  app.get('/admin/payments/:id/proof', { preHandler: adminGuard }, async (req, reply) => {
    const p = adminPayment(req)
    const f = p?.proof_file_id ? findFile(deps, p.proof_file_id) : undefined
    if (!f || !existsSync(uploadPath(deps, f.key)) || !PROOF_TYPES.test(f.mime)) return reply.callNotFound()
    reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
    reply.header('Content-Disposition', 'inline')
    return reply.type(f.mime).send(createReadStream(uploadPath(deps, f.key)))
  })

  app.get('/admin/payments/:id/receipt.pdf', { preHandler: adminGuard }, async (req, reply) => {
    const p = adminPayment(req)
    if (!p || p.status !== 'paid') return reply.callNotFound()
    return receiptOf(p, reply)
  })

  app.post('/admin/payments/:id/approve', { preHandler: adminGuard }, async (req, reply) => {
    const p = adminPayment(req)
    if (!p || p.status !== 'pending') return reply.callNotFound()
    const now = deps.now()
    const expires = activatePayment(db, p, now)
    creditReferral(deps, p)
    db.prepare('UPDATE payments SET reviewed_by = ? WHERE id = ?').run(actorOf(req), p.id)
    audit(db, { actorId: actorOf(req), userId: p.user_id, action: 'pay.approved', target: `payment:${p.id}`, meta: { reference: p.reference } }, now)
    const u = findUserById(db, p.user_id)
    const plan = getPlan(db, p.plan_id)
    if (u && plan) {
      const t = translator(u.locale as Locale)
      await deps.mailer.send({
        to: u.email,
        subject: t('mail.pay_ok_subject', { plan: plan.name }),
        text: t('mail.pay_ok_body', { plan: plan.name, until: expires ? new Intl.DateTimeFormat(u.locale, { dateStyle: 'long' }).format(expires) : t('pay.period_lifetime'), link: `${deps.config.baseUrl}/panel/payments/${p.id}` }),
        button: t('pay.receipt'),
      })
    }
    setFlash(reply, deps, { type: 'ok', key: 'pay.approved' })
    return reply.redirect('/admin/payments', 303)
  })

  app.post('/admin/payments/:id/reject', { preHandler: adminGuard }, async (req, reply) => {
    const p = adminPayment(req)
    if (!p || p.status !== 'pending') return reply.callNotFound()
    const notes = field(req.body, 'notes').trim().slice(0, 300)
    db.prepare("UPDATE payments SET status = 'rejected', notes = ?, reviewed_by = ? WHERE id = ?").run(notes, actorOf(req), p.id)
    audit(db, { actorId: actorOf(req), userId: p.user_id, action: 'pay.rejected', target: `payment:${p.id}` }, deps.now())
    const u = findUserById(db, p.user_id)
    if (u) {
      const t = translator(u.locale as Locale)
      await deps.mailer.send({ to: u.email, subject: t('mail.pay_rejected_subject', { ref: p.reference }), text: t('mail.pay_rejected_body', { ref: p.reference, notes: notes || '—', link: `${deps.config.baseUrl}/panel/payments/${p.id}` }) })
    }
    return reply.redirect('/admin/payments', 303)
  })

  app.post('/admin/coupons', { preHandler: adminGuard }, async (req, reply) => {
    const code = field(req.body, 'code').trim().toUpperCase()
    const pct = Number(field(req.body, 'percent_off'))
    const maxUses = Number(field(req.body, 'max_uses')) || null
    const exp = field(req.body, 'expires')
    const plans = field(req.body, 'plans').split(',').map((s) => s.trim()).filter((s) => listPlans(db).some((p) => p.slug === s))
    if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !Number.isInteger(pct) || pct < 1 || pct > 100) {
      setFlash(reply, deps, { type: 'error', key: 'err.coupon_form' })
      return reply.redirect('/admin/payments', 303)
    }
    db.prepare('INSERT OR REPLACE INTO coupons (code, percent_off, max_uses, expires_at, plans, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(code, pct, maxUses, /^\d{4}-\d{2}-\d{2}$/.test(exp) ? Date.parse(exp + 'T23:59:59Z') : null, JSON.stringify(plans), deps.now())
    audit(db, { actorId: actorOf(req), action: 'admin.coupon', target: code }, deps.now())
    return reply.redirect('/admin/payments', 303)
  })

  app.post('/admin/coupons/delete', { preHandler: adminGuard }, async (req, reply) => {
    db.prepare('DELETE FROM coupons WHERE code = ?').run(field(req.body, 'code'))
    return reply.redirect('/admin/payments', 303)
  })

}
