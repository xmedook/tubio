import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { aiConfig, AiError } from '../../lib/ai.ts'
import { aliasError, normalizeAlias } from '../../lib/alias.ts'
import { html } from '../../lib/html.ts'
import { icon } from '../../views/icons.ts'
import { ASSET_VERSION, panelLayout } from '../../views/layout.ts'
import { sendHtml, userGuard, type Ctx } from '../../web/context.ts'
import { actorOf } from '../auth/routes.ts'
import { defaultBioData } from '../bio/design.ts'
import { GIRO_META } from '../minisitio/giros.ts'
import { aliasTaken, createLink, getOwnLink, linkUrl } from '../links/repo.ts'
import { dailyCapHit, limitsOf, usageOf, withinLimit } from '../plans/limits.ts'
import { audit } from '../settings/repo.ts'
import type { User } from '../users/repo.ts'
import { buildSite, planDesign } from './build.ts'
import { generatePlan, type Stage } from './generate.ts'
import { slugify } from './plan.ts'

/** Sitios generados por persona en 24 h (las personas admin no tienen tope) */
const dailyLimit = () => Math.max(0, Number(process.env.TUBIO_AI_DAILY ?? 5) || 0)
const DESC_MIN = 20
const DESC_MAX = 2000

function usedToday(deps: AppDeps, userId: number): number {
  return deps.db.prepare("SELECT COUNT(*) FROM audit_log WHERE user_id = ? AND action = 'ai.generate' AND ts > ?").pluck().get(userId, deps.now() - 86_400_000) as number
}

const EXAMPLES = ['varita.ex1', 'varita.ex2', 'varita.ex3', 'varita.ex4']

function varitaPage(ctx: Ctx, opts: { left: number | null; enabled: boolean }) {
  const { t } = ctx
  return panelLayout(ctx, {
    title: t('varita.title'),
    active: 'links',
    path: '/panel/varita',
    noCreate: true,
    body: html`<section class="varita" data-varita data-csrf="${ctx.csrf}">
  <div class="varita-orb" aria-hidden="true"></div>
  <p class="varita-k">${icon('wand')} ${t('varita.kicker')}</p>
  <h1 class="varita-h">${t('varita.title')}</h1>
  <p class="lead">${t('varita.lead')}</p>
  ${opts.enabled ? '' : html`<p class="flash flash-error" role="alert">${t('ai.err_off')}</p>`}
  <form class="varita-form" data-varita-form novalidate>
    <label class="sr-only" for="v-desc">${t('varita.desc_label')}</label>
    <textarea id="v-desc" name="description" rows="6" maxlength="${DESC_MAX}" required placeholder="${t('varita.placeholder')}" data-varita-desc></textarea>
    <div class="varita-ex" role="group" aria-label="${t('varita.examples')}">
      ${EXAMPLES.map((k) => html`<button type="button" class="chip" data-varita-ex="${t(k)}">${t(`${k}_label`)}</button>`)}
    </div>
    <div class="field"><label for="v-wa">${t('varita.wa')}</label><input id="v-wa" name="whatsapp" inputmode="tel" autocomplete="tel" placeholder="33 1234 5678"><p class="hint">${t('varita.wa_hint')}</p></div>
    <details class="opt"><summary>${t('varita.more')}</summary><div class="opt-body">
      <div class="field"><label for="v-alias">${t('varita.alias')}</label><input id="v-alias" name="alias" autocapitalize="off" spellcheck="false" placeholder="${t('varita.alias_ph')}"><p class="hint">${t('varita.alias_hint')}</p></div>
    </div></details>
    <button type="submit" class="btn btn-primary btn-lg varita-go" ${opts.enabled ? '' : 'disabled'}>${icon('wand')} ${t('varita.go')}</button>
    ${opts.left !== null ? html`<p class="hint varita-left">${t('varita.left', { n: opts.left })}</p>` : ''}
    <p class="flash flash-error" role="alert" hidden data-varita-err data-generic="${t('ai.err_failed')}"></p>
  </form>
  <div class="varita-live" hidden data-varita-live aria-hidden="true">
    <div class="vm-phone">
      <div class="vm-bar"><span class="vm-name" data-vm-name></span></div>
      <div class="vm-hero" data-vm-hero><span class="vm-k"></span><span class="vm-t" data-vm-title></span><span class="vm-s"></span></div>
      <div class="vm-secs" data-vm-secs></div>
    </div>
  </div>
  <ol class="varita-steps" hidden data-varita-steps aria-live="polite">
    ${(['reading', 'style', 'cover', 'section', 'page', 'done'] as Stage[]).map((s) => html`<li data-stage="${s}"><span class="dot" aria-hidden="true"></span><span>${t(`varita.st_${s}`)}</span><small data-n></small></li>`)}
  </ol>
</section>
<script type="module" src="/_/static/js/varita.js?v=${ASSET_VERSION}" nonce="${ctx.nonce}"></script>`,
  })
}

function readyPage(ctx: Ctx, opts: { id: number; url: string; alias: string }) {
  const { t } = ctx
  const share = `https://wa.me/?text=${encodeURIComponent(opts.url)}`
  return panelLayout(ctx, {
    title: t('varita.ready'),
    active: 'links',
    path: '/panel/varita/listo',
    noCreate: true,
    body: html`<section class="varita-ready">
  <div class="varita-ready-txt">
    <p class="varita-k">${icon('wand')} ${t('varita.kicker')}</p>
    <h1>${t('varita.ready')}</h1>
    <p class="lead">${t('varita.ready_lead')}</p>
    <p class="start-url"><a href="${opts.url}" target="_blank" rel="noopener">${opts.url.replace(/^https?:\/\//, '')}</a></p>
    <div class="start-actions">
      <a class="btn btn-primary btn-lg" href="/panel/links/${opts.id}/site">${icon('edit')} ${t('varita.edit')}</a>
      <button type="button" class="btn btn-lg" data-copy="${opts.url}" data-copied="${t('links.copied')}">${icon('copy')} ${t('links.copy')}</button>
      <a class="btn btn-lg" href="${share}" target="_blank" rel="noopener">${icon('chat')} ${t('start.share_wa')}</a>
      <a class="btn btn-lg" href="/panel/varita">${icon('wand')} ${t('varita.again')}</a>
    </div>
    <p class="hint">${t('varita.ready_hint')}</p>
  </div>
  <div class="varita-phone" aria-label="${t('varita.preview')}"><iframe src="/${opts.alias}?_preview=1" title="${t('varita.preview')}" loading="eager"></iframe></div>
</section>`,
  })
}

export function registerVarita(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const left = (u: User) => (u.role === 'admin' ? null : Math.max(0, dailyLimit() - usedToday(deps, u.id)))

  app.get('/panel/varita', { preHandler: userGuard }, async (req, reply) => {
    const u = req.ctx.user as User
    return sendHtml(reply, varitaPage(req.ctx, { left: left(u), enabled: aiConfig().provider !== 'off' }))
  })

  app.get('/panel/varita/listo/:id', { preHandler: userGuard }, async (req, reply) => {
    const u = req.ctx.user as User
    const link = getOwnLink(db, Number((req.params as { id: string }).id), u.id)
    if (!link) return reply.callNotFound()
    return sendHtml(reply, readyPage(req.ctx, { id: link.id, url: linkUrl(deps.config.baseUrl, link), alias: link.alias }))
  })

  /**
   * Genera y arma el sitio. Responde en líneas JSON (una por avance) para que la pantalla muestre el progreso real:
   *   {"s":"style"} … {"s":"section","n":2} … {"ok":true,"go":"/panel/varita/listo/12"}  o  {"error":"clave"}
   */
  app.post('/panel/varita', { preHandler: userGuard, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = req.ctx.user as User
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
    const description = str('description').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, DESC_MAX)
    const fail = (key: string, code = 422) => reply.code(code).type('application/x-ndjson').send(JSON.stringify({ error: key, msg: req.ctx.t(key) }) + '\n')
    const cfg = aiConfig()
    if (cfg.provider === 'off') return fail('ai.err_off', 503)
    if (description.length < DESC_MIN) return fail('varita.err_short')
    const now0 = deps.now()
    if (!withinLimit(limitsOf(db, u, now0).bio_pages, usageOf(db, u.id).bio_pages)) return fail('err.plan_bio_pages', 402)
    if (dailyCapHit(db, u, now0)) return fail('err.daily_cap', 429)
    const l = left(u)
    if (l !== null && l <= 0) return fail('varita.err_quota', 429)
    const waRaw = str('whatsapp').replace(/\D/g, '')
    if (waRaw && (waRaw.length < 10 || waRaw.length > 15)) return fail('err.phone')
    const wa = waRaw.length === 10 ? `52${waRaw}` : waRaw
    let alias = normalizeAlias(str('alias')).slice(0, 60)
    if (alias && (aliasError(alias) || aliasTaken(db, alias))) return fail(aliasError(alias) ?? 'err.alias_taken')

    reply.hijack()
    const res = reply.raw
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
    const send = (o: object) => res.write(JSON.stringify(o) + '\n')
    try {
      const { plan, usage } = await generatePlan(cfg, description, (s, n, peek) => send({ s, ...(n ? { n } : {}), ...(peek ? { peek } : {}) }))
      if (!alias) {
        const base = slugify(plan.nombre) || 'mi-negocio'
        alias = base
        for (let i = 2; aliasError(alias) || aliasTaken(db, alias); i++) alias = `${base}-${i}`.slice(0, 60)
      }
      const now = deps.now()
      const meta = plan.giro !== 'otro' ? GIRO_META[plan.giro] : null
      const id = db.transaction(() => {
        const link = createLink(db, u.id, {
          kind: 'bio', alias, title: plan.nombre, target_url: null, redirect_code: 302,
          data: { ...defaultBioData(plan.nombre, u.name, plan.estilo.tema), ...planDesign(plan), seo_title: plan.nombre, seo_description: plan.portada.subtitulo.slice(0, 200), category: meta?.category ?? 'business' },
          is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false, project_id: null,
        }, now)
        buildSite(db, link.id, plan, { whatsapp: wa }, now)
        return link.id
      })()
      audit(db, { actorId: actorOf(req), userId: u.id, action: 'ai.generate', target: `link:${id}`, meta: { model: usage.model, in: usage.input_tokens, out: usage.output_tokens, usd: Number(usage.usd.toFixed(4)), giro: plan.giro } }, deps.now())
      send({ ok: true, go: `/panel/varita/listo/${id}` })
    } catch (e) {
      const key = e instanceof AiError ? e.key : 'ai.err_failed'
      req.log.warn({ err: e instanceof Error ? e.message : String(e) }, 'varita: no se pudo generar')
      audit(db, { actorId: actorOf(req), userId: u.id, action: 'ai.generate_failed', meta: { key } }, deps.now())
      send({ error: key, msg: req.ctx.t(key) })
    }
    res.end()
  })
}
