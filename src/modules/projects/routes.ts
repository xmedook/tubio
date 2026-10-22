import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { panelLayout } from '../../views/layout.ts'
import { csrfField, emptyState, input, postButton, type Errors } from '../../views/ui.ts'
import { sendHtml, setFlash, userGuard, type Ctx } from '../../web/context.ts'
import { field, parseForm } from '../../web/forms.ts'
import type { User } from '../users/repo.ts'
import { createProject, deleteProject, getOwnProject, listProjects, projectCounts, updateProject } from './repo.ts'

const schema = z.object({
  name: z.string().trim().min(1, 'err.required').max(60, 'err.too_long'),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'err.invalid'),
})

const PALETTE = ['#4f46e5', '#0891b2', '#059669', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#7c3aed', '#475569']

function page(ctx: Ctx, deps: AppDeps, user: User, errors: Errors = {}, values: Record<string, string> = {}) {
  const { t } = ctx
  const projects = listProjects(deps.db, user.id)
  const counts = projectCounts(deps.db, user.id)
  return panelLayout(ctx, {
    title: t('projects.title'),
    active: 'projects',
    path: '/panel/projects',
    body: html`<h1>${t('projects.title')}</h1>
<p class="muted">${t('projects.intro')}</p>
<form class="card" method="post" action="/panel/projects" novalidate>
  ${csrfField(ctx)}
  <h2>${t('projects.new')}</h2>
  <div class="grid-2">
    ${input({ ctx, name: 'name', label: t('projects.name'), value: values.name, error: errors.name, required: true, maxlength: 60 })}
    ${input({ ctx, name: 'color', type: 'color', label: t('projects.color'), value: values.color ?? PALETTE[projects.length % PALETTE.length], error: errors.color })}
  </div>
  <button class="btn btn-primary" type="submit">${t('projects.create')}</button>
</form>
${projects.length === 0
  ? emptyState(t('projects.empty'), html`<p class="muted">${t('projects.empty_body')}</p>`)
  : html`<ul class="list">${projects.map((p) => {
      const c = counts.get(p.id) ?? { links: 0, qr: 0 }
      return html`<li>
        <form method="post" action="/panel/projects/${p.id}" class="grow btn-row" novalidate>
          ${csrfField(ctx)}
          <label class="sr-only" for="pc-${p.id}">${t('projects.color')}</label>
          <input id="pc-${p.id}" type="color" name="color" value="${p.color}" class="swatch">
          <label class="sr-only" for="pn-${p.id}">${t('projects.name')}</label>
          <input id="pn-${p.id}" name="name" value="${p.name}" maxlength="60" required class="inline-input">
          <button class="btn btn-sm" type="submit">${t('common.save')}</button>
          <a class="sub" href="/panel?project=${p.id}">${t('projects.count', { links: c.links, qr: c.qr })}</a>
        </form>
        ${postButton(ctx, `/panel/projects/${p.id}/delete`, t('common.delete'), { cls: 'btn btn-sm btn-danger', confirm: t('projects.delete_confirm') })}
      </li>`
    })}</ul>`}`,
  })
}

export function registerProjects(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  app.get('/panel/projects', { preHandler: userGuard }, async (req, reply) => sendHtml(reply, page(req.ctx, deps, req.ctx.user as User)))

  app.post('/panel/projects', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    const r = parseForm(schema, req.body)
    if (!r.ok) return sendHtml(reply, page(req.ctx, deps, user, r.errors, { name: field(req.body, 'name'), color: field(req.body, 'color') }), 422)
    createProject(db, user.id, r.data.name, r.data.color, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'projects.created' })
    return reply.redirect('/panel/projects', 303)
  })

  app.post('/panel/projects/:id', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    const p = getOwnProject(db, Number((req.params as { id: string }).id), user.id)
    if (!p) return reply.callNotFound()
    const r = parseForm(schema, req.body)
    if (!r.ok) return sendHtml(reply, page(req.ctx, deps, user, r.errors), 422)
    updateProject(db, p.id, r.data.name, r.data.color)
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect('/panel/projects', 303)
  })

  app.post('/panel/projects/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    const p = getOwnProject(db, Number((req.params as { id: string }).id), user.id)
    if (!p) return reply.callNotFound()
    deleteProject(db, p.id)
    setFlash(reply, deps, { type: 'ok', key: 'projects.deleted' })
    return reply.redirect('/panel/projects', 303)
  })
}
