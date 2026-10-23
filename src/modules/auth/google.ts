import { claimFounder } from '../plans/founders.ts'
import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { hashPassword, randomToken, safeEqual } from '../../lib/crypto.ts'
import { messagePage } from '../../views/layout.ts'
import { cookieOpts, safeNext, sendHtml, setFlash } from '../../web/context.ts'
import { audit, getSetting } from '../settings/repo.ts'
import { createUser, findUserByEmail, findUserByGoogleSub, updateUser } from '../users/repo.ts'
import { startSession } from './routes.ts'

/**
 * Login con Google (OpenID Connect, flujo "authorization code" con PKCE).
 * El id_token llega directo del endpoint de tokens de Google por TLS, así que basta revisar
 * emisor, audiencia, vencimiento y nonce (OIDC Core §3.1.3.7).
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const STATE_COOKIE = 'tb_goog'

type IdClaims = { iss?: string; aud?: string; exp?: number; sub?: string; email?: string; email_verified?: boolean; name?: string; nonce?: string }

function decodeJwtPayload(jwt: string): IdClaims | null {
  const part = jwt.split('.')[1]
  if (!part) return null
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as IdClaims
  } catch {
    return null
  }
}

export function registerGoogle(app: FastifyInstance, deps: AppDeps): void {
  const { db, config } = deps
  const enabled = () => !!(config.googleClientId && config.googleClientSecret)
  const redirectUri = () => `${config.baseUrl}/login/google/callback`
  const http = deps.fetch ?? fetch

  const fail = (req: FastifyRequest, reply: FastifyReply, key: string, status = 400) =>
    sendHtml(reply, messagePage(req.ctx, { title: req.ctx.t('auth.google'), message: req.ctx.t(key) }), status)

  app.get('/login/google', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!enabled()) return reply.callNotFound()
    const state = randomToken(24)
    const nonce = randomToken(24)
    const verifier = randomToken(48)
    const next = safeNext((req.query as { next?: string }).next, '')
    reply.setCookie(STATE_COOKIE, JSON.stringify({ state, nonce, verifier, next }), { ...cookieOpts(deps, 600), signed: true })
    const q = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })
    return reply.redirect(`${AUTH_URL}?${q}`, 302)
  })

  app.get('/login/google/callback', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    if (!enabled()) return reply.callNotFound()
    const q = req.query as { code?: string; state?: string; error?: string }
    const raw = req.cookies[STATE_COOKIE]
    reply.clearCookie(STATE_COOKIE, { path: '/' })
    const un = raw ? req.unsignCookie(raw) : null
    let saved: { state: string; nonce: string; verifier: string; next: string } | null = null
    try {
      saved = un?.valid && un.value ? JSON.parse(un.value) : null
    } catch {
      saved = null
    }
    if (q.error) return reply.redirect('/login', 303)
    if (!saved || !q.state || !q.code || !safeEqual(q.state, saved.state)) return fail(req, reply, 'err.google_state')

    let claims: IdClaims | null = null
    try {
      const res = await http(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: q.code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: redirectUri(),
          grant_type: 'authorization_code',
          code_verifier: saved.verifier,
        }).toString(),
      })
      if (!res.ok) return fail(req, reply, 'err.google_failed', 502)
      const tok = (await res.json()) as { id_token?: string }
      claims = tok.id_token ? decodeJwtPayload(tok.id_token) : null
    } catch {
      return fail(req, reply, 'err.google_failed', 502)
    }
    const now = deps.now()
    if (
      !claims ||
      (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') ||
      claims.aud !== config.googleClientId ||
      !claims.exp ||
      claims.exp * 1000 < now ||
      claims.nonce !== saved.nonce ||
      !claims.sub ||
      !claims.email ||
      claims.email_verified !== true
    ) {
      return fail(req, reply, 'err.google_failed', 401)
    }

    let user = findUserByGoogleSub(db, claims.sub)
    if (!user) {
      const byEmail = findUserByEmail(db, claims.email)
      if (byEmail) {
        // mismo correo verificado por Google: se enlaza la cuenta existente
        updateUser(db, byEmail.id, { google_sub: claims.sub, ...(byEmail.email_verified_at ? {} : { email_verified_at: now }) }, now)
        claimFounder(deps, byEmail.id)
        audit(db, { actorId: byEmail.id, userId: byEmail.id, action: 'user.google_linked' }, now)
        user = findUserByGoogleSub(db, claims.sub)
      } else {
        if (!getSetting(db, 'registration_open')) return fail(req, reply, 'auth.registration_closed', 403)
        const created = createUser(db, { email: claims.email, passwordHash: await hashPassword(randomToken(32)), name: (claims.name ?? '').slice(0, 80), locale: req.ctx.locale }, now)
        updateUser(db, created.id, { google_sub: claims.sub, email_verified_at: now }, now)
        claimFounder(deps, created.id)
        audit(db, { actorId: created.id, userId: created.id, action: 'user.register', meta: { google: true } }, now)
        user = findUserByGoogleSub(db, claims.sub)
        setFlash(reply, deps, { type: 'ok', key: 'auth.welcome_google' })
      }
    }
    if (!user) return fail(req, reply, 'err.google_failed', 500)
    if (user.status !== 'active') return fail(req, reply, 'err.account_suspended', 403)
    if (user.totp_enabled_at && user.totp_secret) {
      startSession(req, reply, deps, user.id, true)
      return reply.redirect('/login/2fa' + (saved.next ? '?next=' + encodeURIComponent(saved.next) : ''), 303)
    }
    startSession(req, reply, deps, user.id)
    audit(db, { actorId: user.id, userId: user.id, action: 'user.login', meta: { google: true } }, now)
    return reply.redirect(saved.next || '/panel', 303)
  })
}
