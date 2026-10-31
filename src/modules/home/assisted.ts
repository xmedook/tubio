import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html, type SafeHtml } from '../../lib/html.ts'
import { formatDateTime } from '../../lib/i18n.ts'
import { csrfField, powAttr, powField } from '../../views/ui.ts'
import { adminGuard, powOk, sendHtml, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { page as adminPage } from '../admin/routes.ts'
import { GIROS, isGiro } from '../minisitio/giros.ts'
import { audit, getSetting } from '../settings/repo.ts'
import { footerPages } from '../site/routes.ts'
import { hic } from './icons.ts'
import { homeShell } from './shell.ts'

type Vals = Record<string, string>
const STATUSES = ['new', 'doing', 'done'] as const

function formPage(ctx: Ctx, deps: AppDeps, o: { values: Vals; errors: Record<string, string>; done?: boolean; scripts?: string[] }): SafeHtml {
  const { t } = ctx
  const v = o.values
  const pow = ctx.pow()
  const err = (k: string) => (o.errors[k] ? html`<p class="error" id="e-${k}" role="alert">${t(o.errors[k]!)}</p>` : '')
  const body = o.done
    ? html`<section class="asist-page"><div class="asist-ok" role="status"><h1>${t('asist.ok_title')}</h1><p class="lead">${t('asist.ok_body')}</p><p><a class="btn btn-borde" href="/">${t('h2.home_aria')}</a></p></div></section>`
    : html`<section class="asist-page"><h1>${t('asist.title')}</h1><p class="lead">${t('asist.lead')}</p>
<form class="f-asist" method="post" action="/armamos-por-ti" novalidate${powAttr(pow)}>${csrfField(ctx)}
  <div><label for="a-giro">${t('asist.giro')}</label><select id="a-giro" name="giro"${o.errors.giro ? html` aria-invalid="true" aria-describedby="e-giro"` : ''}>
    <option value="">—</option>${GIROS.map((g) => html`<option value="${g}"${v.giro === g ? html` selected` : ''}>${t(`giro.${g}`)}</option>`)}<option value="otro"${v.giro === 'otro' ? html` selected` : ''}>${t('asist.other')}</option></select>${err('giro')}</div>
  <div><label for="a-biz">${t('asist.business')}</label><input id="a-biz" name="business" value="${v.business ?? ''}" required maxlength="120" autocomplete="organization"${o.errors.business ? html` aria-invalid="true" aria-describedby="e-business"` : ''}>${err('business')}</div>
  <div><label for="a-name">${t('asist.name')}</label><input id="a-name" name="name" value="${v.name ?? ''}" maxlength="120" autocomplete="name"></div>
  <div><label for="a-wa">${t('asist.whatsapp')}</label><input id="a-wa" name="whatsapp" type="tel" inputmode="tel" value="${v.whatsapp ?? ''}" maxlength="30" autocomplete="tel"${o.errors.contact ? html` aria-invalid="true" aria-describedby="e-contact"` : ''}></div>
  <div><label for="a-mail">${t('asist.email')}</label><input id="a-mail" name="email" type="email" value="${v.email ?? ''}" maxlength="160" autocomplete="email"${o.errors.contact ? html` aria-invalid="true" aria-describedby="e-contact"` : ''}>${err('contact')}</div>
  <div><label for="a-city">${t('asist.city')}</label><input id="a-city" name="city" value="${v.city ?? ''}" maxlength="160" autocomplete="street-address"></div>
  <div><label for="a-offer">${t('asist.offer')}</label><textarea id="a-offer" name="offer" maxlength="1500">${v.offer ?? ''}</textarea></div>
  <div><label for="a-links">${t('asist.links')}</label><input id="a-links" name="links" type="url" inputmode="url" value="${v.links ?? ''}" maxlength="300" autocomplete="off"></div>
  <div class="hp" aria-hidden="true"><label for="a-web">Website</label><input id="a-web" name="website" tabindex="-1" autocomplete="off"></div>
  ${powField(ctx, pow)}
  ${o.errors._form ? html`<p class="error" role="alert">${t(o.errors._form)}</p>` : ''}
  <p class="hint">${hic('check', 14)} ${t('asist.privacy')}</p>
  <p><button class="btn btn-acento btn-grande" type="submit">${t('asist.send')}</button></p>
</form></section>`
  return homeShell(ctx, {
    title: `${t('asist.title')} · tubio`,
    description: t('asist.lead'),
    path: '/armamos-por-ti',
    body,
    pages: footerPages(deps, ctx.locale),
    salesWhatsapp: getSetting(deps.db, 'sales_whatsapp'),
    scripts: deps.config.powMax > 0 ? ['pow.js'] : [],
  })
}

export function registerAssisted(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  app.get('/armamos-por-ti', async (req, reply) => {
    const g = String((req.query as { giro?: string }).giro ?? '')
    return sendHtml(reply, formPage(req.ctx, deps, { values: isGiro(g) ? { giro: g } : {}, errors: {} }))
  })

  app.post('/armamos-por-ti', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const f = (k: string, max: number) => field(req.body, k).replace(/\0/g, '').trim().slice(0, max)
    const values = { giro: f('giro', 20), business: f('business', 120), name: f('name', 120), whatsapp: f('whatsapp', 30), email: f('email', 160), city: f('city', 160), offer: f('offer', 1500), links: f('links', 300) }
    const back = (errors: Record<string, string>, code = 422) => sendHtml(reply, formPage(req.ctx, deps, { values, errors }), code)
    // trampa para robots: un visitante real nunca llena este campo
    if (f('website', 200)) return sendHtml(reply, formPage(req.ctx, deps, { values: {}, errors: {}, done: true }))
    if (!powOk(deps, req.body)) return back({ _form: 'err.pow' })
    const errors: Record<string, string> = {}
    if (values.giro !== 'otro' && !isGiro(values.giro)) errors.giro = 'err.asist_giro'
    if (!values.business) errors.business = 'err.required'
    const wa = values.whatsapp.replace(/\D/g, '')
    const okWa = wa.length >= 10 && wa.length <= 15
    const okMail = values.email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
    if (!okWa && !okMail) errors.contact = 'err.asist_contact'
    const url = values.links && /^https?:\/\/\S+$/i.test(values.links) ? values.links : ''
    if (Object.keys(errors).length) return back(errors)
    const now = deps.now()
    db.prepare('INSERT INTO assisted_requests (giro, business, name, whatsapp, email, city, offer, links, locale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(values.giro, values.business, values.name, okWa ? (wa.length === 10 ? `52${wa}` : wa) : '', okMail ? values.email.toLowerCase() : '', values.city, values.offer, url, req.ctx.locale, now, now)
    return sendHtml(reply, formPage(req.ctx, deps, { values: {}, errors: {}, done: true }))
  })

  // cola interna del equipo
  type Row = { id: number; giro: string; business: string; name: string; whatsapp: string; email: string; city: string; offer: string; links: string; status: (typeof STATUSES)[number]; note: string; created_at: number }
  app.get('/admin/assisted', { preHandler: adminGuard }, async (req, reply) => {
    const { t, locale } = req.ctx
    const rows = db.prepare("SELECT * FROM assisted_requests ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END, created_at DESC LIMIT 200").all() as Row[]
    const tz = req.ctx.user?.timezone ?? 'America/Mexico_City'
    const body = rows.length
      ? html`<ul class="cards">${rows.map((r) => html`<li class="card"><form method="post" action="/admin/assisted/${r.id}">${csrfField(req.ctx)}
        <p><b>${r.business}</b> · ${r.giro === 'otro' ? t('asist.other') : t(`giro.${r.giro}`)} · <span class="muted">${formatDateTime(locale, r.created_at, tz)}</span></p>
        <p>${r.name}${r.whatsapp ? html` · <a href="https://wa.me/${r.whatsapp}" target="_blank" rel="noopener">${r.whatsapp}</a>` : ''}${r.email ? html` · <a href="mailto:${r.email}">${r.email}</a>` : ''}${r.city ? html` · ${r.city}` : ''}</p>
        ${r.offer ? html`<p>${r.offer}</p>` : ''}${r.links ? html`<p><a href="${r.links}" target="_blank" rel="noopener nofollow">${r.links}</a></p>` : ''}
        <div class="field"><label for="n-${r.id}">${t('admin.assisted_note')}</label><input id="n-${r.id}" name="note" value="${r.note}" maxlength="300"></div>
        <div class="btn-row"><select name="status" aria-label="${t('admin.assisted_status')}">${STATUSES.map((s) => html`<option value="${s}"${r.status === s ? html` selected` : ''}>${t(`admin.assisted_${s === 'new' ? 'new' : s === 'doing' ? 'doing' : 'done'}`)}</option>`)}</select>
        <button class="btn btn-primary" type="submit">${t('admin.assisted_save')}</button></div></form></li>`)}</ul>`
      : html`<p class="muted">${t('admin.assisted_none')}</p>`
    return sendHtml(reply, adminPage(req.ctx, 'assisted', t('admin.assisted'), body, '/admin/assisted'))
  })

  app.post('/admin/assisted/:id', { preHandler: adminGuard }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const status = field(req.body, 'status')
    if (!Number.isInteger(id) || !(STATUSES as readonly string[]).includes(status)) return reply.callNotFound()
    const now = deps.now()
    const r = db.prepare('UPDATE assisted_requests SET status = ?, note = ?, updated_at = ? WHERE id = ?').run(status, field(req.body, 'note').trim().slice(0, 300), now, id)
    if (!r.changes) return reply.callNotFound()
    audit(db, { actorId: req.ctx.user?.id ?? null, action: 'assisted.update', target: `assisted:${id}`, meta: { status } }, now)
    return reply.redirect('/admin/assisted', 303)
  })
}
