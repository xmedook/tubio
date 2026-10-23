import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { panelLayout } from '../../views/layout.ts'
import { csrfField, emptyState, input, postButton, select } from '../../views/ui.ts'
import { sendHtml, setFlash, userGuard, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { listLinks } from '../links/repo.ts'
import { limitsOf, ownerLimits } from '../plans/limits.ts'
import { audit } from '../settings/repo.ts'
import type { User } from '../users/repo.ts'
import { cfAddHostname, cfDeleteHostname, cfGetHostname, cfOn } from './cloudflare.ts'
import { getOwnDomain, listDomains, normalizeHost, refreshDomainCache, verifyDomain } from './repo.ts'

/** A dónde apuntan los clientes su CNAME (Cloudflare for SaaS; o Caddy con TLS bajo demanda) */
export const CNAME_TARGET = process.env.TUBIO_CNAME_TARGET ?? 'custom.tubio.link'

export function registerDomains(app: FastifyInstance, deps: AppDeps, resolver?: Parameters<typeof verifyDomain>[2]): void {
  const { db } = deps
  refreshDomainCache(db)
  const me = (req: FastifyRequest) => req.ctx.user as User

  function page(ctx: Ctx, user: User, error?: string, value = '', certs: Map<number, string> = new Map()) {
    const { t } = ctx
    const lim = limitsOf(db, user, deps.now())
    const list = listDomains(db, user.id)
    const pages = listLinks(db, user.id, { kind: 'bio', limit: 500 }).items
    return panelLayout(ctx, {
      title: t('domains.title'),
      active: 'links',
      path: '/panel/domains',
      body: html`<h1>${t('domains.title')}</h1>
${lim.custom_domains === 0
  ? emptyState(t('domains.locked'), html`<a class="btn btn-primary" href="/panel/plan">${t('plan.see_plans')}</a>`)
  : html`<p class="muted">${t('domains.intro', { n: lim.custom_domains })}</p>
${list.map((d) => html`<div class="card"><h2 class="mono">${d.host} <span class="tag${d.status === 'active' ? '' : ' tag-off'}">${t(`domains.status_${d.status}`)}</span></h2>
  ${d.status === 'pending'
    ? html`<p>${t('domains.howto')}</p>
      <table class="data"><thead><tr><th>${t('domains.type')}</th><th>${t('domains.name')}</th><th>${t('domains.value')}</th></tr></thead><tbody>
        <tr><td>CNAME</td><td class="mono">${d.host}</td><td class="mono">${CNAME_TARGET}</td></tr>
        <tr><td>TXT</td><td class="mono">_tubio.${d.host}</td><td class="mono">tubio-verify=${d.verify_token}</td></tr></tbody></table>
      <p class="hint">${t('domains.howto_hint')}</p>
      ${postButton(ctx, `/panel/domains/${d.id}/verify`, t('domains.verify'), { cls: 'btn btn-primary' })}`
    : html`<form method="post" action="/panel/domains/${d.id}/home" class="toolbar">${csrfField(ctx)}
      ${select({ ctx, name: 'home_link_id', label: t('domains.home'), value: d.home_link_id ?? '', options: [{ value: '', label: t('domains.home_none') }, ...pages.filter((p) => p.domain_id === d.id).map((p) => ({ value: String(p.id), label: p.title || p.alias }))] })}
      <button class="btn" type="submit">${t('common.save')}</button></form><p class="hint">${t('domains.home_hint')}</p>
      ${certs.has(d.id) ? html`<p class="${certs.get(d.id) === 'active' ? 'muted' : 'flash flash-info'}">${certs.get(d.id) === 'active' ? t('domains.cert_ok') : t('domains.cert_pending', { target: CNAME_TARGET })}</p>` : ''}`}
  ${postButton(ctx, `/panel/domains/${d.id}/delete`, t('common.delete'), { cls: 'btn btn-sm btn-danger', confirm: t('domains.delete_confirm') })}
</div>`)}
${list.length < lim.custom_domains || lim.custom_domains < 0
  ? html`<form class="card" method="post" action="/panel/domains" novalidate>${csrfField(ctx)}
    ${input({ ctx, name: 'host', label: t('domains.add'), value, error, required: true, placeholder: 'links.tumarca.com', hint: t('domains.add_hint') })}
    <button class="btn btn-primary" type="submit">${t('domains.add_btn')}</button></form>`
  : ''}`}`,
    })
  }

  app.get('/panel/domains', { preHandler: userGuard }, async (req, reply) => {
    // estado del certificado en Cloudflare (sólo de los activos, en paralelo y con tope de tiempo)
    const certs = new Map<number, string>()
    if (cfOn()) {
      const act = listDomains(db, me(req).id).filter((d) => d.status === 'active' && d.cf_id)
      await Promise.all(act.map(async (d) => {
        const h = await cfGetHostname(deps, d.cf_id as string)
        if (h) certs.set(d.id, h.ssl?.status === 'active' && h.status === 'active' ? 'active' : 'pending')
      }))
    }
    return sendHtml(reply, page(req.ctx, me(req), undefined, '', certs))
  })

  app.post('/panel/domains', { preHandler: userGuard }, async (req, reply) => {
    const user = me(req)
    const lim = limitsOf(db, user, deps.now()).custom_domains
    const raw = field(req.body, 'host')
    const host = normalizeHost(raw)
    const mainHost = new URL(deps.config.baseUrl).hostname
    if (!host || host === mainHost || host.endsWith(`.${mainHost}`)) return sendHtml(reply, page(req.ctx, user, 'err.domain', raw), 422)
    if (lim >= 0 && listDomains(db, user.id).length >= lim) return reply.redirect('/panel/plan', 303)
    if (db.prepare("SELECT 1 FROM domains WHERE host = ? AND (status = 'active' OR user_id = ?)").get(host, user.id)) return sendHtml(reply, page(req.ctx, user, 'err.domain_taken', raw), 422)
    db.prepare('INSERT INTO domains (user_id, host, verify_token, created_at) VALUES (?, ?, ?, ?)').run(user.id, host, randomBytes(12).toString('hex'), deps.now())
    audit(db, { actorId: user.id, userId: user.id, action: 'domain.add', target: host }, deps.now())
    return reply.redirect('/panel/domains', 303)
  })

  app.post('/panel/domains/:id/verify', { preHandler: userGuard, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const d = getOwnDomain(db, Number((req.params as { id: string }).id), me(req).id)
    if (!d) return reply.callNotFound()
    if (db.prepare("SELECT 1 FROM domains WHERE host = ? AND status = 'active' AND id != ?").get(d.host, d.id)) {
      setFlash(reply, deps, { type: 'error', key: 'err.domain_taken' })
    } else if (await verifyDomain(d, CNAME_TARGET, resolver)) {
      // Cloudflare for SaaS: alta del host para que emita el certificado y lo enrute
      let cfId: string | null = d.cf_id ?? null
      if (cfOn()) {
        try {
          cfId = (await cfAddHostname(deps, d.host)).id
        } catch (e) {
          req.log.error({ err: String(e), host: d.host }, 'cloudflare custom hostname')
          setFlash(reply, deps, { type: 'error', key: 'domains.cf_error' })
          return reply.redirect('/panel/domains', 303)
        }
      }
      db.prepare("UPDATE domains SET status = 'active', verified_at = ?, cf_id = ? WHERE id = ?").run(deps.now(), cfId, d.id)
      // los intentos pendientes de otras cuentas sobre el mismo host ya no sirven
      db.prepare("DELETE FROM domains WHERE host = ? AND status = 'pending' AND id != ?").run(d.host, d.id)
      refreshDomainCache(db)
      setFlash(reply, deps, { type: 'ok', key: 'domains.verified' })
    } else setFlash(reply, deps, { type: 'error', key: 'domains.not_yet' })
    return reply.redirect('/panel/domains', 303)
  })

  app.post('/panel/domains/:id/home', { preHandler: userGuard }, async (req, reply) => {
    const d = getOwnDomain(db, Number((req.params as { id: string }).id), me(req).id)
    if (!d) return reply.callNotFound()
    const lid = Number(field(req.body, 'home_link_id')) || null
    const ok = lid && db.prepare('SELECT 1 FROM links WHERE id = ? AND user_id = ? AND domain_id = ?').get(lid, me(req).id, d.id)
    db.prepare('UPDATE domains SET home_link_id = ? WHERE id = ?').run(ok ? lid : null, d.id)
    return reply.redirect('/panel/domains', 303)
  })

  app.post('/panel/domains/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    const d = getOwnDomain(db, Number((req.params as { id: string }).id), me(req).id)
    if (!d) return reply.callNotFound()
    // los enlaces de ese dominio vuelven al principal si su alias está libre; si no, quedan pausados
    for (const l of db.prepare('SELECT id, alias FROM links WHERE domain_id = ?').all(d.id) as { id: number; alias: string }[]) {
      const taken = db.prepare('SELECT 1 FROM links WHERE domain_id = 0 AND alias = ?').get(l.alias)
      if (taken) db.prepare("UPDATE links SET domain_id = 0, alias = alias || '-' || id, is_enabled = 0 WHERE id = ?").run(l.id)
      else db.prepare('UPDATE links SET domain_id = 0 WHERE id = ?').run(l.id)
    }
    db.prepare('DELETE FROM domains WHERE id = ?').run(d.id)
    refreshDomainCache(db)
    if (d.cf_id && cfOn()) await cfDeleteHostname(deps, d.cf_id)
    audit(db, { actorId: me(req).id, userId: me(req).id, action: 'domain.delete', target: d.host }, deps.now())
    return reply.redirect('/panel/domains', 303)
  })

  /** Caddy (on_demand_tls → ask) pregunta si emite certificado para un host. Sólo desde la máquina. */
  app.get('/_/caddy/ask', async (req, reply) => {
    // detrás del proxy público (nginx) todo llega desde 127.0.0.1: si trae cabeceras de reenvío, no es Caddy
    if (req.headers['x-forwarded-for'] || req.headers['x-real-ip']) return reply.code(403).send('no')
    const ip = req.socket.remoteAddress ?? ''
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) && !(process.env.TUBIO_CADDY_IPS ?? '').split(',').includes(ip)) return reply.code(403).send('no')
    const host = normalizeHost(String((req.query as { domain?: string }).domain ?? ''))
    const d = host ? (db.prepare("SELECT user_id FROM domains WHERE host = ? AND status = 'active'").get(host) as { user_id: number } | undefined) : undefined
    const ok = d && (ownerLimits(db, d.user_id, deps.now())?.custom_domains ?? 0) !== 0
    return reply.code(ok ? 200 : 404).send(ok ? 'ok' : 'no')
  })
}
