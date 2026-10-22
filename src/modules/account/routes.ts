import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppDeps } from '../../app.ts'
import { hashPassword, verifyPassword } from '../../lib/crypto.ts'
import { html, raw } from '../../lib/html.ts'
import { LOCALES } from '../../lib/i18n.ts'
import { parseQrStyle, renderQrSvg } from '../../lib/qr.ts'
import { generateSecret, otpauthUri, verifyTotp } from '../../lib/totp.ts'
import { deleteUserFiles } from '../../lib/uploads.ts'
import { panelLayout } from '../../views/layout.ts'
import { csrfField, input, select, type Errors } from '../../views/ui.ts'
import { sendHtml, setFlash, userGuard, type Ctx } from '../../web/context.ts'
import { field, parseForm } from '../../web/forms.ts'
import { passwordSchema, sendVerifyEmail } from '../auth/routes.ts'
import { destroyUserSessions, SESSION_COOKIE } from '../auth/sessions.ts'
import { audit } from '../settings/repo.ts'
import { deleteUser, findUserByEmail, findUserById, normalizeEmail, updateUser, type User } from '../users/repo.ts'
import { exportUserData } from './export.ts'

const TIMEZONES = Intl.supportedValuesOf('timeZone')

const profileSchema = z.object({
  name: z.string().trim().max(80, 'err.too_long'),
  email: z.string().trim().max(254, 'err.email').pipe(z.email('err.email')),
  locale: z.enum(LOCALES),
  timezone: z.string().refine((v) => TIMEZONES.includes(v), 'err.invalid'),
})

type Section = 'profile' | 'password' | '2fa' | 'delete'

function accountPage(ctx: Ctx, user: User, errors: Partial<Record<Section, Errors>> = {}, values: Record<string, string> = {}) {
  const { t } = ctx
  const e = (s: Section) => errors[s] ?? {}
  return panelLayout(ctx, {
    title: t('account.title'),
    active: 'account',
    path: '/panel/account',
    body: html`<h1>${t('account.title')}</h1>

<section class="card" aria-labelledby="h-profile">
  <h2 id="h-profile">${t('account.profile')}</h2>
  <form method="post" action="/panel/account/profile" novalidate>
    ${csrfField(ctx)}
    <div class="grid-2">
      ${input({ ctx, name: 'name', label: t('auth.name'), value: values.name ?? user.name, error: e('profile').name, maxlength: 80, autocomplete: 'name' })}
      ${input({ ctx, name: 'email', type: 'email', label: t('auth.email'), value: values.email ?? user.email, error: e('profile').email, required: true, autocomplete: 'email', hint: user.email_verified_at ? t('account.email_verified') : t('account.email_unverified') })}
      ${select({ ctx, name: 'locale', label: t('account.language'), value: user.locale, options: [{ value: 'es-MX', label: 'Español (México)' }, { value: 'en', label: 'English' }] })}
      ${select({ ctx, name: 'timezone', label: t('account.timezone'), value: user.timezone, error: e('profile').timezone, options: TIMEZONES.map((z) => ({ value: z, label: z.replace(/_/g, ' ') })) })}
    </div>
    <button class="btn btn-primary" type="submit">${t('common.save')}</button>
  </form>
</section>

<section class="card" aria-labelledby="h-password">
  <h2 id="h-password">${t('account.password')}</h2>
  <form method="post" action="/panel/account/password" novalidate>
    ${csrfField(ctx)}
    <div class="grid-2">
      ${input({ ctx, name: 'current', type: 'password', label: t('account.current_password'), error: e('password').current, required: true, autocomplete: 'current-password' })}
      ${input({ ctx, name: 'password', type: 'password', label: t('auth.new_password'), hint: t('auth.password_hint'), error: e('password').password, required: true, autocomplete: 'new-password' })}
    </div>
    <button class="btn btn-primary" type="submit">${t('account.change_password')}</button>
  </form>
</section>

<section class="card" aria-labelledby="h-2fa">
  <h2 id="h-2fa">${t('account.2fa')}</h2>
  ${user.totp_enabled_at
    ? html`<p><span class="tag">${t('account.2fa_on')}</span></p>
      <form method="post" action="/panel/account/2fa/disable" novalidate>
        ${csrfField(ctx)}
        <div class="grid-2">
          ${input({ ctx, name: 'current', type: 'password', label: t('account.current_password'), error: e('2fa').current, required: true, autocomplete: 'current-password' })}
          ${input({ ctx, name: 'code', label: t('auth.2fa_code'), error: e('2fa').code, required: true, inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7 })}
        </div>
        <button class="btn btn-danger" type="submit">${t('account.2fa_disable')}</button>
      </form>`
    : html`<p>${t('account.2fa_intro')}</p><a class="btn" href="/panel/account/2fa">${t('account.2fa_enable')}</a>`}
</section>

<section class="card" aria-labelledby="h-data">
  <h2 id="h-data">${t('account.data')}</h2>
  <p>${t('account.export_body')}</p>
  <a class="btn" href="/panel/account/export" download>${t('account.export')}</a>
</section>

<section class="card" aria-labelledby="h-delete">
  <h2 id="h-delete">${t('account.delete')}</h2>
  <p>${t('account.delete_body')}</p>
  <form method="post" action="/panel/account/delete" novalidate data-confirm="${t('account.delete_confirm')}">
    ${csrfField(ctx)}
    ${input({ ctx, name: 'current', type: 'password', label: t('account.current_password'), error: e('delete').current, required: true, autocomplete: 'current-password' })}
    <button class="btn btn-danger" type="submit">${t('account.delete_submit')}</button>
  </form>
</section>`,
  })
}

function twoFactorSetupPage(ctx: Ctx, user: User, secret: string, error?: string) {
  const { t } = ctx
  const uri = otpauthUri(secret, user.email)
  const svg = renderQrSvg(uri, parseQrStyle({ size: 220, margin: 2 }))
  return panelLayout(ctx, {
    title: t('account.2fa'),
    active: 'account',
    path: '/panel/account/2fa',
    body: html`<h1>${t('account.2fa')}</h1>
<div class="card">
  <ol>
    <li>${t('account.2fa_step1')}</li>
    <li>${t('account.2fa_step2')}</li>
  </ol>
  <figure class="qr-figure">${raw(svg)}<figcaption>${t('account.2fa_manual')} <code class="mono">${secret.match(/.{1,4}/g)?.join(' ')}</code></figcaption></figure>
  <form method="post" action="/panel/account/2fa/enable" novalidate>
    ${csrfField(ctx)}
    ${input({ ctx, name: 'code', label: t('auth.2fa_code'), error, required: true, inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, autofocus: true })}
    <div class="btn-row"><button class="btn btn-primary" type="submit">${t('account.2fa_enable')}</button><a class="btn" href="/panel/account">${t('common.cancel')}</a></div>
  </form>
</div>`,
  })
}

export function registerAccount(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const me = (req: { ctx: Ctx }) => req.ctx.user as User
  const reload = (id: number) => findUserById(db, id) as User

  app.get('/panel/account', { preHandler: userGuard }, async (req, reply) => sendHtml(reply, accountPage(req.ctx, me(req))))

  app.post('/panel/account/profile', { preHandler: userGuard }, async (req, reply) => {
    const user = me(req)
    const r = parseForm(profileSchema, req.body)
    const values = { name: field(req.body, 'name'), email: field(req.body, 'email') }
    if (!r.ok) return sendHtml(reply, accountPage(req.ctx, user, { profile: r.errors }, values), 422)
    const email = normalizeEmail(r.data.email)
    const changedEmail = email !== user.email
    if (changedEmail && findUserByEmail(db, email)) {
      return sendHtml(reply, accountPage(req.ctx, user, { profile: { email: 'err.email_taken' } }, values), 422)
    }
    updateUser(db, user.id, {
      name: r.data.name,
      email,
      locale: r.data.locale,
      timezone: r.data.timezone,
      ...(changedEmail ? { email_verified_at: null } : {}),
    }, deps.now())
    if (changedEmail) {
      await sendVerifyEmail(deps, reload(user.id))
      audit(db, { actorId: user.id, userId: user.id, action: 'user.email_changed', meta: { from: user.email, to: email } }, deps.now())
    }
    setFlash(reply, deps, { type: 'ok', key: changedEmail ? 'account.saved_email' : 'account.saved' })
    return reply.redirect('/panel/account', 303)
  })

  app.post('/panel/account/password', { preHandler: userGuard, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const user = me(req)
    if (!(await verifyPassword(field(req.body, 'current'), user.password_hash))) {
      return sendHtml(reply, accountPage(req.ctx, user, { password: { current: 'err.password_wrong' } }), 422)
    }
    const r = parseForm(z.object({ password: passwordSchema }), req.body)
    if (!r.ok) return sendHtml(reply, accountPage(req.ctx, user, { password: r.errors }), 422)
    updateUser(db, user.id, { password_hash: await hashPassword(r.data.password) }, deps.now())
    destroyUserSessions(db, user.id, req.ctx.session?.id_hash)
    audit(db, { actorId: user.id, userId: user.id, action: 'user.password_changed' }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'account.password_changed' })
    return reply.redirect('/panel/account', 303)
  })

  app.get('/panel/account/2fa', { preHandler: userGuard }, async (req, reply) => {
    const user = me(req)
    if (user.totp_enabled_at) return reply.redirect('/panel/account', 303)
    // secreto pendiente: se guarda sin activar hasta que el usuario confirme un código
    let secret = user.totp_secret
    if (!secret) {
      secret = generateSecret()
      updateUser(db, user.id, { totp_secret: secret }, deps.now())
    }
    return sendHtml(reply, twoFactorSetupPage(req.ctx, user, secret))
  })

  app.post('/panel/account/2fa/enable', { preHandler: userGuard, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const user = me(req)
    if (user.totp_enabled_at || !user.totp_secret) return reply.redirect('/panel/account', 303)
    if (!verifyTotp(user.totp_secret, field(req.body, 'code'), deps.now())) {
      return sendHtml(reply, twoFactorSetupPage(req.ctx, user, user.totp_secret, 'err.2fa_invalid'), 422)
    }
    updateUser(db, user.id, { totp_enabled_at: deps.now() }, deps.now())
    audit(db, { actorId: user.id, userId: user.id, action: 'user.2fa_enabled' }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'account.2fa_enabled' })
    return reply.redirect('/panel/account', 303)
  })

  app.post('/panel/account/2fa/disable', { preHandler: userGuard, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const user = me(req)
    const errors: Errors = {}
    if (!(await verifyPassword(field(req.body, 'current'), user.password_hash))) errors.current = 'err.password_wrong'
    if (!user.totp_secret || !verifyTotp(user.totp_secret, field(req.body, 'code'), deps.now())) errors.code = 'err.2fa_invalid'
    if (Object.keys(errors).length) return sendHtml(reply, accountPage(req.ctx, user, { '2fa': errors }), 422)
    updateUser(db, user.id, { totp_enabled_at: null, totp_secret: null }, deps.now())
    audit(db, { actorId: user.id, userId: user.id, action: 'user.2fa_disabled' }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'account.2fa_disabled' })
    return reply.redirect('/panel/account', 303)
  })

  app.get('/panel/account/export', { preHandler: userGuard }, async (req, reply) => {
    const user = me(req)
    const data = exportUserData(db, user.id)
    reply.header('Content-Disposition', `attachment; filename="tubio-${user.id}-${new Date(deps.now()).toISOString().slice(0, 10)}.json"`)
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(data, null, 2))
  })

  app.post('/panel/account/delete', { preHandler: userGuard, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const user = me(req)
    if (req.ctx.session?.impersonator_id) return reply.code(403).send('impersonating')
    if (!(await verifyPassword(field(req.body, 'current'), user.password_hash))) {
      return sendHtml(reply, accountPage(req.ctx, user, { delete: { current: 'err.password_wrong' } }), 422)
    }
    deleteUserFiles(deps, user.id)
    deleteUser(db, user.id)
    audit(db, { actorId: user.id, userId: user.id, action: 'user.deleted', meta: { email: user.email } }, deps.now())
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    setFlash(reply, deps, { type: 'info', key: 'account.deleted' })
    return reply.redirect('/login', 303)
  })
}
