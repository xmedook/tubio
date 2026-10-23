import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { deleteStoredFile, findFile, readMultipart, UploadError } from '../../lib/uploads.ts'
import { sendHtml, setFlash, userGuard } from '../../web/context.ts'
import { listProjects } from '../projects/repo.ts'
import { audit, getSetting } from '../settings/repo.ts'
import type { User } from '../users/repo.ts'
import { defaultValues, parseLinkForm, valuesFromLink } from './form.ts'
import { aliasTaken, createLink, deleteLink, getOwnLink, LINK_KINDS, listLinks, updateLink, type Link, type LinkKind } from './repo.ts'
import { dashboardPage, linkFormPage } from './views.ts'
import { actorOf } from '../auth/routes.ts'
import { defaultBioData } from '../bio/design.ts'
import { createBlock } from '../bio/repo.ts'
import { dailyCapHit, limitsOf, usageOf, withinLimit } from '../plans/limits.ts'
import { listPixels } from '../marketing/pixels.ts'

const PER_PAGE = 30
export { DAILY_CAP_UNVERIFIED, DAILY_CAP_VERIFIED } from '../plans/limits.ts'

function asKind(v: unknown): LinkKind | undefined {
  return typeof v === 'string' && (LINK_KINDS as readonly string[]).includes(v) ? (v as LinkKind) : undefined
}

/** Borra el archivo que ya no usa un enlace tipo Archivo (y su sitio extraído) */
export function dropOldFile(deps: AppDeps, before: Link, afterData: Record<string, unknown>): void {
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
  const activeDomains = (user: User) => db.prepare("SELECT id, host FROM domains WHERE user_id = ? AND status = 'active' ORDER BY host").all(user.id) as { id: number; host: string }[]
  const marketingOpts = (user: User) => ({
    enabled: limitsOf(db, user, deps.now()).marketing,
    pixels: listPixels(db, user.id),
    splashes: db.prepare('SELECT id, name FROM splashes WHERE user_id = ? ORDER BY name').all(user.id) as { id: number; name: string }[],
  })

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
    return sendHtml(reply, linkFormPage(req.ctx, { kind, values: defaultValues(), errors: {}, projects: listProjects(db, user.id), marketing: marketingOpts(user), domains: activeDomains(user) }))
  })

  app.post('/panel/links', { preHandler: userGuard }, async (req, reply) => {
    const kind = asKind((req.query as { kind?: string }).kind)
    if (!kind) return reply.code(400).send('kind')
    const user = req.ctx.user as User
    // tope diario anti-abuso: cuentas sin verificar crean pocos enlaces
    if (dailyCapHit(db, user, deps.now())) {
      return sendHtml(reply, linkFormPage(req.ctx, { kind, values: defaultValues(), errors: { _form: user.email_verified_at ? 'err.daily_cap' : 'err.daily_cap_unverified' }, projects: listProjects(db, user.id), marketing: marketingOpts(user), domains: activeDomains(user) }), 429)
    }
    // límite del plan: páginas bio por un lado, el resto de enlaces por otro
    const lim = limitsOf(db, user, deps.now())
    const used = usageOf(db, user.id)
    if (kind === 'bio' ? !withinLimit(lim.bio_pages, used.bio_pages) : !withinLimit(lim.links, used.links)) {
      return sendHtml(reply, linkFormPage(req.ctx, { kind, values: defaultValues(), errors: { _form: kind === 'bio' ? 'err.plan_bio_pages' : 'err.plan_links' }, projects: listProjects(db, user.id), marketing: marketingOpts(user), domains: activeDomains(user) }), 402)
    }
    let mp
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) {
        return sendHtml(reply, linkFormPage(req.ctx, { kind, values: defaultValues(), errors: { file: e.key }, projects: listProjects(db, user.id), marketing: marketingOpts(user), domains: activeDomains(user) }), 413)
      }
      throw e
    }
    const r = await parseLinkForm(deps, user, kind, mp, undefined, limitsOf(db, user, deps.now()).marketing)
    if (!r.ok) return sendHtml(reply, linkFormPage(req.ctx, { kind, values: r.values, errors: r.errors, projects: listProjects(db, user.id), marketing: marketingOpts(user), domains: activeDomains(user) }), 422)
    if (kind === 'bio') r.input.data = defaultBioData(r.input.title || r.input.alias, user.name, getSetting(db, 'default_theme'))
    const link = createLink(db, user.id, r.input, deps.now())
    if (kind === 'bio') {
      createBlock(db, link.id, { type: 'heading', is_enabled: true, starts_at: null, ends_at: null, data: { text: r.input.title || user.name || link.alias, level: 'h1' }, style: {} }, deps.now())
    }
    audit(db, { actorId: actorOf(req), userId: user.id, action: 'link.create', target: `link:${link.id}`, meta: { kind, alias: link.alias } }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'links.created' })
    return reply.redirect(kind === 'bio' ? `/panel/links/${link.id}/blocks` : `/panel/links/${link.id}`, 303)
  })

  app.get('/panel/links/:id', { preHandler: userGuard }, async (req, reply) => {
    const link = ownLinkOr404(deps, req, reply)
    if (!link) return
    const user = req.ctx.user as User
    return sendHtml(reply, linkFormPage(req.ctx, { kind: link.kind, link, values: valuesFromLink(link, user.timezone), errors: {}, projects: listProjects(db, user.id), marketing: marketingOpts(user), domains: activeDomains(user) }))
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
        return sendHtml(reply, linkFormPage(req.ctx, { kind: link.kind, link, values: valuesFromLink(link, user.timezone), errors: { file: e.key }, projects: listProjects(db, user.id), marketing: marketingOpts(user), domains: activeDomains(user) }), 413)
      }
      throw e
    }
    const r = await parseLinkForm(deps, user, link.kind, mp, link, limitsOf(db, user, deps.now()).marketing)
    if (!r.ok) return sendHtml(reply, linkFormPage(req.ctx, { kind: link.kind, link, values: r.values, errors: r.errors, projects: listProjects(db, user.id), marketing: marketingOpts(user), domains: activeDomains(user) }), 422)
    const { kind: _k, ...patch } = r.input
    updateLink(db, link.id, patch, deps.now())
    dropOldFile(deps, link, r.input.data)
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect(`/panel/links/${link.id}`, 303)
  })

  // duplicar: misma configuración y bloques, alias nuevo, contadores en cero
  app.post('/panel/links/:id/duplicate', { preHandler: userGuard }, async (req, reply) => {
    const link = ownLinkOr404(deps, req, reply)
    if (!link) return
    const user = req.ctx.user as User
    const back = (key: string) => {
      setFlash(reply, deps, { type: 'error', key })
      return reply.redirect('/panel', 303)
    }
    // los archivos se borran con su enlace: duplicarlos compartiría el archivo
    if (link.kind === 'file') return back('links.dup_file')
    if (dailyCapHit(db, user, deps.now())) return back('err.daily_cap')
    const lim = limitsOf(db, user, deps.now())
    const used = usageOf(db, user.id)
    if (link.kind === 'bio' ? !withinLimit(lim.bio_pages, used.bio_pages) : !withinLimit(lim.links, used.links)) return back(link.kind === 'bio' ? 'err.plan_bio_pages' : 'err.plan_links')
    let alias = `${link.alias}-copia`.slice(0, 60)
    for (let n = 2; aliasTaken(db, alias, undefined, link.domain_id); n++) alias = `${link.alias}-copia-${n}`.slice(0, 60)
    const now = deps.now()
    const id = db.transaction(() => {
      const cols = (db.prepare('PRAGMA table_info(links)').all() as { name: string }[]).map((c) => c.name).filter((c) => !['id', 'alias', 'title', 'clicks', 'hits', 'created_at', 'updated_at', 'dir_hidden'].includes(c))
      const newId = Number(db.prepare(`INSERT INTO links (${cols.join(', ')}, alias, title, created_at, updated_at) SELECT ${cols.join(', ')}, ?, ?, ?, ? FROM links WHERE id = ?`).run(alias, `${link.title || link.alias} (${req.ctx.t('links.copy_suffix')})`.slice(0, 120), now, now, link.id).lastInsertRowid)
      db.prepare('INSERT INTO bio_blocks (link_id, type, position, is_enabled, starts_at, ends_at, data, style, created_at, updated_at) SELECT ?, type, position, is_enabled, starts_at, ends_at, data, style, ?, ? FROM bio_blocks WHERE link_id = ? ORDER BY position, id').run(newId, now, now, link.id)
      return newId
    })()
    audit(db, { actorId: actorOf(req), userId: user.id, action: 'link.duplicate', target: `link:${id}`, meta: { from: link.id } }, now)
    setFlash(reply, deps, { type: 'ok', key: 'links.duplicated' })
    return reply.redirect(link.kind === 'bio' ? `/panel/links/${id}/blocks` : `/panel/links/${id}`, 303)
  })

  app.post('/panel/links/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    const link = ownLinkOr404(deps, req, reply)
    if (!link) return
    const user = req.ctx.user as User
    dropOldFile(deps, link, {})
    deleteLink(db, link.id)
    audit(db, { actorId: actorOf(req), userId: user.id, action: 'link.delete', target: `link:${link.id}`, meta: { alias: link.alias } }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'links.deleted' })
    return reply.redirect('/panel', 303)
  })
}
