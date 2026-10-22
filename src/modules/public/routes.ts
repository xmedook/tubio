import { createReadStream, existsSync } from 'node:fs'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { verifyPassword } from '../../lib/crypto.ts'
import { html } from '../../lib/html.ts'
import { buildIcs, eventSchema } from '../../lib/ical.ts'
import { findFile, findFileByKey, uploadPath } from '../../lib/uploads.ts'
import { buildDestination, redirectAllowed } from '../../lib/urls.ts'
import { buildVCard, vcardFileName, vcardSchema } from '../../lib/vcard.ts'
import { authLayout, messagePage } from '../../views/layout.ts'
import { csrfField, input } from '../../views/ui.ts'
import { cookieOpts, sendHtml, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { renderBioPage } from '../bio/render.ts'
import { findByAlias, incrementClicks, type Link } from '../links/repo.ts'
import { recordEvent, visitFromRequest } from '../stats/record.ts'
import { availability, isConfirmed, isUnlocked, okCookie, okValue, unlockCookie, unlockValue } from './gate.ts'

/** Tipos que el navegador podría ejecutar: siempre se descargan como binario */
const UNSAFE_INLINE = /^(text\/html|image\/svg|application\/xhtml|text\/xml|application\/xml|application\/javascript|text\/javascript)/

function gatePage(ctx: Ctx, link: Link, mode: 'password' | 'sensitive', error?: string) {
  const { t } = ctx
  const title = link.title || link.alias
  return authLayout(ctx, {
    title: mode === 'password' ? t('public.protected') : t('public.sensitive_title'),
    path: `/${link.alias}`,
    body:
      mode === 'password'
        ? html`<h1>${t('public.protected')}</h1>
<p>${t('public.protected_body', { title })}</p>
<form method="post" action="/${link.alias}" novalidate>
  ${csrfField(ctx)}<input type="hidden" name="_action" value="password">
  ${input({ ctx, name: 'password', type: 'password', label: t('auth.password'), error, required: true, autocomplete: 'off', autofocus: true })}
  <button class="btn btn-primary btn-block" type="submit">${t('public.unlock')}</button>
</form>`
        : html`<h1>${t('public.sensitive_title')}</h1>
<p>${t('public.sensitive_body')}</p>
<form method="post" action="/${link.alias}">
  ${csrfField(ctx)}<input type="hidden" name="_action" value="confirm">
  <button class="btn btn-primary btn-block" type="submit">${t('public.sensitive_continue')}</button>
</form>
<p class="auth-alt"><a href="/">${t('public.sensitive_back')}</a></p>
<p class="auth-alt"><a href="/_/report/${link.alias}" rel="nofollow">${t('abuse.link')}</a></p>`,
  })
}

function unavailable(ctx: Ctx, reply: FastifyReply, kind: 'expired' | 'limit' | 'missing') {
  const { t } = ctx
  const msg = kind === 'expired' ? t('public.expired') : kind === 'limit' ? t('public.limit') : t('err.404_body')
  return sendHtml(reply, messagePage(ctx, { title: kind === 'missing' ? t('err.404_title') : t('public.unavailable'), message: msg }), 404)
}

export function registerPublic(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  // imágenes re-codificadas (avatar, bloques, fondo, logo de QR)
  app.get('/_/u/:key', async (req, reply) => {
    const { key } = req.params as { key: string }
    const f = /^[\w-]+\.webp$/.test(key) ? findFileByKey(deps, key) : undefined
    if (!f || f.kind !== 'image') return reply.callNotFound()
    const p = uploadPath(deps, f.key)
    if (!existsSync(p)) return reply.callNotFound()
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    reply.header('Content-Security-Policy', "default-src 'none'")
    return reply.type('image/webp').send(createReadStream(p))
  })

  /** Revisa estado, programación, tope, contraseña y aviso. Devuelve null si ya respondió. */
  /** Revisa estado, programación, tope, contraseña y aviso. Devuelve false si ya respondió. */
  async function gate(req: FastifyRequest, reply: FastifyReply, link: Link): Promise<boolean> {
    const av = availability(deps, link)
    if (av === 'expired' && link.expired_url && redirectAllowed(db, link.expired_url)) {
      reply.redirect(link.expired_url, 302)
      return false
    }
    if (av === 'limit' && link.limit_url && redirectAllowed(db, link.limit_url)) {
      reply.redirect(link.limit_url, 302)
      return false
    }
    if (av !== 'ok') {
      unavailable(req.ctx, reply, av)
      return false
    }
    if (!isUnlocked(deps, req, link)) {
      sendHtml(reply, gatePage(req.ctx, link, 'password'), 401)
      return false
    }
    if (!isConfirmed(deps, req, link)) {
      sendHtml(reply, gatePage(req.ctx, link, 'sensitive'))
      return false
    }
    return true
  }

  /** hits cuenta toda entrega (para el tope); clicks y estadísticas sólo humanos */
  function count(req: FastifyRequest, link: Link): void {
    const preview = (req.query as Record<string, unknown>)._preview === '1' && req.ctx.user?.id === link.user_id
    if (preview) return
    const human = recordEvent(deps, visitFromRequest(req), { linkId: link.id, kind: 'view' })
    incrementClicks(db, link.id, human)
  }

  app.get('/:alias', async (req, reply) => {
    const { alias } = req.params as { alias: string }
    const link = findByAlias(db, alias)
    if (!link) return reply.callNotFound()
    if (!(await gate(req, reply, link))) return reply
    reply.header('Cache-Control', 'private, no-store')
    reply.header('X-Robots-Tag', link.kind === 'bio' ? (readNoindex(link) ? 'noindex' : 'all') : 'noindex')

    switch (link.kind) {
      case 'short': {
        count(req, link)
        const forward = link.forward_query ? (req.query as Record<string, unknown>) : null
        const dest = redirectAllowed(db, buildDestination(link.target_url ?? '', link.utm, forward))
        if (!dest) return unavailable(req.ctx, reply, 'missing')
        return reply.redirect(dest, link.redirect_code)
      }
      case 'bio': {
        count(req, link)
        return renderBioPage(deps, req, reply, link)
      }
      case 'vcard': {
        count(req, link)
        const d = vcardSchema.parse(link.data)
        reply.header('Content-Disposition', `attachment; filename="${vcardFileName(d)}"`)
        return reply.type('text/vcard; charset=utf-8').send(buildVCard(d))
      }
      case 'event': {
        const r = eventSchema.safeParse(link.data)
        if (!r.success) return reply.callNotFound()
        count(req, link)
        reply.header('Content-Disposition', `attachment; filename="${link.alias}.ics"`)
        return reply.type('text/calendar; charset=utf-8').send(buildIcs(r.data, `link-${link.id}@tubio`, deps.now()))
      }
      case 'file': {
        const f = findFile(deps, Number(link.data.file_id))
        const p = f ? uploadPath(deps, f.key) : ''
        if (!f || !existsSync(p)) return reply.callNotFound()
        count(req, link)
        const mime = UNSAFE_INLINE.test(f.mime) ? 'application/octet-stream' : f.mime
        const ascii = f.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
        reply.header('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.original_name)}`)
        reply.header('Content-Length', String(f.size))
        reply.header('Content-Security-Policy', "default-src 'none'; sandbox")
        return reply.type(mime).send(createReadStream(p))
      }
    }
  })

  app.post('/:alias', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { alias } = req.params as { alias: string }
    const link = findByAlias(db, alias)
    if (!link) return reply.callNotFound()
    const action = field(req.body, '_action')
    if (action === 'password' && link.password_hash) {
      if (!(await verifyPassword(field(req.body, 'password'), link.password_hash))) {
        return sendHtml(reply, gatePage(req.ctx, link, 'password', 'err.password_wrong'), 401)
      }
      reply.setCookie(unlockCookie(link), unlockValue(deps, link), cookieOpts(deps))
    } else if (action === 'confirm' && link.is_sensitive) {
      reply.setCookie(okCookie(link), okValue(deps, link), cookieOpts(deps, 30 * 86400))
    }
    return reply.redirect(`/${link.alias}`, 303)
  })
}

function readNoindex(link: Link): boolean {
  return link.data.noindex === true || !!link.password_hash || !!link.is_sensitive
}
