import { readFileSync } from 'node:fs'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import sharp from 'sharp'
import type { AppDeps } from '../../app.ts'
import { html, raw, type SafeHtml } from '../../lib/html.ts'
import { parseQrStyle, qrStyleSchema, rasterizeSvg, renderQrSvg, type QrStyle } from '../../lib/qr.ts'
import { findFile, readMultipart, storeImage, uploadPath, UploadError, type MultipartData } from '../../lib/uploads.ts'
import { panelLayout } from '../../views/layout.ts'
import { checkbox, emptyState, input, postButton, select, textarea, type Errors, type Option } from '../../views/ui.ts'
import { sendHtml, setFlash, userGuard, type Ctx } from '../../web/context.ts'
import { checked, field } from '../../web/forms.ts'
import { getOwnLink, linkUrl, listLinks } from '../links/repo.ts'
import { listProjects, getOwnProject, type Project } from '../projects/repo.ts'
import type { User } from '../users/repo.ts'
import { limitsOf, usageOf, withinLimit } from '../plans/limits.ts'
import { buildPayload, payloadText, QR_FIELDS, QR_KINDS, type QrKind } from './payload.ts'

export type QrRow = {
  id: number
  user_id: number
  project_id: number | null
  name: string
  kind: QrKind
  data: Record<string, unknown>
  style: QrStyle
  logo_file_id: number | null
  link_id: number | null
  created_at: number
  updated_at: number
}

type Raw = Omit<QrRow, 'data' | 'style'> & { data: string; style: string }
const hydrate = (r: Raw): QrRow => {
  let data = {}
  let style = {}
  try {
    data = JSON.parse(r.data)
    style = JSON.parse(r.style)
  } catch {
    /* corrupto: por defecto */
  }
  return { ...r, data, style: parseQrStyle(style) }
}

const isKind = (v: unknown): v is QrKind => typeof v === 'string' && (QR_KINDS as readonly string[]).includes(v)

// --- logo: PNG en data: URI (librsvg no siempre lee WEBP embebido) ---
const logoCache = new Map<number, string>()
async function logoDataUri(deps: AppDeps, fileId: number | null): Promise<string | null> {
  if (!fileId) return null
  const hit = logoCache.get(fileId)
  if (hit) return hit
  const f = findFile(deps, fileId)
  if (!f) return null
  try {
    const png = await sharp(readFileSync(uploadPath(deps, f.key))).png().toBuffer()
    const uri = 'data:image/png;base64,' + png.toString('base64')
    if (logoCache.size > 200) logoCache.clear()
    logoCache.set(fileId, uri)
    return uri
  } catch {
    return null
  }
}

function styleFromForm(b: MultipartData['fields']): QrStyle {
  const f = (k: string) => field(b, k)
  const raw: Record<string, unknown> = {}
  for (const k of Object.keys(qrStyleSchema.shape)) {
    if (k === 'bgTransparent') raw[k] = checked(b, k)
    else if (k === 'eyeColor') raw[k] = checked(b, 'eyeColor__same') ? null : f(k).toLowerCase() || null
    else if (f(k) !== '') raw[k] = ['fg', 'fg2', 'bg', 'frameColor'].includes(k) ? f(k).toLowerCase() : f(k)
  }
  return parseQrStyle(raw)
}

type FormState = { name: string; kind: QrKind; project_id: string; values: Record<string, string>; style: QrStyle; logoFileId: number | null }

function stateFromRow(q: QrRow): FormState {
  const values: Record<string, string> = {}
  for (const [k, v] of Object.entries(q.data)) values[k] = typeof v === 'boolean' ? (v ? '1' : '') : String(v ?? '')
  return { name: q.name, kind: q.kind, project_id: q.project_id ? String(q.project_id) : '', values, style: q.style, logoFileId: q.logo_file_id }
}

function kindFieldsHtml(ctx: Ctx, kind: QrKind, v: Record<string, string>, e: Errors, linkOptions: Option[]): SafeHtml {
  const { t } = ctx
  return html`${QR_FIELDS[kind].map((f) => {
    const label = t(`qr.f.${f.name}`)
    if (f.type === 'link') return select({ ctx, name: f.name, label, value: v[f.name], error: e[f.name], options: linkOptions, hint: t('qr.dynamic_hint') })
    if (f.type === 'textarea') return textarea({ ctx, name: f.name, label, value: v[f.name], error: e[f.name], maxlength: f.max, rows: 3 })
    if (f.type === 'select') return select({ ctx, name: f.name, label, value: v[f.name], options: (f.options ?? []).map((o) => ({ value: o, label: t(`qr.o.${o}`) })) })
    if (f.type === 'checkbox') return checkbox({ name: f.name, label, checked: !!v[f.name] })
    return input({ ctx, name: f.name, label, value: v[f.name], error: e[f.name], required: f.required, maxlength: f.max, placeholder: f.placeholder, inputmode: f.type === 'number' ? 'decimal' : undefined })
  })}`
}

function formPage(ctx: Ctx, deps: AppDeps, user: User, st: FormState, errors: Errors, qr?: QrRow, previewSvg?: string): SafeHtml {
  const { t } = ctx
  const s = st.style
  const links = listLinks(deps.db, user.id, { limit: 500 }).items
  const linkOptions: Option[] = [{ value: '', label: t('qr.choose_link') }, ...links.map((l) => ({ value: String(l.id), label: `${l.title || l.alias} — /${l.alias}` }))]
  const projects: Project[] = listProjects(deps.db, user.id)
  const opt = (name: string, vals: readonly string[]) => vals.map((v) => ({ value: v, label: t(`qr.s.${name}.${v}`) }))
  const action = qr ? `/panel/qr/${qr.id}` : `/panel/qr`
  return panelLayout(ctx, {
    title: qr ? qr.name : t('qr.new'),
    active: 'qr',
    path: qr ? `/panel/qr/${qr.id}` : '/panel/qr/new',
    wide: true,
    head: html`<script type="module" src="/_/static/js/qr.js" nonce="${ctx.nonce}"></script>`,
    body: html`<h1>${qr ? qr.name : t('qr.new')}</h1>
${!qr ? html`<nav class="tabs kinds" aria-label="${t('qr.kind')}">${QR_KINDS.map((k) => html`<a href="/panel/qr/new?kind=${k}"${k === st.kind ? html` aria-current="page"` : ''}>${t(`qr.kind_${k}`)}</a>`)}</nav>` : ''}
${Object.keys(errors).length ? html`<p class="flash flash-error" role="alert">${t('err.form')}</p>` : ''}
<div class="editor qr-editor">
<section class="editor-main">
<form method="post" action="${action}?kind=${st.kind}&_csrf=${encodeURIComponent(ctx.csrf)}" enctype="multipart/form-data" novalidate data-qr-form data-preview-url="/panel/qr/preview?kind=${st.kind}&_csrf=${encodeURIComponent(ctx.csrf)}">
  <div class="card">
    <div class="grid-2">
      ${input({ ctx, name: 'name', label: t('qr.name'), value: st.name, error: errors.name, required: true, maxlength: 80 })}
      ${projects.length ? select({ ctx, name: 'project_id', label: t('nav.projects'), value: st.project_id, options: [{ value: '', label: t('links.no_project') }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))] }) : html`<input type="hidden" name="project_id" value="${st.project_id ?? ''}">`}
    </div>
    <h2>${t(`qr.kind_${st.kind}`)}</h2>
    ${kindFieldsHtml(ctx, st.kind, st.values, errors, linkOptions)}
  </div>
  <details class="opt" open><summary>${t('qr.colors')}</summary><div class="opt-body">
    <div class="grid-3">
      ${input({ ctx, name: 'fg', type: 'color', label: t('qr.fg'), value: s.fg })}
      ${select({ ctx, name: 'gradient', label: t('qr.gradient'), value: s.gradient, options: opt('gradient', ['none', 'linear', 'radial']) })}
      ${input({ ctx, name: 'fg2', type: 'color', label: t('qr.fg2'), value: s.fg2 })}
      ${input({ ctx, name: 'gradientAngle', type: 'number', label: t('qr.angle'), value: s.gradientAngle, min: 0, max: 360 })}
      ${input({ ctx, name: 'bg', type: 'color', label: t('qr.bg'), value: s.bg })}
    </div>
    ${checkbox({ name: 'bgTransparent', label: t('qr.transparent'), checked: s.bgTransparent })}
  </div></details>
  <details class="opt" open><summary>${t('qr.shapes')}</summary><div class="opt-body">
    <div class="grid-3">
      ${select({ ctx, name: 'modules', label: t('qr.modules'), value: s.modules, options: opt('modules', ['square', 'rounded', 'dot', 'diamond', 'vertical', 'horizontal']) })}
      ${select({ ctx, name: 'eyeOuter', label: t('qr.eye_outer'), value: s.eyeOuter, options: opt('eyeOuter', ['square', 'rounded', 'circle', 'leaf']) })}
      ${select({ ctx, name: 'eyeInner', label: t('qr.eye_inner'), value: s.eyeInner, options: opt('eyeInner', ['square', 'rounded', 'circle', 'diamond']) })}
    </div>
    <div class="color-opt">
      ${input({ ctx, name: 'eyeColor', type: 'color', label: t('qr.eye_color'), value: s.eyeColor ?? s.fg })}
      ${checkbox({ name: 'eyeColor__same', label: t('qr.eye_same'), checked: s.eyeColor === null })}
    </div>
  </div></details>
  <details class="opt"><summary>${t('qr.logo_frame')}</summary><div class="opt-body">
    <div class="img-field">
      ${st.logoFileId ? html`<span class="muted">${t('qr.has_logo')}</span>` : ''}
      ${input({ ctx, name: 'logo', type: 'file', label: st.logoFileId ? t('bio.f.replace_image') : t('qr.logo'), error: errors.logo, accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif' })}
      ${st.logoFileId ? checkbox({ name: 'logo__remove', label: t('bio.f.remove_image') }) : ''}
    </div>
    ${input({ ctx, name: 'logoSize', type: 'range', label: t('qr.logo_size'), value: s.logoSize, min: 10, max: 30 })}
    <div class="grid-3">
      ${select({ ctx, name: 'frame', label: t('qr.frame'), value: s.frame, options: opt('frame', ['none', 'label']) })}
      ${input({ ctx, name: 'frameText', label: t('qr.frame_text'), value: s.frameText, maxlength: 40 })}
      ${input({ ctx, name: 'frameColor', type: 'color', label: t('qr.frame_color'), value: s.frameColor })}
    </div>
  </div></details>
  <details class="opt"><summary>${t('qr.advanced')}</summary><div class="opt-body">
    <div class="grid-3">
      ${select({ ctx, name: 'ecc', label: t('qr.ecc'), value: s.ecc, options: opt('ecc', ['L', 'M', 'Q', 'H']), hint: t('qr.ecc_hint') })}
      ${input({ ctx, name: 'margin', type: 'number', label: t('qr.margin'), value: s.margin, min: 0, max: 10 })}
      ${input({ ctx, name: 'size', type: 'number', label: t('qr.size'), value: s.size, min: 128, max: 2048, step: 32 })}
    </div>
  </div></details>
  <div class="btn-row sticky-actions">
    <button class="btn btn-primary" type="submit">${qr ? t('common.save') : t('qr.create')}</button>
    <button class="btn" type="submit" name="_preview" value="1" data-preview-btn>${t('qr.preview')}</button>
    <a class="btn" href="/panel/qr">${t('common.cancel')}</a>
  </div>
</form>
</section>
<aside class="editor-preview qr-side" aria-live="polite">
  <div class="qr-preview card" data-qr-preview>${previewSvg ? raw(previewSvg) : qr ? html`<img src="/panel/qr/${qr.id}/download.svg?inline=1&v=${qr.updated_at}" alt="${t('qr.preview')}">` : html`<p class="muted">${t('qr.preview_empty')}</p>`}</div>
  ${qr
    ? html`<div class="btn-row center-row">${(['svg', 'png', 'jpg', 'webp'] as const).map((f) => html`<a class="btn btn-sm" href="/panel/qr/${qr.id}/download.${f}" download>${f.toUpperCase()}</a>`)}</div>
      <div class="card danger-zone">${postButton(ctx, `/panel/qr/${qr.id}/delete`, t('qr.delete'), { cls: 'btn btn-danger btn-sm', confirm: t('qr.delete_confirm') })}</div>`
    : ''}
</aside>
</div>`,
  })
}

export function registerQr(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const urlOfLink = (userId: number) => (id: number) => {
    const l = getOwnLink(db, id, userId)
    return l ? linkUrl(deps.config.baseUrl, l) : null
  }

  function ownQr(req: FastifyRequest, reply: FastifyReply): QrRow | null {
    const id = Number((req.params as { id: string }).id)
    const r = Number.isInteger(id) ? (db.prepare('SELECT * FROM qr_codes WHERE id = ? AND user_id = ?').get(id, (req.ctx.user as User).id) as Raw | undefined) : undefined
    if (!r) {
      reply.callNotFound()
      return null
    }
    return hydrate(r)
  }

  /** Valida el formulario. Devuelve el estado (para repintar) y, si todo bien, lo que se guarda. */
  async function parse(user: User, kind: QrKind, mp: MultipartData, current: QrRow | undefined, persistLogo: boolean) {
    const b = mp.fields
    const errors: Errors = {}
    const values: Record<string, string> = {}
    for (const f of QR_FIELDS[kind]) values[f.name] = field(b, f.name)
    const name = field(b, 'name').trim()
    if (!name) errors.name = 'err.required'
    else if (name.length > 80) errors.name = 'err.too_long'
    const style = styleFromForm(b)
    const p = buildPayload(kind, values)
    let text = ''
    let data: Record<string, unknown> = {}
    let linkId: number | null = null
    if (!p.ok) Object.assign(errors, p.errors)
    else {
      data = p.data
      text = p.text
      if (kind === 'link') {
        const url = urlOfLink(user.id)(Number(data.link_id))
        if (!url) errors.link_id = 'err.required'
        else {
          text = url
          linkId = Number(data.link_id)
        }
      }
    }
    let logoFileId = checked(b, 'logo__remove') ? null : (current?.logo_file_id ?? null)
    const up = mp.files.find((x) => x.field === 'logo')
    let logoUri: string | null = null
    if (up && !Object.keys(errors).length) {
      if (persistLogo) {
        try {
          logoFileId = (await storeImage(deps, user.id, up.buffer, up.filename, { maxDim: 256 })).id
        } catch (e) {
          errors.logo = e instanceof UploadError ? e.key : 'err.upload_not_image'
        }
      } else {
        // vista previa: no se guarda nada
        try {
          logoUri = 'data:image/png;base64,' + (await sharp(up.buffer, { limitInputPixels: 50_000_000 }).resize(256, 256, { fit: 'inside' }).png().toBuffer()).toString('base64')
        } catch {
          errors.logo = 'err.upload_not_image'
        }
      }
    }
    const projectId = field(b, 'project_id') && getOwnProject(db, Number(field(b, 'project_id')), user.id) ? Number(field(b, 'project_id')) : null
    const state: FormState = { name, kind, project_id: projectId ? String(projectId) : '', values, style, logoFileId }
    return { errors, state, text, data, linkId, logoUri: logoUri ?? (await logoDataUri(deps, logoFileId)) }
  }

  app.get('/panel/qr', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    const { t } = req.ctx
    const rows = (db.prepare('SELECT * FROM qr_codes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200').all(user.id) as Raw[]).map(hydrate)
    return sendHtml(reply, panelLayout(req.ctx, {
      title: t('nav.qr'),
      active: 'qr',
      path: '/panel/qr',
      body: html`<div class="page-head"><h1>${t('nav.qr')}</h1><a class="btn btn-primary" href="/panel/qr/new">${t('qr.new')}</a></div>
${rows.length === 0
  ? emptyState(t('qr.empty'), html`<p class="muted">${t('qr.empty_body')}</p><a class="btn btn-primary" href="/panel/qr/new">${t('qr.new')}</a>`)
  : html`<ul class="qr-grid">${rows.map((q) => html`<li class="card"><a href="/panel/qr/${q.id}" class="qr-thumb"><img src="/panel/qr/${q.id}/download.svg?inline=1&v=${q.updated_at}" alt="" loading="lazy"></a>
      <div class="title">${q.name}</div><div class="sub">${t(`qr.kind_${q.kind}`)}${q.kind === 'link' ? html` · <span class="tag">${t('qr.dynamic')}</span>` : ''}</div>
      <div class="btn-row"><a class="btn btn-sm" href="/panel/qr/${q.id}">${t('common.edit')}</a><a class="btn btn-sm" href="/panel/qr/${q.id}/download.png" download>PNG</a><a class="btn btn-sm" href="/panel/qr/${q.id}/download.svg" download>SVG</a></div></li>`)}</ul>`}`,
    }))
  })

  app.get('/panel/qr/new', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    const q = req.query as { kind?: string; link?: string }
    let kind: QrKind = isKind(q.kind) ? q.kind : 'url'
    const values: Record<string, string> = {}
    let name = ''
    if (q.link) {
      const l = getOwnLink(db, Number(q.link), user.id)
      if (l) {
        kind = 'link'
        values.link_id = String(l.id)
        name = l.title || l.alias
      }
    }
    return sendHtml(reply, formPage(req.ctx, deps, user, { name, kind, project_id: '', values, style: parseQrStyle({}), logoFileId: null }, {}))
  })

  async function save(req: FastifyRequest, reply: FastifyReply, current?: QrRow) {
    const user = req.ctx.user as User
    const kind = current?.kind ?? ((req.query as { kind?: string }).kind as QrKind)
    if (!isKind(kind)) return reply.code(400).send('kind')
    if (!current) {
      const lim = limitsOf(db, user, deps.now())
      if (!withinLimit(lim.qr, usageOf(db, user.id).qr)) {
        setFlash(reply, deps, { type: 'error', key: 'err.plan_qr', vars: { n: lim.qr } })
        return reply.redirect('/panel/plan', 303)
      }
    }
    let mp: MultipartData
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) {
        const st = current ? stateFromRow(current) : { name: '', kind, project_id: '', values: {}, style: parseQrStyle({}), logoFileId: null }
        return sendHtml(reply, formPage(req.ctx, deps, user, st, { logo: e.key }, current), 413)
      }
      throw e
    }
    const previewOnly = field(mp.fields, '_preview') === '1'
    const r = await parse(user, kind, mp, current, !previewOnly)
    if (Object.keys(r.errors).length) return sendHtml(reply, formPage(req.ctx, deps, user, r.state, r.errors, current), 422)
    if (previewOnly) return sendHtml(reply, formPage(req.ctx, deps, user, r.state, {}, current, renderQrSvg(r.text, r.state.style, { logoDataUri: r.logoUri })))
    const now = deps.now()
    const row = {
      name: r.state.name,
      kind,
      project_id: r.state.project_id ? Number(r.state.project_id) : null,
      data: JSON.stringify(r.data),
      style: JSON.stringify(r.state.style),
      logo_file_id: r.state.logoFileId,
      link_id: r.linkId,
    }
    let id = current?.id
    if (current) {
      db.prepare('UPDATE qr_codes SET name=@name, project_id=@project_id, data=@data, style=@style, logo_file_id=@logo_file_id, link_id=@link_id, updated_at=@now WHERE id=@id').run({ ...row, now, id })
    } else {
      id = Number(db.prepare('INSERT INTO qr_codes (user_id, name, kind, project_id, data, style, logo_file_id, link_id, created_at, updated_at) VALUES (@user_id, @name, @kind, @project_id, @data, @style, @logo_file_id, @link_id, @now, @now)').run({ ...row, user_id: user.id, now }).lastInsertRowid)
    }
    setFlash(reply, deps, { type: 'ok', key: current ? 'account.saved' : 'qr.created' })
    return reply.redirect(`/panel/qr/${id}`, 303)
  }

  app.post('/panel/qr', { preHandler: userGuard }, async (req, reply) => save(req, reply))

  app.get('/panel/qr/:id', { preHandler: userGuard }, async (req, reply) => {
    const q = ownQr(req, reply)
    if (!q) return
    return sendHtml(reply, formPage(req.ctx, deps, req.ctx.user as User, stateFromRow(q), {}, q))
  })

  app.post('/panel/qr/:id', { preHandler: userGuard }, async (req, reply) => {
    const q = ownQr(req, reply)
    if (!q) return
    return save(req, reply, q)
  })

  app.post('/panel/qr/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    const q = ownQr(req, reply)
    if (!q) return
    db.prepare('DELETE FROM qr_codes WHERE id = ?').run(q.id)
    setFlash(reply, deps, { type: 'ok', key: 'qr.deleted' })
    return reply.redirect('/panel/qr', 303)
  })

  // vista previa en vivo (JS): devuelve el SVG o 422 con los errores
  app.post('/panel/qr/preview', { preHandler: userGuard, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const user = req.ctx.user as User
    const kind = (req.query as { kind?: string }).kind
    if (!isKind(kind)) return reply.code(400).send('kind')
    const mp = await readMultipart(req)
    mp.fields.name ||= 'preview'
    const r = await parse(user, kind, mp, undefined, false)
    if (Object.keys(r.errors).length) return reply.code(422).send({ errors: r.errors })
    reply.header('Cache-Control', 'no-store')
    return reply.type('image/svg+xml').send(renderQrSvg(r.text, r.state.style, { logoDataUri: r.logoUri }))
  })

  app.get('/panel/qr/:id/download.:fmt', { preHandler: userGuard }, async (req, reply) => {
    const q = ownQr(req, reply)
    if (!q) return
    const fmt = (req.params as { fmt: string }).fmt
    if (!['svg', 'png', 'jpg', 'webp'].includes(fmt)) return reply.callNotFound()
    const text = payloadText(q.kind, q.data, urlOfLink(q.user_id))
    if (!text) return reply.callNotFound()
    const svg = renderQrSvg(text, q.style, { logoDataUri: await logoDataUri(deps, q.logo_file_id) })
    const inline = (req.query as { inline?: string }).inline === '1'
    const file = `${q.name.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'qr'}.${fmt}`
    if (!inline) reply.header('Content-Disposition', `attachment; filename="${file}"`)
    reply.header('Cache-Control', 'private, max-age=60')
    if (fmt === 'svg') {
      reply.header('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'")
      return reply.type('image/svg+xml').send(svg)
    }
    const buf = await rasterizeSvg(svg, fmt as 'png' | 'jpg' | 'webp', q.style.size, q.style.bgTransparent ? '#ffffff' : q.style.bg)
    return reply.type(fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`).send(buf)
  })
}
