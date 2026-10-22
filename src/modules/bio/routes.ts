import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { findFile, findFileByKey, readMultipart, storeImage, uploadPath, UploadError, type MultipartData } from '../../lib/uploads.ts'
import { buildVCard, vcardFileName, vcardSchema } from '../../lib/vcard.ts'
import { checkTarget, redirectAllowed } from '../../lib/urls.ts'
import { sendHtml, setFlash, userGuard } from '../../web/context.ts'
import { checked, field } from '../../web/forms.ts'
import type { Errors } from '../../views/ui.ts'
import { findByAlias, getLink, updateLink, type Link } from '../links/repo.ts'
import { availability, isConfirmed, isUnlocked } from '../public/gate.ts'
import { ownLinkOr404 } from '../links/routes.ts'
import { recordEvent, visitFromRequest } from '../stats/record.ts'
import type { User } from '../users/repo.ts'
import { listTargets } from '../capture/notify.ts'
import { limitsOf, PLAN_GATED_BLOCKS } from '../plans/limits.ts'
import { parseBlockForm, valuesFromBlock } from './block-form.ts'
import { warmFeedCache } from './blocks-feeds.ts'
import { BLOCK_BY_TYPE, blockTarget, MAX_BLOCKS_PER_PAGE } from './blocks.ts'
import { designSchema, readDesign, themeById, WEB_FONTS, type Design } from './design.ts'
import sharp from 'sharp'
import { esc } from '../../lib/html.ts'
import { contrastInk } from '../../lib/qr.ts'
import { createReadStream, existsSync } from 'node:fs'
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
    const isCheck = ['noindex', 'show_branding', 'share_button', 'pwa', 'directory'].includes(k)
    // campo que no vino en el formulario: se conserva el valor actual
    if (!isCheck && b[k] === undefined && b[`${k}__theme`] === undefined) {
      raw[k] = current[k as keyof Design]
      continue
    }
    if (['noindex', 'show_branding', 'share_button', 'pwa', 'directory'].includes(k)) raw[k] = checked(b, k)
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
  const targetsOf = (req: FastifyRequest) => listTargets(deps, (req.ctx.user as User).id).map((x) => ({ id: x.id, name: x.name, kind: x.kind }))
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

  // PWA: manifiesto e iconos de una página bio (si su dueño lo activó)
  const pwaLink = (alias: string) => {
    const l = findByAlias(db, alias)
    return l && l.kind === 'bio' && readDesign(l.data).pwa && availability(deps, l) === 'ok' && !l.password_hash ? l : null
  }
  app.get('/_/pwa/:alias/manifest.webmanifest', async (req, reply) => {
    const l = pwaLink((req.params as { alias: string }).alias)
    if (!l) return reply.callNotFound()
    const d = readDesign(l.data)
    const th = themeById(d.theme)
    const color = d.btn_bg ?? (/^#/.test(th.btnBg) ? th.btnBg : '#1d4ed8')
    const bg = d.bg_type === 'color' ? d.bg_color : /^#/.test(th.bg) ? th.bg : '#ffffff'
    reply.header('Cache-Control', 'public, max-age=3600')
    return reply.type('application/manifest+json').send(JSON.stringify({
      name: (d.seo_title || l.title || l.alias).slice(0, 45),
      short_name: (l.title || l.alias).slice(0, 12),
      start_url: `/${l.alias}?utm_source=pwa`,
      scope: `/${l.alias}`,
      display: 'standalone',
      background_color: bg,
      theme_color: color,
      icons: [192, 512].map((n) => ({ src: `/_/pwa/${l.alias}/icon-${n}.png`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'any maskable' })),
    }))
  })
  app.get('/_/pwa/:alias/icon-:size.png', async (req, reply) => {
    const { alias, size } = req.params as { alias: string; size: string }
    const l = pwaLink(alias)
    const n = size === '512' ? 512 : size === '192' ? 192 : 0
    if (!l || !n) return reply.callNotFound()
    const d = readDesign(l.data)
    // ícono: favicon propio, si no el avatar, si no una inicial sobre el color del tema
    const avatar = listBlocks(db, l.id).find((b) => b.type === 'avatar' && b.is_enabled)
    const key = d.favicon ?? (typeof avatar?.data.image === 'string' ? avatar.data.image : null)
    let png: Buffer
    const f = key ? findFileByKey(deps, key) : undefined
    if (f && existsSync(uploadPath(deps, f.key))) png = await sharp(uploadPath(deps, f.key)).resize(n, n, { fit: 'cover' }).png().toBuffer()
    else {
      const th = themeById(d.theme)
      const fill = d.btn_bg ?? (/^#/.test(th.btnBg) ? th.btnBg : '#1d4ed8')
      const letter = esc((l.title || l.alias).trim().charAt(0).toUpperCase() || 't')
      png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"><rect width="100%" height="100%" fill="${fill}"/><text x="50%" y="54%" font-family="DejaVu Sans, Arial" font-weight="700" font-size="${n * 0.55}" fill="${contrastInk(fill)}" text-anchor="middle" dominant-baseline="middle">${letter}</text></svg>`)).png().toBuffer()
    }
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.type('image/png').send(png)
  })

  app.get('/_/themes.css', async (_req, reply) => {
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.type('text/css; charset=utf-8').send(themeSwatchCss())
  })

  app.get('/panel/links/:id/blocks', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLinkOr404(deps, req, reply)
    if (!link) return
    const lim = limitsOf(db, req.ctx.user as User, deps.now())
    const locked = Object.entries(PLAN_GATED_BLOCKS).filter(([, f]) => !lim[f]).map(([type]) => type)
    return sendHtml(reply, editorPage(req.ctx, link, listBlocks(db, link.id), locked, lim.blocks_per_page < 0 ? MAX_BLOCKS_PER_PAGE : Math.min(MAX_BLOCKS_PER_PAGE, lim.blocks_per_page)))
  })

  app.get('/panel/links/:id/blocks/new', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLinkOr404(deps, req, reply)
    if (!link) return
    const def = BLOCK_BY_TYPE.get(String((req.query as { type?: string }).type))
    if (!def) return reply.redirect(`/panel/links/${link.id}/blocks`, 303)
    return sendHtml(reply, blockFormPage(req.ctx, link, def, undefined, valuesFromBlock(def, undefined, (req.ctx.user as User).timezone), {}, targetsOf(req)))
  })

  app.post('/panel/links/:id/blocks', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLinkOr404(deps, req, reply)
    if (!link) return
    const user = req.ctx.user as User
    const def = BLOCK_BY_TYPE.get(String((req.query as { type?: string }).type))
    if (!def) return reply.code(400).send('type')
    const lim = limitsOf(db, user, deps.now())
    if (countBlocks(db, link.id) >= Math.min(MAX_BLOCKS_PER_PAGE, lim.blocks_per_page < 0 ? MAX_BLOCKS_PER_PAGE : lim.blocks_per_page)) {
      setFlash(reply, deps, { type: 'error', key: 'err.plan_blocks', vars: { n: lim.blocks_per_page } })
      return reply.redirect(`/panel/links/${link.id}/blocks`, 303)
    }
    const gate = PLAN_GATED_BLOCKS[def.type]
    if (gate && !lim[gate]) {
      setFlash(reply, deps, { type: 'error', key: 'err.plan_feature' })
      return reply.redirect(`/panel/links/${link.id}/blocks`, 303)
    }
    let mp: MultipartData
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) return sendHtml(reply, blockFormPage(req.ctx, link, def, undefined, valuesFromBlock(def, undefined, user.timezone), { _form: e.key }, targetsOf(req)), 413)
      throw e
    }
    const r = await parseBlockForm(deps, user, def, mp, undefined, host())
    if (!r.ok) return sendHtml(reply, blockFormPage(req.ctx, link, def, undefined, r.values, r.errors, targetsOf(req)), 422)
    createBlock(db, link.id, r.input, deps.now())
    await warmFeedCache(db, r.input, deps.now())
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
    return sendHtml(reply, blockFormPage(req.ctx, own.link, def, own.b, valuesFromBlock(def, own.b, (req.ctx.user as User).timezone), {}, targetsOf(req)))
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
      if (e instanceof UploadError) return sendHtml(reply, blockFormPage(req.ctx, own.link, def, own.b, valuesFromBlock(def, own.b, user.timezone), { _form: e.key }, targetsOf(req)), 413)
      throw e
    }
    const r = await parseBlockForm(deps, user, def, mp, own.b, host())
    if (!r.ok) return sendHtml(reply, blockFormPage(req.ctx, own.link, def, own.b, r.values, r.errors, targetsOf(req)), 422)
    const { type: _t, ...patch } = r.input
    updateBlock(db, own.b.id, patch, deps.now())
    await warmFeedCache(db, r.input, deps.now())
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

  /** bloque visible de una página disponible y desbloqueada (para descargas desde bloques) */
  function publicBlock(req: FastifyRequest, type: string) {
    const b = getBlock(db, Number((req.params as { id: string }).id))
    const link = b ? getLink(db, b.link_id) : undefined
    if (!b || b.type !== type || !link || availability(deps, link) !== 'ok' || !isUnlocked(deps, req, link) || !isConfirmed(deps, req, link)) return null
    if (!visibleBlocks([b], deps.now()).length) return null
    return { b, link }
  }
  const countClick = (req: FastifyRequest, linkId: number, blockId: number) => {
    if (recordEvent(deps, visitFromRequest(req), { linkId, blockId, kind: 'click' })) incrementBlockClicks(db, blockId)
  }

  app.get('/_/vcf/:id', async (req, reply) => {
    const r = publicBlock(req, 'vcard_button')
    if (!r) return reply.callNotFound()
    const d = vcardSchema.parse({ ...r.b.data, url: typeof r.b.data.url === 'string' ? r.b.data.url : '' })
    countClick(req, r.link.id, r.b.id)
    reply.header('Content-Disposition', `attachment; filename="${vcardFileName(d)}"`)
    reply.header('Cache-Control', 'no-store')
    return reply.type('text/vcard; charset=utf-8').send(buildVCard(d))
  })

  app.get('/_/dl/:id', async (req, reply) => {
    const r = publicBlock(req, 'file_button')
    const meta = (r?.b.data.file ?? null) as { file_id?: number } | null
    const f = meta?.file_id ? findFile(deps, meta.file_id) : undefined
    if (!r || !f || f.user_id !== r.link.user_id) return reply.callNotFound()
    const p = uploadPath(deps, f.key)
    if (!existsSync(p)) return reply.callNotFound()
    countClick(req, r.link.id, r.b.id)
    const mime = /^(text\/html|image\/svg|application\/xhtml|text\/xml|application\/xml|application\/javascript|text\/javascript)/.test(f.mime) ? 'application/octet-stream' : f.mime
    const ascii = f.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    reply.header('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.original_name)}`)
    reply.header('Content-Length', String(f.size))
    reply.header('Content-Security-Policy', "default-src 'none'; sandbox")
    reply.header('X-Robots-Tag', 'noindex')
    return reply.type(mime).send(createReadStream(p))
  })

  app.get('/_/h/:id', async (req, reply) => {
    const r = publicBlock(req, 'html')
    if (!r) return reply.callNotFound()
    // sólo dentro de un iframe: abrirlo como página suelta en tubio.link serviría para phishing
    const dest = req.headers['sec-fetch-dest']
    if (dest && dest !== 'iframe') return reply.callNotFound()
    // origen opaco: sin allow-same-origin el documento no puede leer cookies ni tocar al padre
    reply.header('Content-Security-Policy', "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; frame-ancestors 'self'; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'")
    reply.header('X-Frame-Options', 'SAMEORIGIN')
    reply.header('X-Robots-Tag', 'noindex')
    reply.header('Cache-Control', 'no-store')
    return reply.type('text/html; charset=utf-8').send(String(r.b.data.code ?? ''))
  })

  app.get('/_/pdf/:id', async (req, reply) => {
    const r = publicBlock(req, 'pdf')
    const meta = (r?.b.data.file ?? null) as { file_id?: number } | null
    const f = meta?.file_id ? findFile(deps, meta.file_id) : undefined
    if (!r || !f || f.user_id !== r.link.user_id || f.mime !== 'application/pdf') return reply.callNotFound()
    const p = uploadPath(deps, f.key)
    if (!existsSync(p)) return reply.callNotFound()
    const download = (req.query as { download?: string }).download === '1'
    const ascii = f.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    reply.header('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.original_name)}`)
    reply.header('X-Frame-Options', 'SAMEORIGIN')
    reply.header('Content-Security-Policy', "frame-ancestors 'self'")
    reply.header('X-Robots-Tag', 'noindex')
    return reply.type('application/pdf').send(createReadStream(p))
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
