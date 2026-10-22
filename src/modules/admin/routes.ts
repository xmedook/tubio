import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html, type SafeHtml } from '../../lib/html.ts'
import { formatDateTime, formatNumber } from '../../lib/i18n.ts'
import { deleteUserFiles } from '../../lib/uploads.ts'
import { jobStatus } from '../../jobs.ts'
import { panelLayout } from '../../views/layout.ts'
import { checkbox, csrfField, emptyState, input, postButton } from '../../views/ui.ts'
import { adminGuard, sendHtml, setFlash, type Ctx } from '../../web/context.ts'
import { checked, field } from '../../web/forms.ts'
import { startSession } from '../auth/routes.ts'
import { destroyUserSessions } from '../auth/sessions.ts'
import { getLink, linkUrl, updateLink, type Link } from '../links/repo.ts'
import { kindLabel } from '../links/views.ts'
import { audit, getSettings, setSetting } from '../settings/repo.ts'
import { deleteUser, findUserById, searchUsers, updateUser, type User } from '../users/repo.ts'

function adminNav(ctx: Ctx, active: string): SafeHtml {
  const { t } = ctx
  const items: [string, string, string][] = [
    ['home', '/admin', t('admin.overview')],
    ['users', '/admin/users', t('admin.users')],
    ['links', '/admin/links', t('nav.links')],
    ['hosts', '/admin/blocked-hosts', t('admin.blocked_hosts')],
    ['settings', '/admin/settings', t('admin.settings')],
  ]
  return html`<nav class="tabs" aria-label="${t('nav.admin')}">${items.map(([k, href, label]) => html`<a href="${href}"${k === active ? html` aria-current="page"` : ''}>${label}</a>`)}</nav>`
}

function page(ctx: Ctx, active: string, title: string, body: SafeHtml, path: string) {
  return panelLayout(ctx, { title, active: 'admin', path, wide: true, body: html`<h1>${ctx.t('nav.admin')}</h1>${adminNav(ctx, active)}${body}` })
}

export function registerAdmin(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const me = (req: FastifyRequest) => req.ctx.user as User
  const tz = (req: FastifyRequest) => me(req).timezone
  const when = (req: FastifyRequest, ts: number | null) => (ts ? formatDateTime(req.ctx.locale, ts, tz(req)) : '—')

  app.get('/admin', { preHandler: adminGuard }, async (req, reply) => {
    const { t, locale } = req.ctx
    const n = (sql: string, ...p: unknown[]) => db.prepare(sql).pluck().get(...p) as number
    const since = deps.now() - 30 * 86400_000
    const kinds = db.prepare('SELECT kind, COUNT(*) AS n FROM links GROUP BY kind').all() as { kind: Link['kind']; n: number }[]
    const log = db.prepare('SELECT a.*, u.email AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 25').all() as { id: number; action: string; target: string; actor: string | null; ts: number; user_id: number | null }[]
    const kpi = (v: number, label: string) => html`<div class="kpi"><span class="kpi-n">${formatNumber(locale, v)}</span><span class="kpi-l">${label}</span></div>`
    const js = jobStatus()
    return sendHtml(reply, page(req.ctx, 'home', t('admin.overview'), html`
<div class="kpis">
  ${kpi(n('SELECT COUNT(*) FROM users'), t('admin.users'))}
  ${kpi(n('SELECT COUNT(*) FROM users WHERE created_at >= ?', since), t('admin.new_users_30d'))}
  ${kpi(n('SELECT COUNT(*) FROM links'), t('nav.links'))}
  ${kpi(n('SELECT COUNT(*) FROM qr_codes'), t('nav.qr'))}
  ${kpi(n('SELECT COUNT(*) FROM stat_events WHERE ts >= ?', since), t('admin.events_30d'))}
  ${kpi(Math.round(n('SELECT COALESCE(SUM(size), 0) FROM files') / 1048576), t('admin.storage_mb'))}
</div>
<div class="stat-grid">
  <section class="card"><h2 class="h3">${t('admin.links_by_kind')}</h2><table class="data"><tbody>${kinds.map((k) => html`<tr><td>${kindLabel(req.ctx, k.kind)}</td><td class="num">${formatNumber(locale, k.n)}</td></tr>`)}</tbody></table></section>
  <section class="card"><h2 class="h3">${t('admin.jobs')}</h2>${js.at
    ? html`<p>${t('admin.jobs_last', { when: when(req, js.at) })}</p>${js.error ? html`<p class="error">${js.error}</p>` : html`<p class="mono small">${JSON.stringify(js.result)}</p>`}`
    : html`<p class="muted">${t('admin.jobs_never')}</p>`}</section>
</div>
<section class="card"><h2 class="h3">${t('admin.audit')}</h2><div class="table-scroll"><table class="data"><thead><tr><th>${t('admin.when')}</th><th>${t('admin.who')}</th><th>${t('admin.action')}</th><th>${t('admin.target')}</th></tr></thead><tbody>
${log.map((l) => html`<tr><td class="nowrap">${when(req, l.ts)}</td><td>${l.actor ?? (l.user_id ? `#${l.user_id}` : '—')}</td><td class="mono">${l.action}</td><td class="mono">${l.target}</td></tr>`)}
</tbody></table></div></section>`, '/admin'))
  })

  app.get('/admin/users', { preHandler: adminGuard }, async (req, reply) => {
    const { t } = req.ctx
    const q = String((req.query as { q?: string }).q ?? '').trim().slice(0, 100)
    const users = searchUsers(db, q, 100)
    return sendHtml(reply, page(req.ctx, 'users', t('admin.users'), html`
<form class="toolbar" method="get" action="/admin/users" role="search">${input({ ctx: req.ctx, name: 'q', type: 'search', label: t('admin.search_users'), value: q })}<button class="btn" type="submit">${t('links.filter')}</button></form>
${users.length === 0 ? emptyState(t('admin.no_users'), '') : html`<ul class="list">${users.map((u) => html`<li>
  <div class="grow"><div class="title"><a href="/admin/users/${u.id}">${u.email}</a>
    ${u.role === 'admin' ? html` <span class="tag">admin</span>` : ''}${u.status === 'suspended' ? html` <span class="tag tag-off">${t('admin.suspended')}</span>` : ''}${u.is_verified ? html` <span class="tag">✓ ${t('bio.verified')}</span>` : ''}</div>
    <div class="sub">${u.name || '—'} · ${t('admin.joined', { when: when(req, u.created_at) })}${u.email_verified_at ? '' : html` · ${t('account.email_unverified').split('.')[0]}`}</div></div>
  <a class="btn btn-sm" href="/admin/users/${u.id}">${t('common.edit')}</a></li>`)}</ul>`}`, '/admin/users'))
  })

  function targetUser(req: FastifyRequest, reply: FastifyReply): User | null {
    const u = findUserById(db, Number((req.params as { id: string }).id))
    if (!u) {
      reply.callNotFound()
      return null
    }
    return u
  }

  app.get('/admin/users/:id', { preHandler: adminGuard }, async (req, reply) => {
    const u = targetUser(req, reply)
    if (!u) return
    const { t, locale } = req.ctx
    const ctx = req.ctx
    const links = db.prepare('SELECT * FROM links WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(u.id) as Link[]
    const self = u.id === me(req).id
    return sendHtml(reply, page(ctx, 'users', u.email, html`
<div class="card"><h2>${u.email}</h2>
  <p class="muted">${u.name || '—'} · ${t('admin.joined', { when: when(req, u.created_at) })} · ${u.locale} · ${u.timezone}${u.totp_enabled_at ? ' · 2FA' : ''}</p>
  <form method="post" action="/admin/users/${u.id}" novalidate>
    ${csrfField(ctx)}
    ${checkbox({ name: 'is_verified', label: t('admin.badge'), checked: !!u.is_verified, hint: t('admin.badge_hint') })}
    ${checkbox({ name: 'email_verified', label: t('admin.email_verified'), checked: !!u.email_verified_at })}
    ${self ? '' : checkbox({ name: 'is_admin', label: t('admin.is_admin'), checked: u.role === 'admin' })}
    ${self ? '' : checkbox({ name: 'suspended', label: t('admin.suspend'), checked: u.status === 'suspended', hint: t('admin.suspend_hint') })}
    <button class="btn btn-primary" type="submit">${t('common.save')}</button>
  </form>
</div>
${self ? '' : html`<div class="card"><h3>${t('admin.impersonate')}</h3><p class="muted">${t('admin.impersonate_hint')}</p>${postButton(ctx, `/admin/users/${u.id}/impersonate`, t('admin.impersonate'), { cls: 'btn' })}</div>`}
<section class="card"><h3>${t('nav.links')} (${formatNumber(locale, links.length)})</h3>${links.length === 0 ? html`<p class="muted">${t('links.empty')}</p>` : html`<table class="data"><tbody>${links.map((l) => html`<tr><td><a href="${linkUrl(ctx.baseUrl, l)}" target="_blank" rel="noopener">/${l.alias}</a> <span class="tag">${kindLabel(ctx, l.kind)}</span>${l.is_enabled ? '' : html` <span class="tag tag-off">${t('links.disabled')}</span>`}</td><td class="num">${formatNumber(locale, l.clicks)}</td></tr>`)}</tbody></table>`}</section>
${self ? '' : html`<div class="card danger-zone"><h3>${t('admin.delete_user')}</h3>${postButton(ctx, `/admin/users/${u.id}/delete`, t('admin.delete_user'), { cls: 'btn btn-danger', confirm: t('admin.delete_user_confirm', { email: u.email }) })}</div>`}`, `/admin/users/${u.id}`))
  })

  app.post('/admin/users/:id', { preHandler: adminGuard }, async (req, reply) => {
    const u = targetUser(req, reply)
    if (!u) return
    const self = u.id === me(req).id
    const now = deps.now()
    const suspended = !self && checked(req.body, 'suspended')
    updateUser(db, u.id, {
      is_verified: checked(req.body, 'is_verified') ? 1 : 0,
      email_verified_at: checked(req.body, 'email_verified') ? (u.email_verified_at ?? now) : null,
      ...(self ? {} : { role: checked(req.body, 'is_admin') ? 'admin' : 'user', status: suspended ? 'suspended' : 'active' }),
    }, now)
    if (suspended && u.status !== 'suspended') destroyUserSessions(db, u.id)
    audit(db, { actorId: me(req).id, userId: u.id, action: 'admin.user_update', target: `user:${u.id}`, meta: { suspended, verified: checked(req.body, 'is_verified') } }, now)
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect(`/admin/users/${u.id}`, 303)
  })

  app.post('/admin/users/:id/delete', { preHandler: adminGuard }, async (req, reply) => {
    const u = targetUser(req, reply)
    if (!u) return
    if (u.id === me(req).id) return reply.code(400).send('self')
    deleteUserFiles(deps, u.id)
    deleteUser(db, u.id)
    audit(db, { actorId: me(req).id, userId: u.id, action: 'admin.user_delete', target: `user:${u.id}`, meta: { email: u.email } }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'admin.user_deleted' })
    return reply.redirect('/admin/users', 303)
  })

  app.post('/admin/users/:id/impersonate', { preHandler: adminGuard }, async (req, reply) => {
    const u = targetUser(req, reply)
    if (!u) return
    const admin = me(req)
    if (u.id === admin.id) return reply.redirect('/panel', 303)
    startSession(req, reply, deps, u.id, false, admin.id)
    audit(db, { actorId: admin.id, userId: u.id, action: 'admin.impersonate', target: `user:${u.id}` }, deps.now())
    return reply.redirect('/panel', 303)
  })

  // se llama estando "dentro" de otra cuenta: no pasa por adminGuard
  app.post('/admin/stop-impersonating', async (req, reply) => {
    const adminId = req.ctx.session?.impersonator_id
    const admin = adminId ? findUserById(db, adminId) : undefined
    if (!admin || admin.role !== 'admin' || admin.status !== 'active') return reply.redirect('/login', 303)
    const target = req.ctx.session?.user_id
    startSession(req, reply, deps, admin.id)
    return reply.redirect(target ? `/admin/users/${target}` : '/admin', 303)
  })

  app.get('/admin/links', { preHandler: adminGuard }, async (req, reply) => {
    const { t, locale } = req.ctx
    const q = String((req.query as { q?: string }).q ?? '').trim().slice(0, 100)
    const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`
    const rows = db
      .prepare(`SELECT l.*, u.email AS owner FROM links l JOIN users u ON u.id = l.user_id
        WHERE l.alias LIKE ? ESCAPE '\\' OR l.target_url LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' ORDER BY l.created_at DESC LIMIT 100`)
      .all(like, like, like) as (Link & { owner: string })[]
    return sendHtml(reply, page(req.ctx, 'links', t('nav.links'), html`
<form class="toolbar" method="get" action="/admin/links" role="search">${input({ ctx: req.ctx, name: 'q', type: 'search', label: t('admin.search_links'), value: q })}<button class="btn" type="submit">${t('links.filter')}</button></form>
<div class="table-scroll"><table class="data"><thead><tr><th>${t('links.alias')}</th><th>${t('admin.owner')}</th><th>${t('links.kind')}</th><th>${t('links.target_url')}</th><th class="num">${t('links.clicks')}</th><th></th></tr></thead><tbody>
${rows.map((l) => html`<tr><td><a href="${linkUrl(req.ctx.baseUrl, l)}" target="_blank" rel="noopener">/${l.alias}</a>${l.is_enabled ? '' : html` <span class="tag tag-off">${t('links.disabled')}</span>`}</td>
  <td><a href="/admin/users/${l.user_id}">${l.owner}</a></td><td>${kindLabel(req.ctx, l.kind)}</td><td class="mono small">${l.target_url ?? ''}</td><td class="num">${formatNumber(locale, l.clicks)}</td>
  <td>${postButton(req.ctx, `/admin/links/${l.id}/toggle`, l.is_enabled ? t('admin.disable') : t('admin.enable'), { cls: 'btn btn-sm' })}</td></tr>`)}
</tbody></table></div>`, '/admin/links'))
  })

  app.post('/admin/links/:id/toggle', { preHandler: adminGuard }, async (req, reply) => {
    const l = getLink(db, Number((req.params as { id: string }).id))
    if (!l) return reply.callNotFound()
    updateLink(db, l.id, { is_enabled: !l.is_enabled }, deps.now())
    audit(db, { actorId: me(req).id, userId: l.user_id, action: l.is_enabled ? 'admin.link_disable' : 'admin.link_enable', target: `link:${l.id}`, meta: { alias: l.alias } }, deps.now())
    return reply.redirect('/admin/links', 303)
  })

  app.get('/admin/blocked-hosts', { preHandler: adminGuard }, async (req, reply) => {
    const { t } = req.ctx
    const ctx = req.ctx
    const hosts = db.prepare('SELECT * FROM blocked_hosts ORDER BY host').all() as { host: string; reason: string; created_at: number }[]
    return sendHtml(reply, page(ctx, 'hosts', t('admin.blocked_hosts'), html`
<p class="muted">${t('admin.blocked_hint')}</p>
<form class="card" method="post" action="/admin/blocked-hosts" novalidate>${csrfField(ctx)}
  <div class="grid-2">${input({ ctx, name: 'host', label: t('admin.host'), required: true, placeholder: 'ejemplo.com' })}${input({ ctx, name: 'reason', label: t('admin.reason'), maxlength: 200 })}</div>
  <button class="btn btn-primary" type="submit">${t('admin.block')}</button></form>
${hosts.length === 0 ? emptyState(t('admin.no_blocked'), '') : html`<ul class="list">${hosts.map((h) => html`<li><div class="grow"><div class="title mono">${h.host}</div><div class="sub">${h.reason}</div></div>
  ${postButton(ctx, '/admin/blocked-hosts/delete', t('admin.unblock'), { cls: 'btn btn-sm', hidden: { host: h.host } })}</li>`)}</ul>`}`, '/admin/blocked-hosts'))
  })

  app.post('/admin/blocked-hosts', { preHandler: adminGuard }, async (req, reply) => {
    let host = field(req.body, 'host').trim().toLowerCase()
    try {
      host = new URL(/^https?:\/\//.test(host) ? host : `https://${host}`).hostname.replace(/^www\./, '')
    } catch {
      host = ''
    }
    if (!host || !host.includes('.')) {
      setFlash(reply, deps, { type: 'error', key: 'err.url_host' })
      return reply.redirect('/admin/blocked-hosts', 303)
    }
    db.prepare('INSERT OR REPLACE INTO blocked_hosts (host, reason, created_at) VALUES (?, ?, ?)').run(host, field(req.body, 'reason').slice(0, 200), deps.now())
    audit(db, { actorId: me(req).id, action: 'admin.host_block', target: host }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect('/admin/blocked-hosts', 303)
  })

  app.post('/admin/blocked-hosts/delete', { preHandler: adminGuard }, async (req, reply) => {
    db.prepare('DELETE FROM blocked_hosts WHERE host = ?').run(field(req.body, 'host'))
    audit(db, { actorId: me(req).id, action: 'admin.host_unblock', target: field(req.body, 'host') }, deps.now())
    return reply.redirect('/admin/blocked-hosts', 303)
  })

  app.get('/admin/settings', { preHandler: adminGuard }, async (req, reply) => {
    const { t } = req.ctx
    const ctx = req.ctx
    const s = getSettings(db)
    return sendHtml(reply, page(ctx, 'settings', t('admin.settings'), html`
<form class="card" method="post" action="/admin/settings" novalidate>${csrfField(ctx)}
  ${input({ ctx, name: 'site_name', label: t('admin.site_name'), value: s.site_name, maxlength: 60 })}
  ${input({ ctx, name: 'stats_retention_days', type: 'number', label: t('admin.retention'), value: s.stats_retention_days, min: 7, max: 3650, hint: t('admin.retention_hint') })}
  ${input({ ctx, name: 'upload_quota_mb', type: 'number', label: t('admin.upload_quota'), value: s.upload_quota_mb, min: 1, max: 100000 })}
  ${checkbox({ name: 'registration_open', label: t('admin.registration_open'), checked: s.registration_open })}
  ${checkbox({ name: 'branding_forced', label: t('admin.branding_forced'), checked: s.branding_forced, hint: t('admin.branding_forced_hint') })}
  <button class="btn btn-primary" type="submit">${t('common.save')}</button>
</form>`, '/admin/settings'))
  })

  app.post('/admin/settings', { preHandler: adminGuard }, async (req, reply) => {
    const b = req.body
    const name = field(b, 'site_name').trim().slice(0, 60)
    if (name) setSetting(db, 'site_name', name)
    const days = Number(field(b, 'stats_retention_days'))
    if (Number.isInteger(days) && days >= 7 && days <= 3650) setSetting(db, 'stats_retention_days', days)
    const quota = Number(field(b, 'upload_quota_mb'))
    if (Number.isInteger(quota) && quota >= 1 && quota <= 100000) setSetting(db, 'upload_quota_mb', quota)
    setSetting(db, 'registration_open', checked(b, 'registration_open'))
    setSetting(db, 'branding_forced', checked(b, 'branding_forced'))
    audit(db, { actorId: me(req).id, action: 'admin.settings' }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect('/admin/settings', 303)
  })
}
