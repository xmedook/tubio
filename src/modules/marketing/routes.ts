import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html, type SafeHtml } from '../../lib/html.ts'
import { imageUrl, readMultipart, storeImage, UploadError, type MultipartData } from '../../lib/uploads.ts'
import { checkTarget } from '../../lib/urls.ts'
import { panelLayout } from '../../views/layout.ts'
import { csrfField, emptyState, input, postButton, select, textarea, type Errors } from '../../views/ui.ts'
import { sendHtml, setFlash, userGuard, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { limitsOf } from '../plans/limits.ts'
import type { User } from '../users/repo.ts'
import { listPixels, PIXEL_KINDS, validPixelId, type PixelKind } from './pixels.ts'

type Splash = { id: number; user_id: number; name: string; data: string; created_at: number }

function tabs(ctx: Ctx, active: 'pixels' | 'splashes'): SafeHtml {
  const { t } = ctx
  return html`<nav class="tabs"><a href="/panel/pixels"${active === 'pixels' ? html` aria-current="page"` : ''}>${t('mk.pixels')}</a><a href="/panel/splashes"${active === 'splashes' ? html` aria-current="page"` : ''}>${t('mk.splashes')}</a></nav>`
}

export function registerMarketing(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const me = (req: FastifyRequest) => req.ctx.user as User
  const allowed = (req: FastifyRequest) => limitsOf(db, me(req), deps.now()).marketing

  function locked(ctx: Ctx, reply: FastifyReply) {
    const { t } = ctx
    return sendHtml(reply, panelLayout(ctx, { title: t('mk.title'), active: 'links', path: '/panel/pixels', body: html`<h1>${t('mk.title')}</h1>${emptyState(t('mk.locked'), html`<a class="btn btn-primary" href="/panel/plan">${t('plan.see_plans')}</a>`)}` }))
  }

  function pixelsPage(ctx: Ctx, user: User, errors: Errors = {}, values: Record<string, string> = {}) {
    const { t } = ctx
    const list = listPixels(db, user.id)
    return panelLayout(ctx, {
      title: t('mk.pixels'),
      active: 'links',
      path: '/panel/pixels',
      body: html`<h1>${t('mk.title')}</h1>${tabs(ctx, 'pixels')}
<p class="muted">${t('mk.pixels_intro')}</p>
${list.length ? html`<ul class="list">${list.map((p) => html`<li><div class="grow"><div class="title">${p.name} <span class="tag">${t(`mk.px_${p.kind}`)}</span></div><div class="sub mono">${p.pixel_id}</div></div>
${postButton(ctx, `/panel/pixels/${p.id}/delete`, t('common.delete'), { cls: 'btn btn-sm btn-danger', confirm: t('mk.pixel_delete_confirm') })}</li>`)}</ul>` : emptyState(t('mk.no_pixels'), '')}
<form class="card" method="post" action="/panel/pixels" novalidate>${csrfField(ctx)}<h2>${t('mk.new_pixel')}</h2>
  <div class="grid-3">
    ${select({ ctx, name: 'kind', label: t('mk.pixel_kind'), value: values.kind ?? 'meta', options: PIXEL_KINDS.map((k) => ({ value: k, label: t(`mk.px_${k}`) })) })}
    ${input({ ctx, name: 'pixel_id', label: t('mk.pixel_id'), value: values.pixel_id, error: errors.pixel_id, required: true, maxlength: 60, hint: t('mk.pixel_id_hint') })}
    ${input({ ctx, name: 'name', label: t('notify.name'), value: values.name, error: errors.name, required: true, maxlength: 60 })}
  </div>
  <button class="btn btn-primary" type="submit">${t('common.save')}</button></form>`,
    })
  }

  app.get('/panel/pixels', { preHandler: userGuard }, async (req, reply) => (allowed(req) ? sendHtml(reply, pixelsPage(req.ctx, me(req))) : locked(req.ctx, reply)))

  app.post('/panel/pixels', { preHandler: userGuard }, async (req, reply) => {
    if (!allowed(req)) return locked(req.ctx, reply)
    const user = me(req)
    const kind = field(req.body, 'kind') as PixelKind
    const values = { kind, pixel_id: field(req.body, 'pixel_id').trim(), name: field(req.body, 'name').trim() }
    const errors: Errors = {}
    if (!(PIXEL_KINDS as readonly string[]).includes(kind)) errors.kind = 'err.invalid'
    else if (!validPixelId(kind, values.pixel_id)) errors.pixel_id = 'err.pixel_id'
    if (!values.name || values.name.length > 60) errors.name = 'err.required'
    if (listPixels(db, user.id).length >= 50) errors.name = 'err.too_many'
    if (Object.keys(errors).length) return sendHtml(reply, pixelsPage(req.ctx, user, errors, values), 422)
    db.prepare('INSERT INTO pixels (user_id, kind, name, pixel_id, created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, kind, values.name, values.pixel_id, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect('/panel/pixels', 303)
  })

  app.post('/panel/pixels/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    db.prepare('DELETE FROM pixels WHERE id = ? AND user_id = ?').run(Number((req.params as { id: string }).id), me(req).id)
    return reply.redirect('/panel/pixels', 303)
  })

  // ---------- splash ----------
  const parseData = (s: Splash): Record<string, string | number> => {
    try {
      return JSON.parse(s.data)
    } catch {
      return {}
    }
  }

  function splashPage(ctx: Ctx, user: User, edit?: Splash, errors: Errors = {}) {
    const { t } = ctx
    const list = db.prepare('SELECT * FROM splashes WHERE user_id = ? ORDER BY name').all(user.id) as Splash[]
    const d = edit ? parseData(edit) : {}
    const v = (k: string) => (d[k] === undefined ? '' : String(d[k]))
    const action = edit ? `/panel/splashes/${edit.id}` : '/panel/splashes'
    return panelLayout(ctx, {
      title: t('mk.splashes'),
      active: 'links',
      path: '/panel/splashes',
      body: html`<h1>${t('mk.title')}</h1>${tabs(ctx, 'splashes')}
<p class="muted">${t('mk.splash_intro')}</p>
${list.length ? html`<ul class="list">${list.map((s) => html`<li><div class="grow"><div class="title">${s.name}</div></div><a class="btn btn-sm" href="/panel/splashes/${s.id}">${t('common.edit')}</a>
${postButton(ctx, `/panel/splashes/${s.id}/delete`, t('common.delete'), { cls: 'btn btn-sm btn-danger', confirm: t('mk.splash_delete_confirm') })}</li>`)}</ul>` : ''}
<form class="card" method="post" action="${action}?_csrf=${encodeURIComponent(ctx.csrf)}" enctype="multipart/form-data" novalidate>
  <h2>${edit ? edit.name : t('mk.new_splash')}</h2>
  ${input({ ctx, name: 'name', label: t('notify.name'), value: edit?.name, error: errors.name, required: true, maxlength: 60 })}
  ${input({ ctx, name: 'title', label: t('bio.f.title'), value: v('title'), maxlength: 120 })}
  ${textarea({ ctx, name: 'text', label: t('bio.f.text'), value: v('text'), maxlength: 600, rows: 3 })}
  <div class="grid-2">
    ${input({ ctx, name: 'seconds', type: 'number', label: t('mk.seconds'), value: v('seconds') || '5', min: 0, max: 30 })}
    ${input({ ctx, name: 'button', label: t('bio.f.button_label'), value: v('button'), maxlength: 40 })}
  </div>
  <div class="img-field">${d.image ? html`<img class="img-preview" src="${imageUrl(String(d.image))}" alt="">` : ''}${input({ ctx, name: 'image', type: 'file', label: t('bio.f.image'), error: errors.image, accept: 'image/*' })}</div>
  <div class="img-field">${d.ad_image ? html`<img class="img-preview" src="${imageUrl(String(d.ad_image))}" alt="">` : ''}${input({ ctx, name: 'ad_image', type: 'file', label: t('mk.ad_image'), error: errors.ad_image, accept: 'image/*' })}</div>
  ${input({ ctx, name: 'ad_url', type: 'url', label: t('mk.ad_url'), value: v('ad_url'), error: errors.ad_url, placeholder: 'https://' })}
  <button class="btn btn-primary" type="submit">${t('common.save')}</button>
</form>`,
    })
  }

  async function saveSplash(req: FastifyRequest, reply: FastifyReply, edit?: Splash) {
    const user = me(req)
    let mp: MultipartData
    try {
      mp = await readMultipart(req)
    } catch (e) {
      return sendHtml(reply, splashPage(req.ctx, user, edit, { image: e instanceof UploadError ? e.key : 'err.invalid' }), 413)
    }
    const b = mp.fields
    const errors: Errors = {}
    const name = field(b, 'name').trim().slice(0, 60)
    if (!name) errors.name = 'err.required'
    const data: Record<string, string | number> = edit ? parseData(edit) : {}
    data.title = field(b, 'title').trim().slice(0, 120)
    data.text = field(b, 'text').trim().slice(0, 600)
    data.button = field(b, 'button').trim().slice(0, 40)
    data.seconds = Math.max(0, Math.min(30, Number(field(b, 'seconds')) || 0))
    const adUrl = field(b, 'ad_url').trim()
    if (adUrl) {
      const r = checkTarget(db, adUrl)
      if (!r.ok) errors.ad_url = r.error
      else data.ad_url = r.url
    } else data.ad_url = ''
    for (const k of ['image', 'ad_image'] as const) {
      const up = mp.files.find((f) => f.field === k)
      if (up && !Object.keys(errors).length) {
        try {
          data[k] = (await storeImage(deps, user.id, up.buffer, up.filename, { maxDim: 1200 })).key
        } catch (e) {
          errors[k] = e instanceof UploadError ? e.key : 'err.upload_not_image'
        }
      }
    }
    if (Object.keys(errors).length) return sendHtml(reply, splashPage(req.ctx, user, edit, errors), 422)
    if (edit) db.prepare('UPDATE splashes SET name = ?, data = ? WHERE id = ?').run(name, JSON.stringify(data), edit.id)
    else db.prepare('INSERT INTO splashes (user_id, name, data, created_at) VALUES (?, ?, ?, ?)').run(user.id, name, JSON.stringify(data), deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect('/panel/splashes', 303)
  }

  const ownSplash = (req: FastifyRequest) => db.prepare('SELECT * FROM splashes WHERE id = ? AND user_id = ?').get(Number((req.params as { id: string }).id), me(req).id) as Splash | undefined

  app.get('/panel/splashes', { preHandler: userGuard }, async (req, reply) => (allowed(req) ? sendHtml(reply, splashPage(req.ctx, me(req))) : locked(req.ctx, reply)))
  app.post('/panel/splashes', { preHandler: userGuard }, async (req, reply) => (allowed(req) ? saveSplash(req, reply) : locked(req.ctx, reply)))
  app.get('/panel/splashes/:id', { preHandler: userGuard }, async (req, reply) => {
    const s = ownSplash(req)
    if (!s) return reply.callNotFound()
    return sendHtml(reply, splashPage(req.ctx, me(req), s))
  })
  app.post('/panel/splashes/:id', { preHandler: userGuard }, async (req, reply) => {
    const s = ownSplash(req)
    if (!s) return reply.callNotFound()
    if (!allowed(req)) return locked(req.ctx, reply)
    return saveSplash(req, reply, s)
  })
  app.post('/panel/splashes/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    const s = ownSplash(req)
    if (!s) return reply.callNotFound()
    db.prepare('DELETE FROM splashes WHERE id = ?').run(s.id)
    return reply.redirect('/panel/splashes', 303)
  })
}
