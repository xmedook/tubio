import cookie from '@fastify/cookie'
import formbody from '@fastify/formbody'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseQs } from 'node:querystring'
import type { Config } from './config.ts'
import type { DB } from './db/index.ts'
import type { Geo } from './lib/geo.ts'
import type { Mailer } from './lib/mail.ts'
import { messagePage } from './views/layout.ts'
import { registerContext, sendHtml } from './web/context.ts'
import { registerModules } from './modules/index.ts'

export type AppDeps = {
  config: Config
  db: DB
  mailer: Mailer
  geo: Geo
  now: () => number
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export const PANEL_CSP =
  "default-src 'self'; script-src 'self' 'nonce-{n}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'"

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      deps.config.env === 'test'
        ? false
        : {
            level: deps.config.env === 'production' ? 'info' : 'debug',
            // el token CSRF de formularios multipart viaja en la query: no debe quedar en bitácoras
            serializers: {
              req: (r: { method: string; url: string; ip?: string }) => ({ method: r.method, url: r.url.replace(/([?&]_csrf=)[^&]*/, '$1…'), ip: r.ip }),
            },
          },
    trustProxy: deps.config.trustProxy,
    bodyLimit: 1024 * 1024,
  })

  await app.register(cookie, { secret: deps.config.secret })
  // formbody con querystring de Node: campos repetidos llegan como arreglo
  await app.register(formbody, { parser: (s) => parseQs(s) })
  await app.register(multipart, { limits: { fileSize: deps.config.maxUploadBytes, files: 2, fields: 50 } })
  await app.register(rateLimit, { global: false })
  await app.register(fastifyStatic, {
    root: join(ROOT, 'public'),
    prefix: '/_/static/',
    maxAge: deps.config.env === 'production' ? '7d' : 0,
  })
  await app.register(fastifyStatic, {
    root: join(ROOT, 'node_modules/sortablejs'),
    prefix: '/_/static/vendor/sortablejs/',
    decorateReply: false,
    allowedPath: (p) => p === '/Sortable.min.js',
  })

  registerContext(app, deps)

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    if (!reply.hasHeader('Referrer-Policy')) reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    if (!reply.hasHeader('X-Frame-Options')) reply.header('X-Frame-Options', 'DENY')
    const type = String(reply.getHeader('content-type') ?? '')
    if (type.startsWith('text/html') && !reply.hasHeader('Content-Security-Policy')) {
      reply.header('Content-Security-Policy', PANEL_CSP.replace('{n}', req.ctx?.nonce ?? ''))
    }
    return payload
  })

  app.get('/healthz', async () => ({ ok: true }))

  registerModules(app, deps)

  app.setNotFoundHandler((req, reply) => {
    const t = req.ctx?.t
    if (!t) return reply.code(404).send('Not found')
    return sendHtml(reply, messagePage(req.ctx, { title: t('err.404_title'), message: t('err.404_body') }), 404)
  })

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500
    if (status >= 500) req.log.error(err)
    const t = req.ctx?.t
    if (!t) return reply.code(status).send('Error')
    const title = status === 429 ? t('err.429_title') : status === 413 ? t('err.413_title') : status >= 500 ? t('err.500_title') : t('err.400_title')
    return sendHtml(reply, messagePage(req.ctx, { title, message: status >= 500 ? t('err.500_body') : err.message }), status)
  })

  return app
}
