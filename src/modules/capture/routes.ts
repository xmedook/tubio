import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { sha256 } from '../../lib/crypto.ts'
import { html } from '../../lib/html.ts'
import { formatDateTime, formatNumber } from '../../lib/i18n.ts'
import { panelLayout } from '../../views/layout.ts'
import { checkbox, csrfField, emptyState, input, postButton, select, type Errors } from '../../views/ui.ts'
import { cookieOpts, powOk, sendHtml, setFlash, userGuard, type Ctx } from '../../web/context.ts'
import { checked, field, fieldAll } from '../../web/forms.ts'
import { visibleBlocks } from '../bio/render.ts'
import { getBlock } from '../bio/repo.ts'
import { getLink, listLinks } from '../links/repo.ts'
import { availability, isConfirmed, isUnlocked } from '../public/gate.ts'
import { dailySalt } from '../stats/record.ts'
import { csvCell } from '../stats/query.ts'
import type { User } from '../users/repo.ts'
import { deliver, enqueue, getOwnTarget, listTargets, TARGET_KINDS, validateTarget, type Notice, type TargetKind } from './notify.ts'

const KIND_OF: Record<string, 'email' | 'phone' | 'contact' | 'subscribe' | 'poll'> = {
  email_capture: 'email',
  phone_capture: 'phone',
  contact_form: 'contact',
  subscribe: 'subscribe',
  poll: 'poll',
}

type Row = { id: number; link_id: number; block_id: number | null; kind: string; data: string; created_at: number; read_at: number | null; alias: string }

const emailOk = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
const phoneOk = (v: string) => /^\+?\d{6,15}$/.test(v.replace(/[\s().-]/g, ''))

export function registerCapture(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  // ---------- envío público ----------
  app.post('/_/f/:id', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const b = getBlock(db, Number((req.params as { id: string }).id))
    const link = b ? getLink(db, b.link_id) : undefined
    const kind = b ? KIND_OF[b.type] : undefined
    if (!b || !link || !kind || availability(deps, link) !== 'ok' || !isUnlocked(deps, req, link) || !isConfirmed(deps, req, link) || !visibleBlocks([b], deps.now()).length) {
      return reply.callNotFound()
    }
    const back = (q = `?sent=${b.id}`) => reply.redirect(`/${link.alias}${q}#b${b.id}`, 303)
    const body = req.body
    // honeypot: los bots llenan todo; se responde como si hubiera salido bien
    if (field(body, 'website')) return back()
    if (!powOk(deps, body)) return back(`?err=pow&b=${b.id}`)
    const now = deps.now()
    const visitor = sha256(dailySalt(deps, new Date(now).toISOString().slice(0, 10)) + '|' + req.ip + '|' + String(req.headers['user-agent'] ?? '')).slice(0, 32)

    let data: Record<string, string> = {}
    if (kind === 'poll') {
      const opts = (Array.isArray(b.data.options) ? (b.data.options as { text?: string }[]) : []).map((o) => String(o.text ?? ''))
      const i = Number(field(body, 'option'))
      if (!Number.isInteger(i) || !opts[i]) return back('')
      // un voto por visitante por día
      const dup = db.prepare("SELECT 1 FROM collected WHERE block_id = ? AND kind = 'poll' AND visitor = ? AND created_at > ?").get(b.id, visitor, now - 86400_000)
      if (!dup) db.prepare("INSERT INTO collected (user_id, link_id, block_id, kind, data, visitor, created_at, read_at) VALUES (?, ?, ?, 'poll', ?, ?, ?, ?)").run(link.user_id, link.id, b.id, JSON.stringify({ option: opts[i] }), visitor, now, now)
      reply.setCookie(`tb_poll_${b.id}`, '1', { ...cookieOpts(deps, 30 * 86400), httpOnly: true })
      return back()
    }
    if (!checked(body, 'consent')) return back(`?err=consent&b=${b.id}`)
    const email = field(body, 'email').trim().toLowerCase()
    const phone = field(body, 'phone').trim()
    if (kind === 'email' || kind === 'subscribe') {
      if (!emailOk(email)) return back(`?err=email&b=${b.id}`)
      data = { email }
    } else if (kind === 'phone') {
      if (!phoneOk(phone)) return back(`?err=phone&b=${b.id}`)
      data = { phone: phone.replace(/[\s().-]/g, '') }
    } else {
      const name = field(body, 'name').trim().slice(0, 100)
      const message = field(body, 'message').trim().slice(0, 3000)
      if (!name || !emailOk(email) || !message) return back(`?err=contact&b=${b.id}`)
      if (phone && !phoneOk(phone)) return back(`?err=phone&b=${b.id}`)
      data = { name, email, message, ...(phone ? { phone } : {}) }
    }
    // mismo visitante, mismo bloque, en menos de un minuto: doble clic, no se duplica
    const recent = db.prepare('SELECT 1 FROM collected WHERE block_id = ? AND visitor = ? AND created_at > ?').get(b.id, visitor, now - 60_000)
    if (!recent) {
      const id = Number(db.prepare('INSERT INTO collected (user_id, link_id, block_id, kind, data, visitor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(link.user_id, link.id, b.id, kind, JSON.stringify(data), visitor, now).lastInsertRowid)
      const targetIds = Array.isArray(b.data.targets) ? (b.data.targets as number[]) : []
      const notice: Notice = {
        title: `${kind === 'contact' ? 'Nuevo mensaje' : kind === 'subscribe' ? 'Nueva suscripción' : 'Nuevo dato'} en /${link.alias}`,
        lines: Object.entries(data).map(([k, v]) => [k, v] as [string, string]),
        url: `${deps.config.baseUrl}/panel/data`,
        at: now,
        payload: { id, page: link.alias, block: b.type, kind, data },
      }
      for (const tid of targetIds) {
        const t = getOwnTarget(deps, tid, link.user_id)
        if (t?.is_enabled) enqueue(deps, 'notify', { target_id: t.id, notice })
      }
    }
    return back()
  })

  // ---------- bandeja «Datos» ----------
  function dataPage(ctx: Ctx, user: User, opts: { kind?: string; link?: number }) {
    const { t, locale } = ctx
    const where = ['c.user_id = @u', "c.kind != 'poll'"]
    const params: Record<string, unknown> = { u: user.id }
    if (opts.kind && Object.values(KIND_OF).includes(opts.kind as never)) {
      where.push('c.kind = @k')
      params.k = opts.kind
    }
    if (opts.link) {
      where.push('c.link_id = @l')
      params.l = opts.link
    }
    const rows = db.prepare(`SELECT c.*, l.alias FROM collected c JOIN links l ON l.id = c.link_id WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC LIMIT 300`).all(params) as Row[]
    const bios = listLinks(db, user.id, { kind: 'bio', limit: 500 }).items
    const unread = db.prepare("SELECT COUNT(*) FROM collected WHERE user_id = ? AND read_at IS NULL AND kind != 'poll'").pluck().get(user.id) as number
    const qs = new URLSearchParams()
    if (opts.kind) qs.set('kind', opts.kind)
    if (opts.link) qs.set('link', String(opts.link))
    return panelLayout(ctx, {
      title: t('nav.data'),
      active: 'data',
      path: '/panel/data',
      body: html`<div class="page-head"><h1>${t('nav.data')}</h1>
  <div class="btn-row"><a class="btn" href="/panel/data.csv${qs.toString() ? `?${qs}` : ''}" download>CSV</a>
  ${unread ? postButton(ctx, '/panel/data/read', t('data.mark_read', { n: unread }), { cls: 'btn' }) : ''}</div></div>
<p class="muted">${t('data.intro')}</p>
<form class="toolbar" method="get" action="/panel/data">
  ${select({ ctx, name: 'kind', label: t('links.kind'), value: opts.kind ?? '', options: [{ value: '', label: t('links.all_kinds') }, ...['email', 'phone', 'contact', 'subscribe'].map((k) => ({ value: k, label: t(`data.kind_${k}`) }))] })}
  ${select({ ctx, name: 'link', label: t('links.kind_bio'), value: opts.link ?? '', options: [{ value: '', label: t('links.all_kinds') }, ...bios.map((l) => ({ value: String(l.id), label: l.title || l.alias }))] })}
  <button class="btn" type="submit">${t('links.filter')}</button>
</form>
${rows.length === 0
  ? emptyState(t('data.empty'), html`<p class="muted">${t('data.empty_body')}</p>`)
  : html`<form method="post" action="/panel/data/delete" data-confirm="${t('data.delete_confirm')}">${csrfField(ctx)}
  <ul class="list">${rows.map((r) => {
    let d: Record<string, string> = {}
    try {
      d = JSON.parse(r.data)
    } catch {
      /* vacío */
    }
    return html`<li${r.read_at ? '' : html` class="unread"`}>
      <input type="checkbox" name="ids" value="${r.id}" aria-label="${t('data.select')}">
      <div class="grow"><div class="title">${d.name ? html`${d.name} · ` : ''}${d.email ?? d.phone ?? ''}${!r.read_at ? html` <span class="tag">${t('data.new')}</span>` : ''}</div>
      ${d.message ? html`<p class="msg">${d.message}</p>` : ''}
      <div class="sub">${t(`data.kind_${r.kind}`)} · /${r.alias} · ${formatDateTime(locale, r.created_at, user.timezone)}</div></div>
    </li>`
  })}</ul>
  <p><button class="btn btn-danger btn-sm" type="submit">${t('data.delete_selected')}</button> <span class="muted">${t('data.count', { n: formatNumber(locale, rows.length) })}</span></p></form>`}`,
    })
  }

  app.get('/panel/data', { preHandler: userGuard }, async (req, reply) => {
    const q = req.query as { kind?: string; link?: string }
    return sendHtml(reply, dataPage(req.ctx, req.ctx.user as User, { kind: q.kind || undefined, link: Number(q.link) || undefined }))
  })

  app.get('/panel/data.csv', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    const q = req.query as { kind?: string; link?: string }
    const rows = db
      .prepare(`SELECT c.*, l.alias FROM collected c JOIN links l ON l.id = c.link_id WHERE c.user_id = ? AND c.kind != 'poll' ${q.kind ? 'AND c.kind = ?' : ''} ${Number(q.link) ? 'AND c.link_id = ?' : ''} ORDER BY c.created_at`)
      .all(...[user.id, ...(q.kind ? [q.kind] : []), ...(Number(q.link) ? [Number(q.link)] : [])]) as Row[]
    const cols = ['created_at', 'page', 'kind', 'name', 'email', 'phone', 'message']
    let out = '﻿' + cols.join(',') + '\n'
    for (const r of rows) {
      const d = JSON.parse(r.data) as Record<string, string>
      out += [new Date(r.created_at).toISOString(), r.alias, r.kind, d.name, d.email, d.phone, d.message].map(csvCell).join(',') + '\n'
    }
    reply.header('Content-Disposition', 'attachment; filename="tubio-datos.csv"')
    return reply.type('text/csv; charset=utf-8').send(out)
  })

  app.post('/panel/data/read', { preHandler: userGuard }, async (req, reply) => {
    db.prepare('UPDATE collected SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(deps.now(), (req.ctx.user as User).id)
    return reply.redirect('/panel/data', 303)
  })

  app.post('/panel/data/delete', { preHandler: userGuard }, async (req, reply) => {
    const ids = fieldAll(req.body, 'ids').map(Number).filter(Number.isInteger).slice(0, 1000)
    if (ids.length) db.prepare(`DELETE FROM collected WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`).run((req.ctx.user as User).id, ...ids)
    setFlash(reply, deps, { type: 'ok', key: 'data.deleted' })
    return reply.redirect('/panel/data', 303)
  })

  // ---------- destinos de aviso ----------
  function targetsPage(ctx: Ctx, user: User, kind: TargetKind, errors: Errors = {}, values: Record<string, string> = {}) {
    const { t } = ctx
    const list = listTargets(deps, user.id)
    const extra =
      kind === 'webhook'
        ? html`${input({ ctx, name: 'url', type: 'url', label: t('notify.url'), value: values.url, error: errors.url, required: true, placeholder: 'https://' })}${input({ ctx, name: 'secret', label: t('notify.secret'), value: values.secret, hint: t('notify.secret_hint'), maxlength: 200 })}`
        : kind === 'slack' || kind === 'discord'
          ? input({ ctx, name: 'url', type: 'url', label: t(`notify.${kind}_url`), value: values.url, error: errors.url, required: true, placeholder: 'https://' })
          : kind === 'telegram'
            ? html`${input({ ctx, name: 'token', label: t('notify.tg_token'), value: values.token, error: errors.token, required: true, hint: t('notify.tg_token_hint') })}${input({ ctx, name: 'chat_id', label: t('notify.tg_chat'), value: values.chat_id, error: errors.chat_id, required: true, hint: t('notify.tg_chat_hint') })}`
            : html`<p class="hint">${t('notify.email_hint', { email: user.email })}</p>`
    return panelLayout(ctx, {
      title: t('nav.notifications'),
      active: 'data',
      path: '/panel/notifications',
      body: html`<h1>${t('nav.notifications')}</h1>
<p class="muted">${t('notify.intro')}</p>
${list.length === 0
  ? emptyState(t('notify.empty'), '')
  : html`<ul class="list">${list.map((x) => html`<li>
  <div class="grow"><div class="title">${x.name} <span class="tag">${t(`notify.kind_${x.kind}`)}</span>${x.is_enabled ? '' : html` <span class="tag tag-off">${t('links.disabled')}</span>`}</div>
  <div class="sub">${x.last_error ? html`<span class="error">${t('notify.last_error')}: ${x.last_error}</span>` : x.last_ok_at ? t('notify.last_ok', { when: formatDateTime(ctx.locale, x.last_ok_at, user.timezone) }) : t('notify.never')}</div></div>
  <div class="btn-row">${postButton(ctx, `/panel/notifications/${x.id}/test`, t('notify.test'), { cls: 'btn btn-sm' })}
  ${postButton(ctx, `/panel/notifications/${x.id}/toggle`, x.is_enabled ? t('bio.hide') : t('bio.show'), { cls: 'btn btn-sm' })}
  ${postButton(ctx, `/panel/notifications/${x.id}/delete`, t('common.delete'), { cls: 'btn btn-sm btn-danger', confirm: t('notify.delete_confirm') })}</div>
</li>`)}</ul>`}
<h2>${t('notify.new')}</h2>
<nav class="tabs" aria-label="${t('notify.new')}">${TARGET_KINDS.map((k) => html`<a href="/panel/notifications?kind=${k}"${k === kind ? html` aria-current="page"` : ''}>${t(`notify.kind_${k}`)}</a>`)}</nav>
<form class="card" method="post" action="/panel/notifications?kind=${kind}" novalidate>
  ${csrfField(ctx)}
  ${input({ ctx, name: 'name', label: t('notify.name'), value: values.name ?? t(`notify.kind_${kind}`), error: errors.name, required: true, maxlength: 60 })}
  ${extra}
  ${checkbox({ name: 'test', label: t('notify.send_test'), checked: true })}
  <button class="btn btn-primary" type="submit">${t('notify.create')}</button>
</form>`,
    })
  }

  const kindOf = (req: FastifyRequest): TargetKind => {
    const k = (req.query as { kind?: string }).kind
    return (TARGET_KINDS as readonly string[]).includes(k ?? '') ? (k as TargetKind) : 'email'
  }

  app.get('/panel/notifications', { preHandler: userGuard }, async (req, reply) => sendHtml(reply, targetsPage(req.ctx, req.ctx.user as User, kindOf(req))))

  const testNotice = (deps: AppDeps): Notice => ({ title: 'Prueba de tubio', lines: [['mensaje', 'Si ves esto, el aviso funciona.']], url: `${deps.config.baseUrl}/panel/data`, at: deps.now(), payload: { test: true } })

  app.post('/panel/notifications', { preHandler: userGuard, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const user = req.ctx.user as User
    const kind = kindOf(req)
    const raw: Record<string, string> = { url: field(req.body, 'url'), secret: field(req.body, 'secret'), token: field(req.body, 'token'), chat_id: field(req.body, 'chat_id') }
    const name = field(req.body, 'name').trim().slice(0, 60)
    if (!name) return sendHtml(reply, targetsPage(req.ctx, user, kind, { name: 'err.required' }, { ...raw, name }), 422)
    if (listTargets(deps, user.id).length >= 20) return sendHtml(reply, targetsPage(req.ctx, user, kind, { name: 'err.too_many_targets' }, { ...raw, name }), 422)
    const v = validateTarget(kind, raw)
    if ('error' in v) return sendHtml(reply, targetsPage(req.ctx, user, kind, { [v.field]: v.error }, { ...raw, name }), 422)
    const id = Number(db.prepare('INSERT INTO notify_targets (user_id, kind, name, config, created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, kind, name, JSON.stringify(v.config), deps.now()).lastInsertRowid)
    if (checked(req.body, 'test')) await sendTest(user, id, reply)
    else setFlash(reply, deps, { type: 'ok', key: 'notify.created' })
    return reply.redirect('/panel/notifications', 303)
  })

  async function sendTest(user: User, id: number, reply: FastifyReply) {
    const t = getOwnTarget(deps, id, user.id)
    if (!t) return
    try {
      await deliver(deps, t, testNotice(deps))
      db.prepare('UPDATE notify_targets SET last_ok_at = ?, last_error = NULL WHERE id = ?').run(deps.now(), id)
      setFlash(reply, deps, { type: 'ok', key: 'notify.test_ok' })
    } catch (e) {
      db.prepare('UPDATE notify_targets SET last_error = ? WHERE id = ?').run(String((e as Error).message ?? e).slice(0, 200), id)
      setFlash(reply, deps, { type: 'error', key: 'notify.test_fail' })
    }
  }

  const ownTarget = (req: FastifyRequest) => getOwnTarget(deps, Number((req.params as { id: string }).id), (req.ctx.user as User).id)

  app.post('/panel/notifications/:id/test', { preHandler: userGuard, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const t = ownTarget(req)
    if (!t) return reply.callNotFound()
    await sendTest(req.ctx.user as User, t.id, reply)
    return reply.redirect('/panel/notifications', 303)
  })
  app.post('/panel/notifications/:id/toggle', { preHandler: userGuard }, async (req, reply) => {
    const t = ownTarget(req)
    if (!t) return reply.callNotFound()
    db.prepare('UPDATE notify_targets SET is_enabled = ? WHERE id = ?').run(t.is_enabled ? 0 : 1, t.id)
    return reply.redirect('/panel/notifications', 303)
  })
  app.post('/panel/notifications/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    const t = ownTarget(req)
    if (!t) return reply.callNotFound()
    db.prepare('DELETE FROM notify_targets WHERE id = ?').run(t.id)
    setFlash(reply, deps, { type: 'ok', key: 'notify.deleted' })
    return reply.redirect('/panel/notifications', 303)
  })

}
