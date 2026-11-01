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
import { ic } from '../../views/sprite.ts'
import { siteShell } from './shell-site.ts'

type Vals = Record<string, string>
const STATUSES = ['new', 'doing', 'done'] as const
/** Qué quiere en su liga (design, bloque 2). Se guarda en español en el texto de la solicitud: lo lee el equipo. */
const BLOQUES = [
  { k: 'wa', es: 'Botón de WhatsApp', chip: 'verde', on: true },
  { k: 'menu', es: 'Servicios o menú con precios', chip: 'verde', on: true },
  { k: 'gal', es: 'Galería de fotos', chip: 'verde', on: false },
  { k: 'map', es: 'Mapa y horarios', chip: 'verde', on: true },
  { k: 'promo', es: 'Promoción de arranque', chip: 'rosa', on: false },
  { k: 'dom', es: 'Dominio propio', chip: 'azul', on: false },
] as const
const CHIP_TXT = { verde: 's2.chip_inc', rosa: 's2.chip_new', azul: 's2.chip_info' } as const
const HORAS = { m: 'por la mañana (9:00 a 13:00)', t: 'por la tarde (15:00 a 19:00)' } as const
const folioDe = (id: number): string => `APT-${String(id).padStart(4, '0')}`

function formPage(ctx: Ctx, deps: AppDeps, o: { values: Vals; errors: Record<string, string>; done?: boolean; folio?: string; viaWa?: boolean; scripts?: string[] }): SafeHtml {
  const { t } = ctx
  const v = o.values
  const pow = ctx.pow()
  const hero = (chip: SafeHtml, h1: SafeHtml, lead: SafeHtml) => html`<section class="hero" style="padding-bottom:24px"><div class="wrap">${chip}<h1 class="h1" style="font-size:clamp(34px,8vw,56px);margin:14px 0 12px">${h1}</h1>${lead}</div></section>`
  let body: SafeHtml
  if (o.done) {
    body = html`<section class="hero"><div class="wrap" style="max-width:720px"><span class="chip chip-verde">${t('s2.ok_chip')}</span><h1 class="h1" style="font-size:clamp(34px,8vw,56px);margin:14px 0 12px">${t('s2.ok_h1a')} <span class="hl-verde">${t('s2.ok_h1b')}</span>.</h1>
<p class="lead" role="status">${o.viaWa === false ? t('s2.ok_lead_mail') : t('s2.ok_lead_wa')}${o.folio ? html` ${t('s2.ok_folio')} <b class="mono" style="color:var(--tinta)">${o.folio}</b>.` : ''}</p>
${o.folio ? html`<div class="al ok" style="margin-top:22px">${ic('check')}<div><b>${t('s2.ok_save')}</b> ${t('s2.ok_save_d')}</div></div>` : ''}
<ol class="steps" style="margin-top:28px">${[1, 2, 3].map((n) => html`<li><div><b>${t(`s2.ok${n}`)}</b><span>${t(`s2.ok${n}d`)}</span></div></li>`)}</ol>
<div class="btns row" style="margin-top:28px"><a class="btn" href="/">${t('s2.ok_home')}</a><a class="btn btn-s" href="/help">${t('s2.ok_help')}</a></div></div></section>`
  } else {
    const keys = ['business', 'giro', 'contact', 'priv'].filter((k) => o.errors[k])
    const fe = (k: string, text: string) => (o.errors[k] ? html`<p class="msg-e" id="e-${k}">${ic('alert')}<span>${text}</span></p>` : '')
    const bad = (k: string) => (o.errors[k] ? html` aria-invalid="true" aria-describedby="e-${k}"` : '')
    const picked = (k: string) => (o.values.sent ? v[`b_${k}`] === '1' : BLOQUES.find((b) => b.k === k)!.on)
    const hora = v.hora === 't' ? 't' : 'm'
    body = html`${hero(html`<span class="chip chip-azul">${t('s2.chip')}</span>`, html`${t('s2.h1a')} <span class="hl-lima">${t('s2.h1b')}</span>.`, html`<p class="lead">${t('s2.lead')}</p>`)}
<section class="sec" style="border-top:0"><div class="wrap hero-g" style="align-items:start;gap:40px"><div>
<form class="form" method="post" action="/armamos-por-ti" novalidate aria-label="${t('s2.form_aria')}"${powAttr(pow)}>${csrfField(ctx)}
${keys.length || o.errors._form ? html`<div class="al crit" role="alert">${ic('alert')}<div>${o.errors._form ? t(o.errors._form) : html`<b>${keys.length === 1 ? t('s2.err_n1') : t('s2.err_n', { n: keys.length })}</b> ${t('s2.err_where')}`}</div></div>` : ''}
<input type="hidden" name="sent" value="1">
<fieldset class="form"><legend class="h3" style="margin-bottom:6px">${t('s2.s1')}</legend>
<div class="fld${o.errors.business ? ' err' : ''}"><label for="a-biz">${t('s2.f_name')}</label><input class="in" id="a-biz" name="business" value="${v.business ?? ''}" type="text" placeholder="${t('s2.f_name_ph')}" required maxlength="120" autocomplete="organization"${bad('business')}>${fe('business', t('s2.e_name'))}</div>
<div class="fld${o.errors.giro ? ' err' : ''}"><label for="a-giro">${t('s2.f_giro')}</label><select class="sel" id="a-giro" name="giro" required${bad('giro')}><option value="">${t('s2.f_giro_pick')}</option>${GIROS.map((g) => html`<option value="${g}"${v.giro === g ? html` selected` : ''}>${t(`s2.g_${g}`)}</option>`)}<option value="otro"${v.giro === 'otro' ? html` selected` : ''}>${t('s2.g_otro')}</option></select>${fe('giro', t('s2.e_giro'))}</div>
<div class="row2"><div class="fld"><label for="a-city">${t('s2.f_city')}</label><input class="in" id="a-city" name="city" type="text" placeholder="${t('s2.f_city_ph')}" value="${v.city ?? ''}" maxlength="160" autocomplete="address-level2"></div>
<div class="fld"><label for="a-links">${t('s2.f_ig')} <span class="p sm" style="font-weight:400">${t('s2.f_opt')}</span></label><input class="in" id="a-links" name="links" type="text" placeholder="${t('s2.f_ig_ph')}" value="${v.links ?? ''}" maxlength="300" autocomplete="off" aria-describedby="a-links-h"><p class="hint" id="a-links-h">${t('s2.f_ig_h')}</p></div></div></fieldset>
<fieldset class="form"><legend class="h3" style="margin-bottom:6px">${t('s2.s2')}</legend>
<div class="grid" style="gap:10px">${BLOQUES.map((b) => html`<label class="opt"><input type="checkbox" name="b_${b.k}" value="1"${picked(b.k) ? html` checked` : ''}><span><b>${t(`s2.b_${b.k}`)} <span class="chip chip-${b.chip}">${t(CHIP_TXT[b.chip])}</span></b><span>${t(`s2.b_${b.k}_d`)}</span></span></label>`)}</div></fieldset>
<fieldset class="form"><legend class="h3" style="margin-bottom:6px">${t('s2.s3')}</legend>
<p class="p sm"><b>${t('s2.f_material')}.</b> ${t('s2.f_material_h')}</p>
<div class="fld"><label for="a-offer">${t('s2.f_text')} <span class="p sm" style="font-weight:400">${t('s2.f_opt')}</span></label><textarea class="ta" id="a-offer" name="offer" placeholder="${t('s2.f_text_ph')}" maxlength="1200">${v.offer ?? ''}</textarea></div></fieldset>
<fieldset class="form"><legend class="h3" style="margin-bottom:6px">${t('s2.s4')}</legend>
<div class="row2"><div class="fld${o.errors.contact ? ' err' : ''}"><label for="a-wa">${t('s2.f_wa')}</label><input class="in" id="a-wa" name="whatsapp" type="tel" inputmode="tel" placeholder="${t('s2.f_wa_ph')}" value="${v.whatsapp ?? ''}" maxlength="30" autocomplete="tel"${bad('contact')}></div>
<div class="fld${o.errors.contact ? ' err' : ''}"><label for="a-mail">${t('s2.f_mail')}</label><input class="in" id="a-mail" name="email" type="email" placeholder="${t('s2.f_mail_ph')}" value="${v.email ?? ''}" maxlength="160" autocomplete="email"${bad('contact')}></div></div>
${fe('contact', t('s2.e_contact'))}
<div class="fld"><span class="p sm" id="a-hora-l"><b>${t('s2.f_when')}</b></span><div class="grid" style="gap:10px" role="radiogroup" aria-labelledby="a-hora-l"><label class="opt"><input type="radio" name="hora" value="m"${hora === 'm' ? html` checked` : ''}><span><b>${t('s2.h_m')}</b><span>${t('s2.h_m_d')}</span></span></label><label class="opt"><input type="radio" name="hora" value="t"${hora === 't' ? html` checked` : ''}><span><b>${t('s2.h_t')}</b><span>${t('s2.h_t_d')}</span></span></label></div></div>
<div class="fld${o.errors.priv ? ' err' : ''}"><label class="opt"><input type="checkbox" name="priv" value="1" required${v.priv === '1' ? html` checked` : ''}${bad('priv')}><span><b>${t('s2.priv_a')} <a href="/privacy">${t('s2.priv_b')}</a></b><span>${t('s2.priv_d')}</span></span></label>${fe('priv', t('s2.e_priv'))}</div></fieldset>
<div class="hp" aria-hidden="true" style="position:absolute;left:-10000px"><label for="a-web">Website</label><input id="a-web" name="website" tabindex="-1" autocomplete="off"></div>
${powField(ctx, pow)}
<button class="btn btn-b" type="submit">${t('s2.send')} ${ic('ar')}</button></form></div>
<aside class="grid" style="align-content:start"><div class="card"><span class="k">${t('s2.after_k')}</span><ol class="steps" style="margin-top:8px;border-top:0">${[1, 2, 3].map((n) => html`<li><div><b>${t(`s2.af${n}`)}</b><span>${t(`s2.af${n}d`)}</span></div></li>`)}</ol></div>
<div class="card hi"><span class="k">${t('s2.price_k')}</span><div style="font:700 36px/1 var(--fd);letter-spacing:-.04em;margin:8px 0" aria-label="${t('s2.price_aria')}">$ — — —</div><p class="p sm">${t('s2.price_note')}</p></div></aside></div></section>`
  }
  return siteShell(ctx, {
    title: `${t('asist.title')} · túbio`,
    description: t('asist.lead'),
    path: '/armamos-por-ti',
    body,
    pages: footerPages(deps, ctx.locale),
    mainHref: ctx.user ? '/panel/start' : getSetting(deps.db, 'registration_open') ? '/register' : '/#cierre',
    scripts: deps.config.powMax > 0 ? ['pow.js'] : [],
  })
}

export function registerAssisted(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  app.get('/armamos-por-ti', async (req, reply) => {
    const q = req.query as { giro?: string; negocio?: string }
    const g = String(q.giro ?? '')
    const negocio = String(q.negocio ?? '').replace(/[\0\r\n]/g, ' ').trim().slice(0, 120) // viene del home («Prueba cómo se verá tu liga»)
    return sendHtml(reply, formPage(req.ctx, deps, { values: { ...(isGiro(g) ? { giro: g } : {}), ...(negocio ? { business: negocio } : {}) }, errors: {} }))
  })

  app.post('/armamos-por-ti', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const f = (k: string, max: number) => field(req.body, k).replace(/\0/g, '').trim().slice(0, max)
    const bloques = BLOQUES.filter((b) => f(`b_${b.k}`, 2) === '1')
    const hora = f('hora', 2) === 't' ? 't' : 'm'
    const values: Vals = { sent: '1', giro: f('giro', 20), business: f('business', 120), name: f('name', 120), whatsapp: f('whatsapp', 30), email: f('email', 160), city: f('city', 160), offer: f('offer', 1200), links: f('links', 300), hora, priv: f('priv', 2) === '1' ? '1' : '' }
    for (const b of BLOQUES) if (bloques.includes(b)) values[`b_${b.k}`] = '1'
    const back = (errors: Record<string, string>, code = 422) => sendHtml(reply, formPage(req.ctx, deps, { values, errors }), code)
    // trampa para robots: un visitante real nunca llena este campo
    if (f('website', 200)) return sendHtml(reply, formPage(req.ctx, deps, { values: {}, errors: {}, done: true }))
    if (!powOk(deps, req.body)) return back({ _form: 'err.pow' })
    const errors: Record<string, string> = {}
    if (values.giro !== 'otro' && !isGiro(values.giro)) errors.giro = 'err.asist_giro'
    if (!values.business) errors.business = 'err.required'
    const wa = values.whatsapp!.replace(/\D/g, '')
    const okWa = wa.length >= 10 && wa.length <= 15
    const okMail = values.email!.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email!)
    if (!okWa && !okMail) errors.contact = 'err.asist_contact'
    if (!values.priv) errors.priv = 'err.required'
    // «@tunegocio» o «instagram.com/…» se guardan como enlace; lo que no sea un enlace usable se descarta
    const link = values.links!
    const url = /^https?:\/\/\S+$/i.test(link) ? link : /^@[\w.]{1,30}$/.test(link) ? `https://instagram.com/${link.slice(1)}` : ''
    if (Object.keys(errors).length) return back(errors)
    const now = deps.now()
    // el diseño pide qué bloques quiere y a qué hora escribirle: sin columnas nuevas, viaja al final del texto para el equipo
    const offer = [values.offer, bloques.length ? `[Bloques que quiere] ${bloques.map((b) => b.es).join(', ')}` : '', `[Prefiere que le escribamos] ${HORAS[hora]}`].filter(Boolean).join('\n\n')
    const r = db.prepare('INSERT INTO assisted_requests (giro, business, name, whatsapp, email, city, offer, links, locale, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(values.giro, values.business, values.name, okWa ? (wa.length === 10 ? `52${wa}` : wa) : '', okMail ? values.email!.toLowerCase() : '', values.city, offer, url, req.ctx.locale, now, now)
    return sendHtml(reply, formPage(req.ctx, deps, { values: {}, errors: {}, done: true, folio: folioDe(Number(r.lastInsertRowid)), viaWa: okWa }))
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
