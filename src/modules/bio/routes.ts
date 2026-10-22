import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { storeImage, readMultipart, UploadError, type MultipartData } from '../../lib/uploads.ts'
import { checkTarget, redirectAllowed } from '../../lib/urls.ts'
import { sendHtml, setFlash, userGuard } from '../../web/context.ts'
import { checked, field } from '../../web/forms.ts'
import type { Errors } from '../../views/ui.ts'
import { getLink, updateLink, type Link } from '../links/repo.ts'
import { availability, isConfirmed, isUnlocked } from '../public/gate.ts'
import { ownLinkOr404 } from '../links/routes.ts'
import { recordEvent, visitFromRequest } from '../stats/record.ts'
import type { User } from '../users/repo.ts'
import { parseBlockForm, valuesFromBlock } from './block-form.ts'
import { BLOCK_BY_TYPE, blockTarget, MAX_BLOCKS_PER_PAGE } from './blocks.ts'
import { designSchema, readDesign, WEB_FONTS, type Design } from './design.ts'
import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { visibleBlocks } from './render.ts'
import {
  countBlocks,
  createBlock,
  deleteBlock,
  getBlock,
  getOwnBlock,
  incrementBlockClicks,
  listBlocks,
  moveBlock,
  reorderBlocks,
  setBlockEnabled,
  updateBlock,
} from './repo.ts'
import { blockFormPage, designPage, editorPage, themeSwatchCss } from './views.ts'

const IMAGE_FIELDS = { bg_image: 1920, seo_image: 1200, favicon: 192 } as const

async function parseDesign(deps: AppDeps, user: User, mp: MultipartData, current: Design): Promise<{ ok: true; design: Design } | { ok: false; errors: Errors }> {
  const b = mp.fields
  const f = (k: string) => field(b, k)
  const errors: Errors = {}
  const raw: Record<string, unknown> = {}
  for (const k of Object.keys(designSchema.shape)) {
    if (k in IMAGE_FIELDS) continue
    const isCheck = ['noindex', 'show_branding', 'share_button'].includes(k)
    // campo que no vino en el formulario: se conserva el valor actual
    if (!isCheck && b[k] === undefined && b[`${k}__theme`] === undefined) {
      raw[k] = current[k as keyof Design]
      continue
    }
    if (['noindex', 'show_branding', 'share_button'].includes(k)) raw[k] = checked(b, k)
    else if (['text_color', 'btn_bg', 'btn_text', 'btn_border_color'].includes(k)) raw[k] = checked(b, `${k}__theme`) ? null : f(k).toLowerCase()
    else if (['btn_border_width', 'btn_radius'].includes(k)) raw[k] = f(k).trim() === '' ? null : f(k)
    else raw[k] = f(k)
  }
  for (const k of ['announce_url', 'brand_url', 'leap_url'] as const) {
    if (b[k] === undefined) continue
    const v = f(k).trim()
    if (!v) {
      raw[k] = ''
      continue
    }
    const r = checkTarget(deps.db, v)
    if (!r.ok) errors[k] = r.error
    else raw[k] = r.url
  }
  for (const [k, max] of Object.entries(IMAGE_FIELDS) as [keyof typeof IMAGE_FIELDS, number][]) {
    raw[k] = checked(b, `${k}__remove`) ? null : current[k]
    const up = mp.files.find((x) => x.field === k)
    if (up && !Object.keys(errors).length) {
      try {
        raw[k] = (await storeImage(deps, user.id, up.buffer, up.filename, { maxDim: max, square: k === 'favicon' })).key
      } catch (e) {
        errors[k] = e instanceof UploadError ? e.key : 'err.upload_not_image'
      }
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  const r = designSchema.safeParse(raw)
  if (!r.success) {
    for (const i of r.error.issues) errors[String(i.path[0])] = 'err.invalid'
    return { ok: false, errors }
  }
  return { ok: true, design: r.data }
}

function bioLinkOr404(deps: AppDeps, req: FastifyRequest, reply: FastifyReply): Link | null {
  const link = ownLinkOr404(deps, req, reply)
  if (link && link.kind !== 'bio') {
    reply.callNotFound()
    return null
  }
  return link
}

export function registerBio(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const host = () => new URL(deps.config.baseUrl).hostname

  // archivos de fuentes web (sólo los de la lista blanca)
  const fontFiles = new Map<string, string>()
  for (const f of Object.values(WEB_FONTS)) for (const x of f?.faces ?? []) fontFiles.set(x.file, x.pkg)
  const req_ = createRequire(import.meta.url)
  app.get('/_/fonts/:file', async (req, reply) => {
    const file = (req.params as { file: string }).file
    const pkg = fontFiles.get(file)
    if (!pkg) return reply.callNotFound()
    const path = join(dirname(req_.resolve(`${pkg}/package.json`)), 'files', file)
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    reply.header('Access-Control-Allow-Origin', '*')
    return reply.type('font/woff2').send(createReadStream(path))
  })

  app.get('/_/themes.css', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.type('text/css; charset=utf-8').send(themeSwatchCss())
  })

  app.get('/panel/links/:id/blocks', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLinkOr404(deps, req, reply)
    if (!link) return
    return sendHtml(reply, editorPage(req.ctx, link, listBlocks(db, link.id)))
  })

  app.get('/panel/links/:id/blocks/new', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLinkOr404(deps, req, reply)
    if (!link) return
    const def = BLOCK_BY_TYPE.get(String((req.query as { type?: string }).type))
    if (!def) return reply.redirect(`/panel/links/${link.id}/blocks`, 303)
    return sendHtml(reply, blockFormPage(req.ctx, link, def, undefined, valuesFromBlock(def, undefined, (req.ctx.user as User).timezone), {}))
  })

  app.post('/panel/links/:id/blocks', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLinkOr404(deps, req, reply)
    if (!link) return
    const user = req.ctx.user as User
    const def = BLOCK_BY_TYPE.get(String((req.query as { type?: string }).type))
    if (!def) return reply.code(400).send('type')
    if (countBlocks(db, link.id) >= MAX_BLOCKS_PER_PAGE) return reply.redirect(`/panel/links/${link.id}/blocks`, 303)
    let mp: MultipartData
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) return sendHtml(reply, blockFormPage(req.ctx, link, def, undefined, valuesFromBlock(def, undefined, user.timezone), { _form: e.key }), 413)
      throw e
    }
    const r = await parseBlockForm(deps, user, def, mp, undefined, host())
    if (!r.ok) return sendHtml(reply, blockFormPage(req.ctx, link, def, undefined, r.values, r.errors), 422)
    createBlock(db, link.id, r.input, deps.now())
    updateLink(db, link.id, {}, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'bio.block_added' })
    return reply.redirect(`/panel/links/${link.id}/blocks`, 303)
  })

  function ownBlock(req: FastifyRequest, reply: FastifyReply) {
    const id = Number((req.params as { id: string }).id)
    const b = Number.isInteger(id) ? getOwnBlock(db, id, (req.ctx.user as User).id) : undefined
    const link = b ? getLink(db, b.link_id) : undefined
    if (!b || !link) {
      reply.callNotFound()
      return null
    }
    return { b, link }
  }

  app.get('/panel/blocks/:id', { preHandler: userGuard }, async (req, reply) => {
    const own = ownBlock(req, reply)
    if (!own) return
    const def = BLOCK_BY_TYPE.get(own.b.type)
    if (!def) return reply.callNotFound()
    return sendHtml(reply, blockFormPage(req.ctx, own.link, def, own.b, valuesFromBlock(def, own.b, (req.ctx.user as User).timezone), {}))
  })

  app.post('/panel/blocks/:id', { preHandler: userGuard }, async (req, reply) => {
    const own = ownBlock(req, reply)
    if (!own) return
    const user = req.ctx.user as User
    const def = BLOCK_BY_TYPE.get(own.b.type)
    if (!def) return reply.callNotFound()
    let mp: MultipartData
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) return sendHtml(reply, blockFormPage(req.ctx, own.link, def, own.b, valuesFromBlock(def, own.b, user.timezone), { _form: e.key }), 413)
      throw e
    }
    const r = await parseBlockForm(deps, user, def, mp, own.b, host())
    if (!r.ok) return sendHtml(reply, blockFormPage(req.ctx, own.link, def, own.b, r.values, r.errors), 422)
    const { type: _t, ...patch } = r.input
    updateBlock(db, own.b.id, patch, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect(`/panel/links/${own.link.id}/blocks`, 303)
  })

  app.post('/panel/blocks/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    const own = ownBlock(req, reply)
    if (!own) return
    deleteBlock(db, own.b.id)
    setFlash(reply, deps, { type: 'ok', key: 'bio.block_deleted' })
    return reply.redirect(`/panel/links/${own.link.id}/blocks`, 303)
  })

  app.post('/panel/blocks/:id/toggle', { preHandler: userGuard }, async (req, reply) => {
    const own = ownBlock(req, reply)
    if (!own) return
    setBlockEnabled(db, own.b.id, !own.b.is_enabled)
    return reply.redirect(`/panel/links/${own.link.id}/blocks`, 303)
  })

  app.post('/panel/blocks/:id/move', { preHandler: userGuard }, async (req, reply) => {
    const own = ownBlock(req, reply)
    if (!own) return
    moveBlock(db, own.link.id, own.b.id, field(req.body, 'dir') === 'up' ? -1 : 1)
    return reply.redirect(`/panel/links/${own.link.id}/blocks#b${own.b.id}`, 303)
  })

  app.post('/panel/links/:id/blocks/order', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLinkOr404(deps, req, reply)
    if (!link) return
    const ids = (req.body as { ids?: unknown })?.ids
    if (!Array.isArray(ids) || ids.length > MAX_BLOCKS_PER_PAGE * 2) return reply.code(400).send({ ok: false })
    reorderBlocks(db, link.id, ids.map(Number).filter(Number.isInteger))
    return { ok: true }
  })

  app.get('/panel/links/:id/design', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLinkOr404(deps, req, reply)
    if (!link) return
    return sendHtml(reply, designPage(req.ctx, link, readDesign(link.data)))
  })

  app.post('/panel/links/:id/design', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLinkOr404(deps, req, reply)
    if (!link) return
    const user = req.ctx.user as User
    const current = readDesign(link.data)
    let mp: MultipartData
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) return sendHtml(reply, designPage(req.ctx, link, current, { _form: e.key }), 413)
      throw e
    }
    const r = await parseDesign(deps, user, mp, current)
    if (!r.ok) return sendHtml(reply, designPage(req.ctx, link, current, r.errors), 422)
    updateLink(db, link.id, { data: r.design as unknown as Record<string, unknown> }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect(`/panel/links/${link.id}/design`, 303)
  })

  // clic en un bloque: cuenta y redirige
  app.get('/_/c/:id', async (req, reply) => {
    const b = getBlock(db, Number((req.params as { id: string }).id))
    const link = b ? getLink(db, b.link_id) : undefined
    if (!b || !link || availability(deps, link) !== 'ok' || !isUnlocked(deps, req, link) || !isConfirmed(deps, req, link)) return reply.callNotFound()
    if (!visibleBlocks([b], deps.now()).length) return reply.callNotFound()
    const to = (req.query as { to?: string }).to
    const raw = blockTarget(b, typeof to === 'string' ? to : undefined)
    const target = raw ? redirectAllowed(db, raw) : null
    if (!target) return reply.callNotFound()
    const preview = req.ctx.user?.id === link.user_id && String(req.headers.referer ?? '').includes('_preview=1')
    if (!preview && recordEvent(deps, visitFromRequest(req), { linkId: link.id, blockId: b.id, kind: 'click' })) incrementBlockClicks(db, b.id)
    reply.header('Cache-Control', 'no-store')
    reply.header('X-Robots-Tag', 'noindex')
    return reply.redirect(target, 302)
  })
}
