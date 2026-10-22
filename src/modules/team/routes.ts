import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { randomToken, sha256 } from '../../lib/crypto.ts'
import { html } from '../../lib/html.ts'
import { translator, type Locale } from '../../lib/i18n.ts'
import { messagePage, panelLayout } from '../../views/layout.ts'
import { csrfField, emptyState, input, postButton, select } from '../../views/ui.ts'
import { sendHtml, setFlash, userGuard, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { limitsOf } from '../plans/limits.ts'
import { audit } from '../settings/repo.ts'
import { findUserByEmail, findUserById, normalizeEmail, type User } from '../users/repo.ts'

const ROLES = ['viewer', 'editor', 'admin'] as const
type Member = { id: number; owner_id: number; user_id: number | null; email: string; role: (typeof ROLES)[number]; invited_at: number; accepted_at: number | null }

export function registerTeam(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const me = (req: FastifyRequest) => req.ctx.user as User

  function page(ctx: Ctx, user: User, error?: string) {
    const { t } = ctx
    const lim = limitsOf(db, user, deps.now())
    const members = db.prepare('SELECT * FROM team_members WHERE owner_id = ? ORDER BY invited_at').all(user.id) as Member[]
    const spaces = db.prepare('SELECT m.role, u.id, u.email, u.name FROM team_members m JOIN users u ON u.id = m.owner_id WHERE m.user_id = ? AND m.accepted_at IS NOT NULL').all(user.id) as { role: string; id: number; email: string; name: string }[]
    const current = (ctx.session as { workspace_id?: number | null } | null)?.workspace_id ?? null
    return panelLayout(ctx, {
      title: t('team.title'),
      active: 'account',
      path: '/panel/team',
      body: html`<h1>${t('team.title')}</h1>
${spaces.length ? html`<section class="card"><h2>${t('team.spaces')}</h2><ul class="list">
  <li><div class="grow"><div class="title">${t('team.my_space')}</div></div>${current ? postButton(ctx, '/panel/workspace/personal', t('team.switch'), { cls: 'btn btn-sm' }) : html`<span class="tag">${t('team.current')}</span>`}</li>
  ${spaces.map((s) => html`<li><div class="grow"><div class="title">${s.name || s.email}</div><div class="sub">${t(`team.role_${s.role}`)}</div></div>${current === s.id ? html`<span class="tag">${t('team.current')}</span>` : postButton(ctx, `/panel/workspace/${s.id}`, t('team.switch'), { cls: 'btn btn-sm btn-primary' })}</li>`)}
</ul></section>` : ''}
<section class="card"><h2>${t('team.my_team')}</h2>
${lim.team_members === 0
  ? html`<p class="muted">${t('team.locked')} <a href="/panel/plan">${t('plan.see_plans')}</a></p>`
  : html`<p class="muted">${t('team.intro', { n: lim.team_members })}</p>
  ${members.length ? html`<ul class="list">${members.map((m) => html`<li><div class="grow"><div class="title">${m.email}</div><div class="sub">${m.accepted_at ? t(`team.role_${m.role}`) : t('team.pending')}</div></div>
    <form method="post" action="/panel/team/${m.id}/role" class="inline btn-row">${csrfField(ctx)}<select name="role" aria-label="${t('team.role')}" class="inline-input">${ROLES.map((r) => html`<option value="${r}"${r === m.role ? html` selected` : ''}>${t(`team.role_${r}`)}</option>`)}</select><button class="btn btn-sm" type="submit">${t('common.save')}</button></form>
    ${postButton(ctx, `/panel/team/${m.id}/remove`, t('team.remove'), { cls: 'btn btn-sm btn-danger', confirm: t('team.remove_confirm') })}</li>`)}</ul>` : emptyState(t('team.empty'), '')}
  ${members.length < lim.team_members || lim.team_members < 0
    ? html`<form method="post" action="/panel/team" novalidate class="toolbar">${csrfField(ctx)}
      ${input({ ctx, name: 'email', type: 'email', label: t('auth.email'), error, required: true })}
      ${select({ ctx, name: 'role', label: t('team.role'), value: 'editor', options: ROLES.map((r) => ({ value: r, label: t(`team.role_${r}`) })) })}
      <button class="btn btn-primary" type="submit">${t('team.invite')}</button></form>
      <p class="hint">${t('team.roles_hint')}</p>`
    : ''}`}
</section>`,
    })
  }

  app.get('/panel/team', { preHandler: userGuard }, async (req, reply) => sendHtml(reply, page(req.ctx, me(req))))

  app.post('/panel/team', { preHandler: userGuard, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const user = me(req)
    const lim = limitsOf(db, user, deps.now()).team_members
    const count = db.prepare('SELECT COUNT(*) FROM team_members WHERE owner_id = ?').pluck().get(user.id) as number
    if (lim === 0 || (lim > 0 && count >= lim)) return reply.redirect('/panel/plan', 303)
    const email = normalizeEmail(field(req.body, 'email'))
    const role = (ROLES as readonly string[]).includes(field(req.body, 'role')) ? field(req.body, 'role') : 'editor'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === user.email) return sendHtml(reply, page(req.ctx, user, 'err.email'), 422)
    if (db.prepare('SELECT 1 FROM team_members WHERE owner_id = ? AND email = ?').get(user.id, email)) return sendHtml(reply, page(req.ctx, user, 'err.team_dup'), 422)
    const token = randomToken()
    db.prepare('INSERT INTO team_members (owner_id, email, role, token_hash, invited_at) VALUES (?, ?, ?, ?, ?)').run(user.id, email, role, sha256(token), deps.now())
    const invitee = findUserByEmail(db, email)
    const t = translator((invitee?.locale ?? user.locale) as Locale)
    await deps.mailer.send({ to: email, subject: t('mail.team_subject', { who: user.name || user.email }), text: t('mail.team_body', { who: user.name || user.email, link: `${deps.config.baseUrl}/panel/team/accept/${token}` }), button: t('team.accept') })
    audit(db, { actorId: user.id, userId: user.id, action: 'team.invite', target: email, meta: { role } }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'team.invited' })
    return reply.redirect('/panel/team', 303)
  })

  app.get('/panel/team/accept/:token', { preHandler: userGuard }, async (req, reply) => {
    const user = me(req)
    const { t } = req.ctx
    const m = db.prepare('SELECT * FROM team_members WHERE token_hash = ?').get(sha256((req.params as { token: string }).token)) as Member | undefined
    if (!m || m.email !== user.email) return sendHtml(reply, messagePage(req.ctx, { title: t('team.title'), message: t('team.invalid_invite') }), 400)
    if (!user.email_verified_at) return sendHtml(reply, messagePage(req.ctx, { title: t('team.title'), message: t('team.verify_first') }), 400)
    db.prepare('UPDATE team_members SET user_id = ?, accepted_at = ? WHERE id = ?').run(user.id, deps.now(), m.id)
    audit(db, { actorId: user.id, userId: m.owner_id, action: 'team.accept', target: user.email }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'team.accepted' })
    return reply.redirect('/panel/team', 303)
  })

  const ownMember = (req: FastifyRequest) => db.prepare('SELECT * FROM team_members WHERE id = ? AND owner_id = ?').get(Number((req.params as { id: string }).id), me(req).id) as Member | undefined

  app.post('/panel/team/:id/role', { preHandler: userGuard }, async (req, reply) => {
    const m = ownMember(req)
    if (!m) return reply.callNotFound()
    const role = field(req.body, 'role')
    if ((ROLES as readonly string[]).includes(role)) db.prepare('UPDATE team_members SET role = ? WHERE id = ?').run(role, m.id)
    return reply.redirect('/panel/team', 303)
  })

  app.post('/panel/team/:id/remove', { preHandler: userGuard }, async (req, reply) => {
    const m = ownMember(req)
    if (!m) return reply.callNotFound()
    db.prepare('DELETE FROM team_members WHERE id = ?').run(m.id)
    if (m.user_id) db.prepare('UPDATE sessions SET workspace_id = NULL WHERE user_id = ? AND workspace_id = ?').run(m.user_id, me(req).id)
    audit(db, { actorId: me(req).id, userId: me(req).id, action: 'team.remove', target: m.email }, deps.now())
    return reply.redirect('/panel/team', 303)
  })

  app.post('/panel/workspace/:owner', { preHandler: userGuard }, async (req, reply) => {
    const ownerId = Number((req.params as { owner: string }).owner)
    const ok = db.prepare('SELECT 1 FROM team_members WHERE owner_id = ? AND user_id = ? AND accepted_at IS NOT NULL').get(ownerId, me(req).id)
    if (!ok || !findUserById(db, ownerId) || !req.ctx.session) return reply.callNotFound()
    db.prepare('UPDATE sessions SET workspace_id = ? WHERE id_hash = ?').run(ownerId, req.ctx.session.id_hash)
    return reply.redirect('/panel', 303)
  })

  app.post('/panel/workspace/personal', { preHandler: userGuard }, async (req, reply) => {
    if (req.ctx.session) db.prepare('UPDATE sessions SET workspace_id = NULL WHERE id_hash = ?').run(req.ctx.session.id_hash)
    return reply.redirect('/panel', 303)
  })
}
