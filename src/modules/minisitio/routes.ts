import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { readMultipart, storeImage, UploadError, type MultipartData } from '../../lib/uploads.ts'
import { checkTarget } from '../../lib/urls.ts'
import { sendHtml, setFlash, userGuard } from '../../web/context.ts'
import { checked, field } from '../../web/forms.ts'
import type { Errors } from '../../views/ui.ts'
import { ownLinkOr404 } from '../links/routes.ts'
import { getLink as repoGetLink, type Link } from '../links/repo.ts'
import { limitsOf, PLAN_GATED_BLOCKS } from '../plans/limits.ts'
import { MAX_BLOCKS_PER_PAGE } from '../bio/blocks.ts'
import { countBlocks } from '../bio/repo.ts'
import type { User } from '../users/repo.ts'
import {
  createPage,
  createSection,
  deletePage,
  deleteSection,
  ensureSite,
  getOwnPage,
  getOwnSection,
  loadSite,
  movePage,
  moveSection,
  saveSiteConfig,
  sectionsOf,
  updatePage,
  updateSection,
} from './repo.ts'
import {
  ACTION_TYPES,
  actionSchema,
  RESERVED_SLUGS,
  sectionDataSchema,
  slugify,
  SLUG_RE,
  MS_MAX_NAV,
  type Action,
  type SectionData,
  type SiteConfig,
} from './schema.ts'
import { blockPickerPage, pageEditPage, sectionEditPage, sitePage } from './views.ts'

const digits = (v: string) => v.replace(/\D/g, '')

/** Normaliza el destino de una acción según su tipo; deja el error en `errors[key]` */
function destino(deps: AppDeps, tipo: Action['tipo'], raw: string, errors: Errors, key: string): string {
  const v = raw.trim()
  if (!v) return ''
  switch (tipo) {
    case 'enlace': {
      const r = checkTarget(deps.db, v)
      if (!r.ok) {
        errors[key] = r.error
        return ''
      }
      return r.url
    }
    case 'whatsapp':
    case 'llamar': {
      const n = digits(v)
      if (n.length < 8 || n.length > 15) {
        errors[key] = 'ms.err_phone'
        return ''
      }
      return n
    }
    case 'pagina': {
      const slug = v.replace(/^\/+/, '').toLowerCase()
      if (slug && !SLUG_RE.test(slug)) errors[key] = 'ms.err_slug'
      return errors[key] ? '' : slug
    }
    case 'ancla': {
      const a = v.replace(/^#/, '').toLowerCase()
      if (!SLUG_RE.test(a)) {
        errors[key] = 'ms.err_slug'
        return ''
      }
      return a
    }
  }
}

function parseAction(deps: AppDeps, b: unknown, prefix: string, errors: Errors): Action {
  const tipo = (ACTION_TYPES as readonly string[]).includes(field(b, `${prefix}_tipo`)) ? (field(b, `${prefix}_tipo`) as Action['tipo']) : 'enlace'
  const texto = field(b, `${prefix}_texto`).trim().slice(0, 24)
  return actionSchema.parse({ texto, tipo, destino: destino(deps, tipo, field(b, `${prefix}_destino`), errors, `${prefix}_destino`), mensaje: field(b, `${prefix}_mensaje`).trim().slice(0, 300) })
}

async function imageField(deps: AppDeps, user: User, mp: MultipartData, name: string, current: string | null, maxDim: number, errors: Errors): Promise<string | null> {
  let key = checked(mp.fields, `${name}__remove`) ? null : current
  const up = mp.files.find((x) => x.field === name)
  if (up) {
    try {
      key = (await storeImage(deps, user.id, up.buffer, up.filename, { maxDim })).key
    } catch (e) {
      errors[name] = e instanceof UploadError ? e.key : 'err.upload_not_image'
    }
  }
  return key
}

async function parseSite(deps: AppDeps, user: User, mp: MultipartData, cur: SiteConfig): Promise<{ config: SiteConfig; errors: Errors }> {
  const b = mp.fields
  const errors: Errors = {}
  const wa = digits(field(b, 'whatsapp'))
  if (field(b, 'whatsapp').trim() && (wa.length < 8 || wa.length > 15)) errors.whatsapp = 'ms.err_phone'
  const nav_manual = Array.from({ length: MS_MAX_NAV }, (_, i) => {
    const tipo = (['ancla', 'pagina', 'enlace'] as const).find((x) => x === field(b, `nav_${i}_tipo`)) ?? 'ancla'
    return { texto: field(b, `nav_${i}_texto`).trim().slice(0, 24), tipo, destino: destino(deps, tipo, field(b, `nav_${i}_destino`), errors, `nav_${i}_destino`) }
  }).filter((n) => n.texto && n.destino !== undefined)
  const logo = await imageField(deps, user, mp, 'cab_logo', cur.cabecera.logo, 400, errors)
  const nav = (['auto', 'manual', 'ninguna'] as const).find((x) => x === field(b, 'cab_nav')) ?? 'auto'
  const config: SiteConfig = {
    whatsapp: errors.whatsapp ? cur.whatsapp : wa,
    cabecera: { activa: checked(b, 'cab_activa'), logo, nombre: field(b, 'cab_nombre').trim().slice(0, 40), nav, nav_manual, cta: parseAction(deps, b, 'cta', errors) },
    barra: { activa: checked(b, 'bar_activa'), acciones: [0, 1, 2].map((i) => parseAction(deps, b, `bar_${i}`, errors)).filter((a) => a.texto) },
    pie: { activo: checked(b, 'pie_activo'), direccion: field(b, 'pie_direccion').trim().slice(0, 160), servicios: field(b, 'pie_servicios').trim().slice(0, 160), texto: field(b, 'pie_texto').trim().slice(0, 200) },
  }
  return { config, errors }
}

function parseSection(b: unknown, cur: SectionData): { data: SectionData; errors: Errors } {
  const errors: Errors = {}
  const ancla = field(b, 'ancla').trim().replace(/^#/, '').toLowerCase()
  if (ancla && !SLUG_RE.test(ancla)) errors.ancla = 'ms.err_slug'
  const r = sectionDataSchema.safeParse({
    classic: false,
    ancla: errors.ancla ? '' : ancla,
    antetitulo: field(b, 'antetitulo'),
    titulo: field(b, 'titulo'),
    subtitulo: field(b, 'subtitulo'),
    fondo: field(b, 'fondo') || cur.fondo,
    color: field(b, 'color') || cur.color,
    color2: field(b, 'color2') || cur.color2,
    angulo: field(b, 'angulo') || cur.angulo,
    imagen: cur.imagen,
    oscurecer: field(b, 'oscurecer') || cur.oscurecer,
    alto: field(b, 'alto') || cur.alto,
    ancho: field(b, 'ancho') || cur.ancho,
    columnas: field(b, 'columnas') || cur.columnas,
    alinear: field(b, 'alinear') || cur.alinear,
  })
  if (!r.success) {
    for (const i of r.error.issues) errors[String(i.path[0])] = 'err.invalid'
    return { data: cur, errors }
  }
  return { data: r.data, errors }
}

export function registerMinisitio(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  function bioLink(req: FastifyRequest, reply: FastifyReply): Link | null {
    const link = ownLinkOr404(deps, req, reply)
    if (link && link.kind !== 'bio') {
      reply.callNotFound()
      return null
    }
    return link
  }

  function ownPage(req: FastifyRequest, reply: FastifyReply) {
    const id = Number((req.params as { id: string }).id)
    const page = Number.isInteger(id) ? getOwnPage(db, id, (req.ctx.user as User).id) : undefined
    const link = page ? repoGetLink(db, page.link_id) : undefined
    if (!page || !link) {
      reply.callNotFound()
      return null
    }
    return { page, link }
  }

  // ---------------------------------------------------------------- Sitio
  app.get('/panel/links/:id/site', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLink(req, reply)
    if (!link) return
    const site = loadSite(db, link.id)
    return sendHtml(reply, sitePage(req.ctx, link, site, site.config))
  })

  app.post('/panel/links/:id/site', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLink(req, reply)
    if (!link) return
    const user = req.ctx.user as User
    const site = loadSite(db, link.id)
    let mp: MultipartData
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) return sendHtml(reply, sitePage(req.ctx, link, site, site.config, { _form: e.key }), 413)
      throw e
    }
    const r = await parseSite(deps, user, mp, site.config)
    if (Object.keys(r.errors).length) return sendHtml(reply, sitePage(req.ctx, link, site, r.config, r.errors), 422)
    saveSiteConfig(db, link.id, r.config, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'ms.site_saved' })
    return reply.redirect(`/panel/links/${link.id}/site`, 303)
  })

  app.post('/panel/links/:id/site/pages', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLink(req, reply)
    if (!link) return
    const title = field(req.body, 'title').trim().slice(0, 60)
    const slug = (field(req.body, 'slug').trim().toLowerCase() || slugify(title)).slice(0, 40)
    const back = (key: string) => {
      setFlash(reply, deps, { type: 'error', key })
      return reply.redirect(`/panel/links/${link.id}/site`, 303)
    }
    if (!title) return back('err.invalid')
    if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) return back('ms.err_slug')
    ensureSite(db, link.id, deps.now())
    const r = createPage(db, link.id, { slug, title, is_enabled: true, data: { seo_title: '', seo_description: '', seo_image: null } }, deps.now())
    if (r === 'limit') return back('ms.err_pages_limit_short')
    if (r === 'taken') return back('ms.err_slug_taken')
    setFlash(reply, deps, { type: 'ok', key: 'ms.page_saved' })
    return reply.redirect(`/panel/ms/pages/${r.id}`, 303)
  })

  // ---------------------------------------------------------------- Página
  app.get('/panel/ms/pages/:id', { preHandler: userGuard }, async (req, reply) => {
    const own = ownPage(req, reply)
    if (!own) return
    const site = loadSite(db, own.link.id)
    const p = own.page
    return sendHtml(reply, pageEditPage(req.ctx, own.link, site, p, { title: p.title, slug: p.slug, is_enabled: !!p.is_enabled, ...p.data }))
  })

  app.post('/panel/ms/pages/:id', { preHandler: userGuard }, async (req, reply) => {
    const own = ownPage(req, reply)
    if (!own) return
    const user = req.ctx.user as User
    const site = loadSite(db, own.link.id)
    const p = own.page
    let mp: MultipartData
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) return sendHtml(reply, pageEditPage(req.ctx, own.link, site, p, { title: p.title, slug: p.slug, is_enabled: !!p.is_enabled, ...p.data }, { _form: e.key }), 413)
      throw e
    }
    const b = mp.fields
    const errors: Errors = {}
    const title = p.slug === '' ? '' : field(b, 'title').trim().slice(0, 60)
    const slug = p.slug === '' ? '' : field(b, 'slug').trim().toLowerCase()
    if (p.slug !== '') {
      if (!title) errors.title = 'err.required'
      if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) errors.slug = 'ms.err_slug'
    }
    const seo_image = await imageField(deps, user, mp, 'seo_image', p.data.seo_image, 1200, errors)
    const values = { title, slug, is_enabled: p.slug === '' ? true : checked(b, 'is_enabled'), seo_title: field(b, 'seo_title').trim().slice(0, 70), seo_description: field(b, 'seo_description').trim().slice(0, 200), seo_image }
    if (Object.keys(errors).length) return sendHtml(reply, pageEditPage(req.ctx, own.link, site, p, values, errors), 422)
    const res = updatePage(db, p.id, { slug, title, is_enabled: values.is_enabled, data: { seo_title: values.seo_title, seo_description: values.seo_description, seo_image } }, deps.now())
    if (res === 'taken') return sendHtml(reply, pageEditPage(req.ctx, own.link, site, p, values, { slug: 'ms.err_slug_taken' }), 422)
    setFlash(reply, deps, { type: 'ok', key: 'ms.page_saved' })
    return reply.redirect(`/panel/ms/pages/${p.id}`, 303)
  })

  app.post('/panel/ms/pages/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    const own = ownPage(req, reply)
    if (!own) return
    if (deletePage(db, own.page.id)) setFlash(reply, deps, { type: 'ok', key: 'ms.page_deleted' })
    return reply.redirect(`/panel/links/${own.link.id}/site`, 303)
  })

  app.post('/panel/ms/pages/:id/move', { preHandler: userGuard }, async (req, reply) => {
    const own = ownPage(req, reply)
    if (!own) return
    movePage(db, own.page.id, field(req.body, 'dir') === 'up' ? -1 : 1)
    return reply.redirect(`/panel/links/${own.link.id}/site`, 303)
  })

  app.post('/panel/ms/pages/:id/sections', { preHandler: userGuard }, async (req, reply) => {
    const own = ownPage(req, reply)
    if (!own) return
    const r = createSection(db, own.page.id, sectionDataSchema.parse({}), deps.now())
    if (r === 'limit') {
      setFlash(reply, deps, { type: 'error', key: 'ms.err_sections_limit_short' })
      return reply.redirect(`/panel/ms/pages/${own.page.id}`, 303)
    }
    return reply.redirect(`/panel/ms/sections/${r.id}`, 303)
  })

  // ---------------------------------------------------------------- Sección
  function ownSection(req: FastifyRequest, reply: FastifyReply) {
    const id = Number((req.params as { id: string }).id)
    const s = Number.isInteger(id) ? getOwnSection(db, id, (req.ctx.user as User).id) : undefined
    const link = s ? repoGetLink(db, s.link_id) : undefined
    if (!s || !link) {
      reply.callNotFound()
      return null
    }
    const site = loadSite(db, link.id)
    const pg = site.pages.find((x) => x.id === s.page_id)
    if (!pg) {
      reply.callNotFound()
      return null
    }
    return { s, link, page: pg }
  }

  app.get('/panel/ms/sections/:id', { preHandler: userGuard }, async (req, reply) => {
    const o = ownSection(req, reply)
    if (!o) return
    return sendHtml(reply, sectionEditPage(req.ctx, o.link, o.page, o.s, o.s.data, !!o.s.is_enabled))
  })

  app.post('/panel/ms/sections/:id', { preHandler: userGuard }, async (req, reply) => {
    const o = ownSection(req, reply)
    if (!o) return
    const user = req.ctx.user as User
    let mp: MultipartData
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) return sendHtml(reply, sectionEditPage(req.ctx, o.link, o.page, o.s, o.s.data, !!o.s.is_enabled, { _form: e.key }), 413)
      throw e
    }
    const { data, errors } = parseSection(mp.fields, o.s.data)
    const imagen = await imageField(deps, user, mp, 'imagen', o.s.data.imagen, 2000, errors)
    const enabled = checked(mp.fields, 'is_enabled')
    if (Object.keys(errors).length) return sendHtml(reply, sectionEditPage(req.ctx, o.link, o.page, o.s, { ...data, imagen }, enabled, errors), 422)
    updateSection(db, o.s.id, { ...data, imagen, classic: o.s.data.classic && !data.titulo && data.fondo === 'ninguno' && data.ancho === 'normal' && data.columnas === 1 && data.alto === 'auto' && !data.antetitulo && !data.subtitulo && !data.ancla ? true : false }, enabled, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'ms.section_saved' })
    return reply.redirect(`/panel/ms/pages/${o.page.id}`, 303)
  })

  app.post('/panel/ms/sections/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    const o = ownSection(req, reply)
    if (!o) return
    setFlash(reply, deps, deleteSection(db, o.s.id) ? { type: 'ok', key: 'ms.section_deleted' } : { type: 'error', key: 'ms.section_last' })
    return reply.redirect(`/panel/ms/pages/${o.page.id}`, 303)
  })

  app.post('/panel/ms/sections/:id/move', { preHandler: userGuard }, async (req, reply) => {
    const o = ownSection(req, reply)
    if (!o) return
    moveSection(db, o.s.id, field(req.body, 'dir') === 'up' ? -1 : 1)
    return reply.redirect(`/panel/ms/pages/${o.page.id}`, 303)
  })

  // ---------------------------------------------------------------- elegir bloque para una sección
  app.get('/panel/links/:id/blocks/pick', { preHandler: userGuard }, async (req, reply) => {
    const link = bioLink(req, reply)
    if (!link) return
    const sid = Number((req.query as { s?: string }).s)
    const site = loadSite(db, link.id)
    const section = site.sections.find((x) => x.id === sid)
    const page = section ? site.pages.find((p) => p.id === section.page_id) : undefined
    if (!section || !page) return reply.redirect(`/panel/links/${link.id}/blocks`, 303)
    const lim = limitsOf(db, req.ctx.user as User, deps.now())
    const locked = Object.entries(PLAN_GATED_BLOCKS).filter(([, f]) => !lim[f]).map(([type]) => type)
    const max = lim.blocks_per_page < 0 ? MAX_BLOCKS_PER_PAGE : Math.min(MAX_BLOCKS_PER_PAGE, lim.blocks_per_page)
    const n = sectionsOf(site, page.id).findIndex((x) => x.id === section.id) + 1
    return sendHtml(reply, blockPickerPage(req.ctx, link, page, section, section.data.titulo || req.ctx.t('ms.section_n', { n }), locked, countBlocks(db, link.id) >= max, max))
  })
}
