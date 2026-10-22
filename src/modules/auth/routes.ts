import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AppDeps } from '../../app.ts'
import { hashPassword, verifyPassword } from '../../lib/crypto.ts'
import { translator, type Locale } from '../../lib/i18n.ts'
import { matchTotp } from '../../lib/totp.ts'
import { messagePage } from '../../views/layout.ts'
import { cookieOpts, powOk, safeNext, sendHtml, setFlash } from '../../web/context.ts'
import { checked, field, parseForm } from '../../web/forms.ts'
import { LEGAL_UPDATED } from '../legal/routes.ts'
import { audit, getSetting } from '../settings/repo.ts'
import { createUser, findUserByEmail, findUserById, updateUser, type User } from '../users/repo.ts'
import { createSession, destroySession, destroyUserSessions, SESSION_COOKIE, SESSION_TTL_MS } from './sessions.ts'
import { consumeAuthToken, createAuthToken, peekAuthToken } from './tokens.ts'
import { forgotPage, loginPage, registerPage, resetPage, twoFactorPage } from './views.ts'

export const passwordSchema = z.string().min(10, 'err.password_short').max(200, 'err.password_long')
const emailSchema = z.string().trim().max(254, 'err.email').pipe(z.email('err.email'))

const registerSchema = z.object({
  name: z.string().trim().max(80, 'err.too_long').default(''),
  email: emailSchema,
  password: passwordSchema,
})
const loginSchema = z.object({ email: z.string().trim().min(1, 'err.required'), password: z.string().min(1, 'err.required') })

/** scrypt de relleno para que "usuario no existe" tarde lo mismo que "contraseña mala" */
let dummyHash: Promise<string> | null = null

/** Códigos 2FA fallidos permitidos por inicio de sesión */
const MAX_2FA_ATTEMPTS = 5
/** Fallos seguidos por cuenta antes de bloquear el 2FA 15 minutos */
const MAX_2FA_ACCOUNT_FAILS = 8
const LOCK_MS = 15 * 60 * 1000

const AUTH_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } }

/** Quién hizo la acción: el admin si está suplantando */
export function actorOf(req: FastifyRequest): number | null {
  return req.ctx.session?.impersonator_id ?? req.ctx.user?.id ?? null
}

export function startSession(req: FastifyRequest, reply: FastifyReply, deps: AppDeps, userId: number, pending2fa = false, impersonatorId: number | null = null) {
  if (req.ctx.session) destroySession(deps.db, req.ctx.session.id_hash)
  const { token } = createSession(deps.db, userId, { pending2fa, impersonatorId }, deps.now())
  reply.setCookie(SESSION_COOKIE, token, cookieOpts(deps, pending2fa ? 600 : SESSION_TTL_MS / 1000))
}

export async function sendVerifyEmail(deps: AppDeps, user: User): Promise<void> {
  const token = createAuthToken(deps.db, user.id, 'verify_email', deps.now())
  const t = translator(user.locale as Locale)
  await deps.mailer.send({
    to: user.email,
    subject: t('mail.verify_subject'),
    text: t('mail.verify_body', { link: `${deps.config.baseUrl}/verify/${token}` }),
  })
}

export function registerAuth(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  app.get('/register', async (req, reply) => {
    if (req.ctx.user) return reply.redirect('/panel', 303)
    if (!getSetting(db, 'registration_open')) {
      return sendHtml(reply, messagePage(req.ctx, { title: req.ctx.t('auth.register_title'), message: req.ctx.t('auth.registration_closed') }), 403)
    }
    return sendHtml(reply, registerPage(req.ctx))
  })

  app.post('/register', { config: AUTH_LIMIT }, async (req, reply) => {
    const { t } = req.ctx
    if (!getSetting(db, 'registration_open')) {
      return sendHtml(reply, messagePage(req.ctx, { title: t('auth.register_title'), message: t('auth.registration_closed') }), 403)
    }
    const values = { name: field(req.body, 'name'), email: field(req.body, 'email') }
    if (!powOk(deps, req.body)) return sendHtml(reply, registerPage(req.ctx, values, { _form: 'err.pow' }), 422)
    if (!checked(req.body, 'accept')) return sendHtml(reply, registerPage(req.ctx, values, { accept: 'err.accept_terms' }), 422)
    const r = parseForm(registerSchema, req.body)
    if (!r.ok) return sendHtml(reply, registerPage(req.ctx, values, r.errors), 422)
    if (findUserByEmail(db, r.data.email)) {
      return sendHtml(reply, registerPage(req.ctx, values, { email: 'err.email_taken' }), 422)
    }
    const user = createUser(db, {
      email: r.data.email,
      name: r.data.name,
      passwordHash: await hashPassword(r.data.password),
      locale: req.ctx.locale,
    }, deps.now())
    audit(db, { actorId: user.id, userId: user.id, action: 'user.register', meta: { terms: LEGAL_UPDATED } }, deps.now())
    await sendVerifyEmail(deps, user)
    startSession(req, reply, deps, user.id)
    setFlash(reply, deps, { type: 'ok', key: 'auth.welcome' })
    return reply.redirect('/panel', 303)
  })

  app.get('/login', async (req, reply) => {
    const next = safeNext((req.query as { next?: string }).next, '')
    if (req.ctx.user) return reply.redirect(next || '/panel', 303)
    return sendHtml(reply, loginPage(req.ctx, {}, {}, next))
  })

  app.post('/login', { config: AUTH_LIMIT }, async (req, reply) => {
    const next = safeNext(field(req.body, 'next'), '')
    const values = { email: field(req.body, 'email') }
    const r = parseForm(loginSchema, req.body)
    if (!r.ok) return sendHtml(reply, loginPage(req.ctx, values, r.errors, next), 422)
    const user = findUserByEmail(db, r.data.email)
    dummyHash ??= hashPassword('relleno-para-tiempo-constante')
    const ok = await verifyPassword(r.data.password, user?.password_hash ?? (await dummyHash))
    if (!user || !ok) {
      return sendHtml(reply, loginPage(req.ctx, values, { _form: 'err.login_failed' }, next), 401)
    }
    if (user.status !== 'active') {
      return sendHtml(reply, loginPage(req.ctx, values, { _form: 'err.account_suspended' }, next), 403)
    }
    if (user.totp_enabled_at && user.totp_secret) {
      startSession(req, reply, deps, user.id, true)
      return reply.redirect('/login/2fa' + (next ? '?next=' + encodeURIComponent(next) : ''), 303)
    }
    startSession(req, reply, deps, user.id)
    audit(db, { actorId: user.id, userId: user.id, action: 'user.login' }, deps.now())
    return reply.redirect(next || '/panel', 303)
  })

  app.get('/login/2fa', async (req, reply) => {
    if (!req.ctx.session?.pending_2fa) return reply.redirect('/login', 303)
    return sendHtml(reply, twoFactorPage(req.ctx, {}, safeNext((req.query as { next?: string }).next, '')))
  })

  app.post('/login/2fa', { config: AUTH_LIMIT }, async (req, reply) => {
    const session = req.ctx.session
    if (!session?.pending_2fa) return reply.redirect('/login', 303)
    const next = safeNext(field(req.body, 'next'), '')
    const user = findUserById(db, session.user_id)
    const now = deps.now()
    if (!user) return reply.redirect('/login', 303)
    if (user.locked_until && user.locked_until > now) {
      return sendHtml(reply, twoFactorPage(req.ctx, { code: 'err.2fa_locked' }, next), 429)
    }
    const counter = user.totp_secret ? matchTotp(user.totp_secret, field(req.body, 'code'), now) : null
    // un código ya usado no vale otra vez (alguien que lo vio por encima del hombro)
    const ok = counter !== null && (user.totp_last_counter === null || counter > user.totp_last_counter)
    if (!ok) {
      db.prepare('UPDATE sessions SET failed_2fa = failed_2fa + 1 WHERE id_hash = ?').run(session.id_hash)
      // tope por cuenta (no por sesión): volver a poner la contraseña no reinicia el conteo
      const fails = user.failed_2fa + 1
      if (fails >= MAX_2FA_ACCOUNT_FAILS) {
        updateUser(db, user.id, { failed_2fa: 0, locked_until: now + LOCK_MS }, now)
        audit(db, { userId: user.id, action: 'user.2fa_locked' }, now)
        const tu = translator(user.locale as Locale)
        await deps.mailer.send({ to: user.email, subject: tu('mail.2fa_locked_subject'), text: tu('mail.2fa_locked_body') })
      } else updateUser(db, user.id, { failed_2fa: fails }, now)
      if ((session.failed_2fa ?? 0) + 1 >= MAX_2FA_ATTEMPTS) {
        destroySession(db, session.id_hash)
        reply.clearCookie(SESSION_COOKIE, { path: '/' })
        setFlash(reply, deps, { type: 'error', key: 'err.2fa_too_many' })
        return reply.redirect('/login', 303)
      }
      return sendHtml(reply, twoFactorPage(req.ctx, { code: 'err.2fa_invalid' }, next), 401)
    }
    updateUser(db, user.id, { failed_2fa: 0, locked_until: null, totp_last_counter: counter }, now)
    startSession(req, reply, deps, user.id)
    audit(db, { actorId: user.id, userId: user.id, action: 'user.login', meta: { twoFactor: true } }, now)
    return reply.redirect(next || '/panel', 303)
  })

  app.post('/logout', async (req, reply) => {
    if (req.ctx.session) destroySession(db, req.ctx.session.id_hash)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.redirect('/login', 303)
  })

  app.get('/verify/:token', async (req, reply) => {
    const { token } = req.params as { token: string }
    const userId = consumeAuthToken(db, token, 'verify_email', deps.now())
    const { t } = req.ctx
    if (!userId) {
      return sendHtml(reply, messagePage(req.ctx, { title: t('auth.verify_title'), message: t('auth.verify_invalid') }), 400)
    }
    updateUser(db, userId, { email_verified_at: deps.now() }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'auth.verify_done' })
    return reply.redirect(req.ctx.user ? '/panel' : '/login', 303)
  })

  app.post('/verify/resend', { config: AUTH_LIMIT }, async (req, reply) => {
    const user = req.ctx.user
    if (!user) return reply.redirect('/login', 303)
    if (!user.email_verified_at) await sendVerifyEmail(deps, user)
    setFlash(reply, deps, { type: 'ok', key: 'auth.verify_sent' })
    return reply.redirect('/panel', 303)
  })

  app.get('/forgot', async (req, reply) => sendHtml(reply, forgotPage(req.ctx)))

  app.post('/forgot', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const email = field(req.body, 'email')
    if (!powOk(deps, req.body)) return sendHtml(reply, forgotPage(req.ctx, { email }, { email: 'err.pow' }), 422)
    const r = parseForm(z.object({ email: emailSchema }), req.body)
    if (!r.ok) return sendHtml(reply, forgotPage(req.ctx, { email }, r.errors), 422)
    const user = findUserByEmail(db, r.data.email)
    if (user && user.status === 'active') {
      const token = createAuthToken(db, user.id, 'reset_password', deps.now())
      const t = translator(user.locale as Locale)
      await deps.mailer.send({
        to: user.email,
        subject: t('mail.reset_subject'),
        text: t('mail.reset_body', { link: `${deps.config.baseUrl}/reset/${token}` }),
      })
    }
    // misma respuesta exista o no la cuenta
    return sendHtml(reply, forgotPage(req.ctx, {}, {}, true))
  })

  app.get('/reset/:token', async (req, reply) => {
    const { token } = req.params as { token: string }
    if (!peekAuthToken(db, token, 'reset_password', deps.now())) {
      const { t } = req.ctx
      return sendHtml(reply, messagePage(req.ctx, { title: t('auth.reset_title'), message: t('auth.reset_invalid') }), 400)
    }
    return sendHtml(reply, resetPage(req.ctx, token))
  })

  app.post('/reset/:token', { config: AUTH_LIMIT }, async (req, reply) => {
    const { token } = req.params as { token: string }
    const { t } = req.ctx
    if (!peekAuthToken(db, token, 'reset_password', deps.now())) {
      return sendHtml(reply, messagePage(req.ctx, { title: t('auth.reset_title'), message: t('auth.reset_invalid') }), 400)
    }
    const r = parseForm(z.object({ password: passwordSchema }), req.body)
    if (!r.ok) return sendHtml(reply, resetPage(req.ctx, token, r.errors), 422)
    const userId = consumeAuthToken(db, token, 'reset_password', deps.now()) as number
    // quien recibió el correo demostró ser dueño del buzón: también queda verificado
    const user = findUserById(db, userId)
    updateUser(db, userId, {
      password_hash: await hashPassword(r.data.password),
      ...(user?.email_verified_at ? {} : { email_verified_at: deps.now() }),
    }, deps.now())
    destroyUserSessions(db, userId)
    audit(db, { actorId: userId, userId, action: 'user.password_reset' }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'auth.reset_done' })
    return reply.redirect('/login', 303)
  })
}
