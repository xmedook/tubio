import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { aliasError, normalizeAlias } from '../../lib/alias.ts'
import { html } from '../../lib/html.ts'
import { formatNumber } from '../../lib/i18n.ts'
import { panelLayout } from '../../views/layout.ts'
import { csrfField, emptyState, input, postButton } from '../../views/ui.ts'
import { sendHtml, setFlash, userGuard, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { actorOf } from '../auth/routes.ts'
import { createBlock, listBlocks } from '../bio/repo.ts'
import { renderBioPage } from '../bio/render.ts'
import { themeById, readDesign } from '../bio/design.ts'
import { aliasTaken, createLink, type Link } from '../links/repo.ts'
import { ownLinkOr404 } from '../links/routes.ts'
import { dailyCapHit, limitsOf, usageOf, withinLimit } from '../plans/limits.ts'
import { audit } from '../settings/repo.ts'
import type { User } from '../users/repo.ts'
import { createTemplate, getUsableTemplate, listTemplates, previewBlocks, snapshotBlocks, type Template } from './repo.ts'
import { ensureSeedTemplates } from './seed.ts'

function gallery(ctx: Ctx, list: Template[], error?: string, values: Record<string, string> = {}) {
  const { t } = ctx
  const card = (tp: Template) => {
    const th = themeById(String(tp.design.theme ?? 'nube'))
    return html`<li class="tpl">
  <a class="tpl-prev" href="/_/tpl/${tp.id}" target="_blank" rel="noopener" aria-label="${t('tpl.preview')}: ${tp.name}"><span class="tpl-sw" style="background:${th.bg}"><span style="background:${th.btnBg};border-color:${th.btnBorder}"></span><span style="background:${th.btnBg};border-color:${th.btnBorder}"></span><span style="background:${th.btnBg};border-color:${th.btnBorder}"></span></span></a>
  <div class="tpl-b"><b>${tp.name}</b><span class="muted">${tp.user_id ? t('tpl.mine') : tp.category ? t(`dir.cat_${tp.category}`) : ''} · ${t('tpl.n_blocks', { n: tp.blocks.length })}${tp.uses ? html` · ${t('tpl.uses', { n: formatNumber(ctx.locale, tp.uses) })}` : ''}</span>
    <details class="tpl-use"${values.tpl === String(tp.id) ? html` open` : ''}><summary class="btn btn-primary btn-sm">${t('tpl.use')}</summary>
      <form method="post" action="/panel/templates/${tp.id}/use">${csrfField(ctx)}
        ${input({ ctx, name: 'alias', label: t('links.alias'), value: values.tpl === String(tp.id) ? values.alias : '', required: true, error: values.tpl === String(tp.id) ? error : undefined, autocomplete: 'off' })}
        ${input({ ctx, name: 'title', label: t('links.title'), value: values.tpl === String(tp.id) ? values.title : '', maxlength: 120 })}
        <button class="btn btn-primary" type="submit">${t('tpl.create')}</button>
      </form>
    </details>
    ${tp.user_id ? postButton(ctx, `/panel/templates/${tp.id}/delete`, t('common.delete'), { cls: 'btn-link', confirm: t('tpl.delete_confirm') }) : ''}
  </div>
</li>`
  }
  return panelLayout(ctx, {
    title: t('tpl.title'),
    active: 'links',
    path: '/panel/templates',
    body: html`<h1>${t('tpl.title')}</h1><p class="muted">${t('tpl.intro')}</p>
${list.length ? html`<ul class="tpl-list">${list.map(card)}</ul>` : emptyState(t('tpl.none'), '')}
<p class="hint">${t('tpl.save_hint')}</p>`,
  })
}

export function registerTemplates(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  ensureSeedTemplates(db, deps.now())

  app.get('/panel/templates', { preHandler: userGuard }, async (req, reply) => sendHtml(reply, gallery(req.ctx, listTemplates(db, (req.ctx.user as User).id))))

  // vista previa en vivo, con el render real de página bio y bloques en memoria
  app.get('/_/tpl/:id', { preHandler: userGuard }, async (req, reply) => {
    const tp = getUsableTemplate(db, Number((req.params as { id: string }).id), (req.ctx.user as User).id)
    if (!tp) return reply.callNotFound()
    const now = deps.now()
    const fake = { id: 0, user_id: 0, project_id: null, domain_id: 0, alias: 'plantilla', kind: 'bio', title: tp.name, target_url: null, redirect_code: 302, data: { ...tp.design, noindex: true }, is_enabled: 1, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, password_hash: null, is_sensitive: 0, utm: {}, pixel_ids: [], splash_id: null, targeting: {}, cloak: 0, forward_query: 0, public_stats: 0, clicks: 0, hits: 0, created_at: now, updated_at: now } as unknown as Link
    reply.header('X-Robots-Tag', 'noindex')
    return renderBioPage(deps, req, reply, fake, { blocks: previewBlocks(tp, now) })
  })

  app.post('/panel/templates/:id/use', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    const tp = getUsableTemplate(db, Number((req.params as { id: string }).id), user.id)
    if (!tp) return reply.callNotFound()
    const values = { tpl: String(tp.id), alias: field(req.body, 'alias'), title: field(req.body, 'title').trim().slice(0, 120) }
    const back = (err: string, code = 422) => sendHtml(reply, gallery(req.ctx, listTemplates(db, user.id), err, values), code)
    if (dailyCapHit(db, user, deps.now())) return back('err.daily_cap', 429)
    if (!withinLimit(limitsOf(db, user, deps.now()).bio_pages, usageOf(db, user.id).bio_pages)) return back('err.plan_bio_pages', 402)
    const alias = normalizeAlias(values.alias).slice(0, 60)
    const err = aliasError(alias) ?? (aliasTaken(db, alias) ? 'err.alias_taken' : null)
    if (err) return back(err)
    const now = deps.now()
    const lim = limitsOf(db, user, now)
    const id = db.transaction(() => {
      const link = createLink(db, user.id, { kind: 'bio', alias, title: values.title || tp.name, target_url: null, redirect_code: 302, data: { ...tp.design, seo_title: values.title || '' }, is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false, project_id: null }, now)
      // los bloques que el plan no incluye (código propio) no se copian
      for (const b of tp.blocks) {
        if ((b.type === 'html' || b.type === 'iframe') && !lim.custom_code) continue
        createBlock(db, link.id, { type: b.type, is_enabled: !!b.is_enabled, starts_at: null, ends_at: null, data: b.data, style: b.style }, now)
      }
      db.prepare('UPDATE templates SET uses = uses + 1 WHERE id = ?').run(tp.id)
      return link.id
    })()
    audit(db, { actorId: actorOf(req), userId: user.id, action: 'link.create', target: `link:${id}`, meta: { kind: 'bio', template: tp.id } }, now)
    setFlash(reply, deps, { type: 'ok', key: 'tpl.created' })
    return reply.redirect(`/panel/links/${id}/blocks`, 303)
  })

  // guardar mi página como plantilla (privada; el admin puede hacerla general)
  app.post('/panel/links/:id/save-template', { preHandler: userGuard }, async (req, reply) => {
    const link = ownLinkOr404(deps, req, reply)
    if (!link) return
    if (link.kind !== 'bio') return reply.callNotFound()
    const user = req.ctx.user as User
    const general = user.role === 'admin' && !req.ctx.member && field(req.body, 'general') === '1'
    const mine = db.prepare('SELECT COUNT(*) FROM templates WHERE user_id = ?').pluck().get(user.id) as number
    if (!general && mine >= 20) {
      setFlash(reply, deps, { type: 'error', key: 'tpl.too_many' })
      return reply.redirect(`/panel/links/${link.id}/blocks`, 303)
    }
    const d = { ...readDesign(link.data) } as Record<string, unknown>
    createTemplate(db, { userId: general ? null : user.id, name: (field(req.body, 'name').trim() || link.title || link.alias).slice(0, 80), category: String(d.category ?? ''), design: d, blocks: snapshotBlocks(listBlocks(db, link.id)) }, deps.now())
    audit(db, { actorId: actorOf(req), userId: user.id, action: 'template.save', target: `link:${link.id}`, meta: { general } }, deps.now())
    setFlash(reply, deps, { type: 'ok', key: 'tpl.saved' })
    return reply.redirect('/panel/templates', 303)
  })

  app.post('/panel/templates/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(Number((req.params as { id: string }).id), (req.ctx.user as User).id)
    return reply.redirect('/panel/templates', 303)
  })

}
