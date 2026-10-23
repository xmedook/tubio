import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { aliasError, normalizeAlias } from '../../lib/alias.ts'
import { html } from '../../lib/html.ts'
import { readMultipart, storeImage, UploadError } from '../../lib/uploads.ts'
import { checkTarget } from '../../lib/urls.ts'
import { icon } from '../../views/icons.ts'
import { panelLayout } from '../../views/layout.ts'
import { input } from '../../views/ui.ts'
import { sendHtml, userGuard, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { actorOf } from '../auth/routes.ts'
import { defaultBioData, themeById } from '../bio/design.ts'
import { createBlock } from '../bio/repo.ts'
import { normalizeSocial } from '../bio/socials.ts'
import { aliasTaken, createLink, getOwnLink, linkUrl } from '../links/repo.ts'
import { dailyCapHit, limitsOf, usageOf, withinLimit } from '../plans/limits.ts'
import { audit, getSetting } from '../settings/repo.ts'
import type { User } from '../users/repo.ts'
import { getUsableTemplate, listTemplates, type TemplateBlock } from './repo.ts'

/** Primer uso: de registrarse a página publicada en un solo paso, y luego a compartirla */
function startPage(ctx: Ctx, opts: { tpls: { id: number; name: string; theme: string }[]; values: Record<string, string>; errors: Record<string, string>; full?: boolean }) {
  const { t } = ctx
  const v = opts.values
  const host = new URL(ctx.baseUrl).host
  return panelLayout(ctx, {
    title: t('start.title'),
    active: 'links',
    path: '/panel/start',
    body: html`<h1>${t('start.title')}</h1><p class="muted">${t('start.lead')}</p>
${opts.full ? html`<p class="flash flash-error" role="alert">${t('err.plan_bio_pages')} <a href="/panel/plan">${t('plan.see_plans')}</a></p>` : ''}
${opts.errors._form ? html`<p class="flash flash-error" role="alert">${t(opts.errors._form)}</p>` : ''}
<form method="post" action="/panel/start?_csrf=${encodeURIComponent(ctx.csrf)}" enctype="multipart/form-data" novalidate class="start">
  <fieldset class="start-step"><legend><span class="p-n">1</span> ${t('start.s1')}</legend>
    <div class="start-tpls">
      ${opts.tpls.map((tp) => {
        const th = themeById(tp.theme)
        return html`<label class="start-tpl"><input type="radio" name="tpl" value="${tp.id}"${v.tpl === String(tp.id) ? html` checked` : ''}><span class="tpl-sw" style="background:${th.bg}" aria-hidden="true"><span style="background:${th.btnBg}"></span><span style="background:${th.btnBg}"></span><span style="background:${th.btnBg}"></span></span><span>${tp.name}</span></label>`
      })}
      <label class="start-tpl"><input type="radio" name="tpl" value=""${!v.tpl ? html` checked` : ''}><span class="tpl-sw blank" aria-hidden="true">${icon('plus')}</span><span>${t('start.blank')}</span></label>
    </div>
  </fieldset>
  <fieldset class="start-step"><legend><span class="p-n">2</span> ${t('start.s2')}</legend>
    <div class="field${opts.errors.alias ? ' has-error' : ''}"><label for="st-alias">${t('claim.title')}</label>
      <div class="r-fila"><span class="r-host" aria-hidden="true">${host}/</span><input id="st-alias" name="alias" value="${v.alias ?? ''}" required minlength="3" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t('h2.claim_ph')}"${opts.errors.alias ? html` aria-invalid="true" aria-describedby="st-alias-e"` : ''}></div>
      ${opts.errors.alias ? html`<p class="error" id="st-alias-e">${t(opts.errors.alias)}</p>` : ''}</div>
    ${input({ ctx, name: 'name', label: t('start.name'), value: v.name, required: true, maxlength: 120, error: opts.errors.name, autocomplete: 'organization' })}
    ${input({ ctx, name: 'whatsapp', type: 'tel', label: t('start.whatsapp'), value: v.whatsapp, hint: t('start.whatsapp_hint'), error: opts.errors.whatsapp, inputmode: 'tel', autocomplete: 'tel' })}
    ${input({ ctx, name: 'instagram', label: 'Instagram', value: v.instagram, placeholder: '@tunegocio', error: opts.errors.instagram, autocomplete: 'off' })}
    ${input({ ctx, name: 'photo', type: 'file', label: t('start.photo'), hint: t('start.photo_hint'), error: opts.errors.photo, accept: 'image/png,image/jpeg,image/webp' })}
  </fieldset>
  <div class="sticky-actions btn-row"><button class="btn btn-primary btn-lg" type="submit">${t('start.go')}</button></div>
</form>`,
  })
}

function donePage(ctx: Ctx, opts: { id: number; url: string; name: string }) {
  const { t } = ctx
  const share = `https://wa.me/?text=${encodeURIComponent(`${opts.name}: ${opts.url}`)}`
  return panelLayout(ctx, {
    title: t('start.done'),
    active: 'links',
    path: '/panel/start/done',
    body: html`<section class="start-done"><span class="p-n big" aria-hidden="true">✓</span><h1>${t('start.done')}</h1><p class="lead">${t('start.done_lead')}</p>
<p class="start-url"><a href="${opts.url}" target="_blank" rel="noopener">${opts.url.replace(/^https?:\/\//, '')}</a></p>
<div class="start-actions">
  <button type="button" class="btn btn-primary btn-lg" data-copy="${opts.url}" data-copied="${t('links.copied')}">${icon('copy')} ${t('links.copy')}</button>
  <a class="btn btn-lg" href="${share}" target="_blank" rel="noopener">${icon('chat')} ${t('start.share_wa')}</a>
  <a class="btn btn-lg" href="/panel/qr/new?link=${opts.id}">${icon('qr')} ${t('start.qr')}</a>
  <a class="btn btn-lg" href="/panel/links/${opts.id}/blocks">${icon('edit')} ${t('start.keep_editing')}</a>
</div>
<p class="hint">${t('start.done_hint')}</p></section>`,
  })
}

export function registerStart(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const tpls = (u: User) => listTemplates(db, u.id).filter((x) => !x.user_id).slice(0, 6).map((x) => ({ id: x.id, name: x.name, theme: String(x.design.theme ?? 'nube') }))
  const full = (u: User) => !withinLimit(limitsOf(db, u, deps.now()).bio_pages, usageOf(db, u.id).bio_pages)

  app.get('/panel/start', { preHandler: userGuard }, async (req, reply) => {
    const u = req.ctx.user as User
    const q = req.query as { alias?: string }
    const alias = normalizeAlias(String(q.alias ?? '')).slice(0, 60)
    return sendHtml(reply, startPage(req.ctx, { tpls: tpls(u), values: { alias: aliasError(alias) ? '' : alias, name: u.name ?? '' }, errors: {}, full: full(u) }))
  })

  app.post('/panel/start', { preHandler: userGuard, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = req.ctx.user as User
    let mp
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) return sendHtml(reply, startPage(req.ctx, { tpls: tpls(u), values: {}, errors: { photo: e.key } }), 413)
      throw e
    }
    const f = (k: string) => field(mp.fields, k).trim()
    const values = { tpl: f('tpl'), alias: f('alias'), name: f('name').slice(0, 120), whatsapp: f('whatsapp'), instagram: f('instagram') }
    const errors: Record<string, string> = {}
    if (full(u)) return sendHtml(reply, startPage(req.ctx, { tpls: tpls(u), values, errors: {}, full: true }), 402)
    if (dailyCapHit(db, u, deps.now())) errors._form = 'err.daily_cap'
    const alias = normalizeAlias(values.alias).slice(0, 60)
    const ae = aliasError(alias) ?? (aliasTaken(db, alias) ? 'err.alias_taken' : null)
    if (ae) errors.alias = ae
    if (!values.name) errors.name = 'err.required'
    const wa = values.whatsapp.replace(/[^\d]/g, '')
    if (values.whatsapp && (wa.length < 10 || wa.length > 15)) errors.whatsapp = 'err.phone'
    const waNum = wa.length === 10 ? `52${wa}` : wa // número de 10 dígitos: México
    const ig = values.instagram ? normalizeSocial('instagram', values.instagram) : null
    if (values.instagram && (!ig || !checkTarget(db, ig).ok)) errors.instagram = 'err.social'
    const photo = mp.files.find((x) => x.field === 'photo')
    let photoKey: string | null = null
    if (photo && !Object.keys(errors).length) {
      try {
        photoKey = (await storeImage(deps, u.id, photo.buffer, photo.filename, { maxDim: 400, square: true })).key
      } catch (e) {
        errors.photo = e instanceof UploadError ? e.key : 'err.upload_not_image'
      }
    }
    if (Object.keys(errors).length) return sendHtml(reply, startPage(req.ctx, { tpls: tpls(u), values, errors }), 422)

    const tp = values.tpl ? getUsableTemplate(db, Number(values.tpl), u.id) : undefined
    const now = deps.now()
    const lim = limitsOf(db, u, now)
    const design = tp ? { ...tp.design } : defaultBioData(values.name, u.name, getSetting(db, 'default_theme'))
    let blocks: TemplateBlock[] = tp ? tp.blocks.map((b) => ({ ...b, data: { ...b.data } })) : []
    // lo que la persona escribió reemplaza los textos de ejemplo de la plantilla
    const first = blocks.find((b) => b.type === 'heading')
    if (first) first.data.text = values.name
    else blocks.unshift({ type: 'heading', is_enabled: 1, data: { text: values.name, level: 'h1' }, style: {} })
    if (photoKey) blocks.unshift({ type: 'avatar', is_enabled: 1, data: { image: photoKey, alt: values.name, size: 'lg', shape: 'circle' }, style: {} })
    if (waNum) {
      const waBlock = blocks.find((b) => typeof b.data.url === 'string' && /^https:\/\/wa\.me\//.test(b.data.url as string))
      if (waBlock) waBlock.data.url = `https://wa.me/${waNum}`
      else blocks.push({ type: 'big_link', is_enabled: 1, data: { label: 'WhatsApp', url: `https://wa.me/${waNum}`, effect: 'pulse' }, style: {} })
    } else {
      blocks = blocks.filter((b) => !(typeof b.data.url === 'string' && /^https:\/\/wa\.me\/52$/.test(b.data.url as string)))
    }
    if (ig) {
      const soc = blocks.find((b) => b.type === 'socials')
      if (soc) soc.data.links = { ...((soc.data.links as Record<string, string>) ?? {}), instagram: ig }
      else blocks.push({ type: 'socials', is_enabled: 1, data: { links: { instagram: ig }, colored: true, size: 'md' }, style: {} })
    }
    const id = db.transaction(() => {
      const link = createLink(db, u.id, { kind: 'bio', alias, title: values.name, target_url: null, redirect_code: 302, data: { ...design, seo_title: values.name }, is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false, project_id: null }, now)
      for (const b of blocks) {
        if ((b.type === 'html' || b.type === 'iframe') && !lim.custom_code) continue
        createBlock(db, link.id, { type: b.type, is_enabled: !!b.is_enabled, starts_at: null, ends_at: null, data: b.data, style: b.style }, now)
      }
      if (tp) db.prepare('UPDATE templates SET uses = uses + 1 WHERE id = ?').run(tp.id)
      return link.id
    })()
    audit(db, { actorId: actorOf(req), userId: u.id, action: 'link.create', target: `link:${id}`, meta: { kind: 'bio', start: true, template: tp?.id ?? null } }, now)
    return reply.redirect(`/panel/start/done?id=${id}`, 303)
  })

  app.get('/panel/start/done', { preHandler: userGuard }, async (req, reply) => {
    const u = req.ctx.user as User
    const link = getOwnLink(db, Number((req.query as { id?: string }).id), u.id)
    if (!link) return reply.redirect('/panel', 303)
    return sendHtml(reply, donePage(req.ctx, { id: link.id, url: linkUrl(deps.config.baseUrl, link), name: link.title || link.alias }))
  })
}
