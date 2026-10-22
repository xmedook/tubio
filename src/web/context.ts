import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../app.ts'
import { randomToken, safeEqual } from '../lib/crypto.ts'
import { createChallenge, verifySolution, type PowChallenge } from '../lib/pow.ts'
import type { SafeHtml } from '../lib/html.ts'
import { fromAcceptLanguage, isLocale, translator, type Locale, type T } from '../lib/i18n.ts'
import { loadSession, SESSION_COOKIE, type Session } from '../modules/auth/sessions.ts'
import { domainIdForHost, domainOwner } from '../modules/domains/repo.ts'
import { limitsOf, ownerLimits } from '../modules/plans/limits.ts'
import { findUserById } from '../modules/users/repo.ts'
import { getSetting } from '../modules/settings/repo.ts'
import type { User } from '../modules/users/repo.ts'

export type Flash = { type: 'ok' | 'error' | 'info'; key: string; vars?: Record<string, string | number> }

export type Ctx = {
  locale: Locale
  t: T
  /** Usuario con sesión completa (2FA superado, no suspendido) */
  user: User | null
  session: Session | null
  csrf: string
  /** nonce para <script>/<style> en línea de esta respuesta */
  nonce: string
  flash: Flash | null
  now: number
  baseUrl: string
  /** hay credenciales de Google configuradas */
  googleEnabled: boolean
  /** reto nuevo de prueba de trabajo, o null si está desactivada */
  pow: () => PowChallenge | null
  /** 0 = dominio principal; >0 = dominio propio de un usuario */
  domainId: number
  /** trabajando en el espacio de otro: `user` es el dueño y `member` la persona real */
  member: User | null
  teamRole: 'viewer' | 'editor' | 'admin' | null
  announcement: { text: string; level: 'info' | 'warn' } | null
}

declare module 'fastify' {
  interface FastifyRequest {
    ctx: Ctx
  }
  interface FastifyContextConfig {
    /** false = la ruta no exige token CSRF */
    csrf?: boolean
  }
}

export const LANG_COOKIE = 'tb_lang'
const CSRF_COOKIE = 'tb_csrf'
const FLASH_COOKIE = 'tb_flash'

export function cookieOpts(deps: AppDeps, maxAgeSec?: number) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: deps.config.baseUrl.startsWith('https://'),
    ...(maxAgeSec !== undefined ? { maxAge: maxAgeSec } : {}),
  }
}

/** Rutas que siempre son de la persona real (no del espacio de equipo en el que esté) */
const PERSONAL = /^\/(panel\/(account|plan|payments|checkout|trial|api|team|workspace)|logout|lang|verify|admin)(\/|$|\?)/

/** Qué puede hacer cada rol de equipo en el espacio de otro */
export function teamAllows(role: Ctx['teamRole'], method: string, url: string): boolean {
  if (!role || role === 'admin') return true
  if (method === 'GET' || method === 'HEAD') return true
  if (role === 'viewer') return false
  // editor: todo lo del contenido, nada de dominios, avisos, píxeles ni borrar datos capturados
  return !/^\/panel\/(domains|notifications|pixels|splashes|data\/delete)/.test(url)
}

/**
 * Ruta contra la que se aplican los permisos: el patrón que Fastify ya resolvió
 * (p. ej. `/panel/team/:id/role`), nunca `req.url` crudo — `/panel/%74eam` llega
 * decodificado a la ruta de equipo y una regex sobre la URL cruda no lo ve.
 * Sin ruta (404) cae al path decodificado y normalizado.
 */
export function routePath(req: FastifyRequest): string {
  const pattern = req.routeOptions?.url
  if (pattern) return pattern
  const raw = req.url.split('?')[0] ?? '/'
  let dec = raw
  try {
    dec = decodeURIComponent(raw)
  } catch {
    /* secuencia inválida: se queda cruda */
  }
  return dec.replace(/\/+/g, '/').toLowerCase()
}

export function registerContext(app: FastifyInstance, deps: AppDeps): void {
  app.decorateRequest('ctx', null as unknown as Ctx)

  app.addHook('onRequest', async (req, reply) => {
    const now = deps.now()
    // dominio propio: sólo lo público; el panel y la cuenta viven en el dominio principal
    const domainId = domainIdForHost(req.hostname) ?? 0
    const path = routePath(req)
    // dominio de alguien cuyo plan ya no incluye dominios propios: no se sirve
    if (domainId && !(ownerLimits(deps.db, domainOwner(domainId) ?? 0, now)?.custom_domains ?? 0)) {
      return reply.code(404).type('text/plain').send('Not found')
    }
    if (domainId && /^\/(panel|admin|login|register|logout|forgot|reset|verify|lang|api|waitlist|terms|privacy|acceptable-use|source|security|help|_\/caddy)(\/|$|\?)/.test(path)) {
      return reply.redirect(deps.config.baseUrl + req.url, 301)
    }
    let user: User | null = null
    let session: Session | null = null
    const sid = req.cookies[SESSION_COOKIE]
    if (sid) {
      const loaded = loadSession(deps.db, sid, now)
      if (loaded) {
        session = loaded.session
        if (!loaded.session.pending_2fa && loaded.user.status === 'active') user = loaded.user
      } else {
        reply.clearCookie(SESSION_COOKIE, { path: '/' })
      }
    }

    // espacio de trabajo de un equipo: el panel opera sobre el dueño, salvo lo personal
    let member: User | null = null
    let teamRole: Ctx['teamRole'] = null
    const wsId = (session as (Session & { workspace_id?: number | null }) | null)?.workspace_id
    if (user && wsId && wsId !== user.id && !PERSONAL.test(path)) {
      const m = deps.db.prepare('SELECT role FROM team_members WHERE owner_id = ? AND user_id = ? AND accepted_at IS NOT NULL').get(wsId, user.id) as { role: Ctx['teamRole'] } | undefined
      const owner = m ? findUserById(deps.db, wsId) : undefined
      if (m && owner && owner.status === 'active' && (limitsOf(deps.db, owner, now).team_members ?? 0) !== 0) {
        member = user
        user = owner
        teamRole = m.role
      }
    }

    const cookieLang = req.cookies[LANG_COOKIE]
    const me = member ?? user
    const locale: Locale = me && isLocale(me.locale)
      ? me.locale
      : isLocale(cookieLang)
        ? cookieLang
        : fromAcceptLanguage(req.headers['accept-language'])

    let csrf = session?.csrf ?? req.cookies[CSRF_COOKIE] ?? ''
    if (!csrf || csrf.length > 64) {
      csrf = randomToken(24)
      reply.setCookie(CSRF_COOKIE, csrf, cookieOpts(deps))
    }

    let flash: Flash | null = null
    const rawFlash = req.cookies[FLASH_COOKIE]
    if (rawFlash) {
      const un = req.unsignCookie(rawFlash)
      if (un.valid && un.value) {
        try {
          flash = JSON.parse(un.value) as Flash
        } catch {
          flash = null
        }
      }
      reply.clearCookie(FLASH_COOKIE, { path: '/' })
    }

    req.ctx = {
      locale,
      t: translator(locale),
      user,
      session,
      csrf,
      nonce: randomBytes(16).toString('base64'),
      flash,
      now,
      baseUrl: deps.config.baseUrl,
      googleEnabled: !!(deps.config.googleClientId && deps.config.googleClientSecret),
      pow: () => (deps.config.powMax > 0 ? createChallenge(deps.config.secret, now, deps.config.powMax) : null),
      domainId,
      member,
      teamRole,
      announcement: (() => {
        const text = getSetting(deps.db, 'announcement')
        return text ? { text, level: getSetting(deps.db, 'announcement_level') === 'warn' ? 'warn' : 'info' } : null
      })(),
    }
    // mantenimiento: el panel se cierra a quien no es admin (los enlaces públicos siguen)
    const real = member ?? user
    if (getSetting(deps.db, 'maintenance') && /^\/(panel|register)(\/|$|\?)/.test(routePath(req)) && real?.role !== 'admin') {
      const t = req.ctx.t
      return reply.code(503).header('Retry-After', '1800').type('text/html; charset=utf-8').send(`<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>tubio</title><link rel="stylesheet" href="/_/static/css/app.css"><body class="auth"><main class="auth-card"><p class="brand brand-lg">tu<span>bio</span></p><h1>${t('site.maintenance_title')}</h1><p>${t('site.maintenance_body')}</p></main></body></html>`)
    }
  })

  app.addHook('preHandler', async (req, reply) => {
    if (req.ctx?.teamRole && !teamAllows(req.ctx.teamRole, req.method, routePath(req))) {
      return reply.code(403).type('text/plain').send(req.ctx.t('team.forbidden'))
    }
  })

  // CSRF: todo método que cambia estado lleva token (campo _csrf, query _csrf o encabezado x-csrf-token)
  app.addHook('preHandler', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return
    if (req.routeOptions.config?.csrf === false) return
    const origin = req.headers.origin
    if (origin && origin !== 'null' && !sameOrigin(origin, deps.config.baseUrl, req.headers.host)) {
      return reply.code(403).type('text/plain').send('origin')
    }
    const body = req.body as Record<string, unknown> | undefined
    const q = req.query as Record<string, unknown> | undefined
    const sent =
      (typeof body?._csrf === 'string' && body._csrf) ||
      (typeof q?._csrf === 'string' && q._csrf) ||
      (typeof req.headers['x-csrf-token'] === 'string' && req.headers['x-csrf-token']) ||
      ''
    if (!sent || !safeEqual(sent, req.ctx.csrf)) {
      return reply.code(403).type('text/plain').send(req.ctx.t('err.csrf'))
    }
  })
}

function sameOrigin(origin: string, baseUrl: string, host: string | undefined): boolean {
  try {
    const o = new URL(origin)
    if (o.origin === new URL(baseUrl).origin) return true
    return !!host && o.host === host
  } catch {
    return false
  }
}

export function setFlash(reply: FastifyReply, deps: AppDeps, flash: Flash): void {
  reply.setCookie(FLASH_COOKIE, JSON.stringify(flash), { ...cookieOpts(deps, 60), signed: true })
}

export function sendHtml(reply: FastifyReply, page: SafeHtml, status = 200): FastifyReply {
  return reply.code(status).type('text/html; charset=utf-8').send('<!doctype html>' + page.value)
}

/** Sólo rutas internas relativas: evita redirecciones abiertas con ?next= */
export function safeNext(next: unknown, fallback = '/panel'): string {
  // los navegadores ignoran tabs/saltos y tratan \ como /: "/\t/evil.com" sería //evil.com
  if (typeof next !== 'string' || !next.startsWith('/') || /[\x00-\x20\x7f\\]/.test(next) || next.startsWith('//')) return fallback
  return next
}

export function requireUser(req: FastifyRequest, reply: FastifyReply): boolean {
  if (req.ctx.user) return true
  reply.redirect('/login?next=' + encodeURIComponent(req.url), 303)
  return false
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!requireUser(req, reply)) return false
  if (req.ctx.user?.role === 'admin' && !req.ctx.member) return true
  reply.code(404).type('text/plain').send('Not found')
  return false
}

/** Hook preHandler reutilizable para grupos de rutas */
export async function userGuard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!requireUser(req, reply)) return reply
}

export async function adminGuard(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!requireAdmin(req, reply)) return reply
}

/** ¿Trae una solución válida de la prueba de trabajo? (siempre true si está desactivada) */
export function powOk(deps: AppDeps, body: unknown): boolean {
  if (deps.config.powMax <= 0) return true
  const v = (body as Record<string, unknown> | undefined)?._pow
  return typeof v === 'string' && v.length < 2000 && verifySolution(deps.config.secret, v, deps.now())
}
