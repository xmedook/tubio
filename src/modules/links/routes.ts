import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { deleteStoredFile, findFile, readMultipart, UploadError } from '../../lib/uploads.ts'
import { sendHtml, setFlash, userGuard } from '../../web/context.ts'
import { listProjects } from '../projects/repo.ts'
import { audit } from '../settings/repo.ts'
import type { User } from '../users/repo.ts'
import { defaultValues, parseLinkForm, valuesFromLink } from './form.ts'
import { createLink, deleteLink, getOwnLink, LINK_KINDS, listLinks, updateLink, type Link, type LinkKind } from './repo.ts'
import { dashboardPage, linkFormPage } from './views.ts'
import { defaultBioData } from '../bio/design.ts'
import { createBlock } from '../bio/repo.ts'

const PER_PAGE = 30

function asKind(v: unknown): LinkKind | undefined {
  return typeof v === 'string' && (LINK_KINDS as readonly string[]).includes(v) ? (v as LinkKind) : undefined
}

/** Borra el archivo que ya no usa un enlace tipo Archivo */
function dropOldFile(deps: AppDeps, before: Link, afterData: Record<string, unknown>): void {
  const oldId = Number(before.data.file_id)
  if (before.kind === 'file' && oldId && oldId !== Number(afterData.file_id)) {
    const f = findFile(deps, oldId)
    if (f && f.user_id === before.user_id) deleteStoredFile(deps, f)
  }
}

export function ownLinkOr404(deps: AppDeps, req: FastifyRequest, reply: FastifyReply): Link | null {
  const id = Number((req.params as { id: string }).id)
  const link = Number.isInteger(id) ? getOwnLink(deps.db, id, (req.ctx.user as User).id) : undefined
  if (!link) {
    reply.callNotFound()
    return null
  }
  return link
}

export function registerLinks(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  app.get('/panel', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    const q = req.query as { kind?: string; project?: string; q?: string; page?: string }
    const kind = asKind(q.kind)
    const project = Number(q.project) || undefined
    const search = (q.q ?? '').trim().slice(0, 100) || undefined
    const page = Math.max(1, Number(q.page) || 1)
    const { items, total } = listLinks(db, user.id, { kind, projectId: project, q: search, limit: PER_PAGE, offset: (page - 1) * PER_PAGE })
    return sendHtml(reply, dashboardPage(req.ctx, { items, total, projects: listProjects(db, user.id), kind, project, q: search, page, perPage: PER_PAGE }))
  })

  app.get('/panel/links/new', { preHandler: userGuard }, async (req, reply) => {
    const kind = asKind((req.query as { kind?: string }).kind) ?? 'short'
    const user = req.ctx.user as User
    return sendHtml(reply, linkFormPage(req.ctx, { kind, values: defaultValues(), errors: {}, projects: listProjects(db, user.id) }))
  })

  app.post('/panel/links', { preHandler: userGuard }, async (req, reply) => {
    const kind = asKind((req.query as { kind?: string }).kind)
    if (!kind) return reply.code(400).send('kind')
    const user = req.ctx.user as User
    let mp
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) {
        return sendHtml(reply, linkFormPage(req.ctx, { kind, values: defaultValues(), errors: { file: e.key }, projects: listProjects(db, user.id) }), 413)
      }
      throw e
    }
    const r = await parseLinkForm(deps, user, kind, mp)
    if (!r.ok) return sendHtml(reply, linkFormPage(req.ctx, { kind, values: r.values, errors: r.errors, projects: listProjects(db, user.id) }), 422)
    if (kind === 'bio') r.input.data = defaultBioData(r.input.title || r.input.alias, user.name)
    const link = createLink(db, user.id, r.input, deps.now())
    if (kind === 'bio') {
      createBlock(db, link.id, { type: 'heading', is_enabled: true, starts_at: null, ends_at: null, data: { text: r.input.title || user.name || link.alias, level: 'h1' }, style: {} }, deps.now())
    }
    audit(db, { actorId: user.id, userId: user.id, action: 'link.create', target: `link:${link.id}`, meta: { kind, alias: link.alias } }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'links.created' })
    return reply.redirect(kind === 'bio' ? `/panel/links/${link.id}/blocks` : `/panel/links/${link.id}`, 303)
  })

  app.get('/panel/links/:id', { preHandler: userGuard }, async (req, reply) => {
    const link = ownLinkOr404(deps, req, reply)
    if (!link) return
    const user = req.ctx.user as User
    return sendHtml(reply, linkFormPage(req.ctx, { kind: link.kind, link, values: valuesFromLink(link, user.timezone), errors: {}, projects: listProjects(db, user.id) }))
  })

  app.post('/panel/links/:id', { preHandler: userGuard }, async (req, reply) => {
    const link = ownLinkOr404(deps, req, reply)
    if (!link) return
    const user = req.ctx.user as User
    let mp
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) {
        return sendHtml(reply, linkFormPage(req.ctx, { kind: link.kind, link, values: valuesFromLink(link, user.timezone), errors: { file: e.key }, projects: listProjects(db, user.id) }), 413)
      }
      throw e
    }
    const r = await parseLinkForm(deps, user, link.kind, mp, link)
    if (!r.ok) return sendHtml(reply, linkFormPage(req.ctx, { kind: link.kind, link, values: r.values, errors: r.errors, projects: listProjects(db, user.id) }), 422)
    const { kind: _k, ...patch } = r.input
    updateLink(db, link.id, patch, deps.now())
    dropOldFile(deps, link, r.input.data)
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect(`/panel/links/${link.id}`, 303)
  })

  app.post('/panel/links/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    const link = ownLinkOr404(deps, req, reply)
    if (!link) return
    const user = req.ctx.user as User
    dropOldFile(deps, link, {})
    deleteLink(db, link.id)
    audit(db, { actorId: user.id, userId: user.id, action: 'link.delete', target: `link:${link.id}`, meta: { alias: link.alias } }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'links.deleted' })
    return reply.redirect('/panel', 303)
  })
}
