import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { randomToken, safeEqual, sha256 } from '../../lib/crypto.ts'
import { html } from '../../lib/html.ts'
import { formatDateTime } from '../../lib/i18n.ts'
import { parseQrStyle, rasterizeSvg, renderQrSvg } from '../../lib/qr.ts'
import { UTM_KEYS } from '../../lib/urls.ts'
import { panelLayout } from '../../views/layout.ts'
import { csrfField, emptyState, input, postButton, toLocalInput } from '../../views/ui.ts'
import { sendHtml, userGuard } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { parseBlockForm } from '../bio/block-form.ts'
import { BLOCK_BY_TYPE } from '../bio/blocks.ts'
import { createBlock, deleteBlock, getOwnBlock, listBlocks } from '../bio/repo.ts'
import { defaultBioData } from '../bio/design.ts'
import { parseLinkForm } from '../links/form.ts'
import { createLink, deleteLink, getOwnLink, LINK_KINDS, linkUrl, listLinks, updateLink, type Link, type LinkKind } from '../links/repo.ts'
import { limitsOf, usageOf, withinLimit } from '../plans/limits.ts'
import { buildPayload, payloadText, QR_KINDS, type QrKind } from '../qr/payload.ts'
import { audit } from '../settings/repo.ts'
import { buildReport, parseRange } from '../stats/query.ts'
import { findUserById, type User } from '../users/repo.ts'

/**
 * API REST v1 (plan Negocio). Autenticación: `Authorization: Bearer tb_<prefijo>_<secreto>`.
 * JSON de entrada y salida. Sin cookies, así que no lleva CSRF.
 */

declare module 'fastify' {
  interface FastifyRequest {
    apiUser?: User
  }
}

const KEY_RE = /^tb_([a-z0-9]{8})_([A-Za-z0-9_-]{32,64})$/

function publicLink(baseUrl: string, l: Link, tz: string) {
  return {
    id: l.id,
    kind: l.kind,
    alias: l.alias,
    url: linkUrl(baseUrl, l),
    title: l.title,
    target_url: l.target_url,
    redirect_code: l.redirect_code,
    is_enabled: !!l.is_enabled,
    starts_at: l.starts_at ? new Date(l.starts_at).toISOString() : null,
    ends_at: l.ends_at ? new Date(l.ends_at).toISOString() : null,
    click_limit: l.click_limit,
    has_password: !!l.password_hash,
    is_sensitive: !!l.is_sensitive,
    utm: l.utm,
    project_id: l.project_id,
    clicks: l.clicks,
    created_at: new Date(l.created_at).toISOString(),
    updated_at: new Date(l.updated_at).toISOString(),
  }
}

/** JSON del API → campos de formulario que entienden los validadores del panel */
function linkFields(body: Record<string, unknown>, tz: string, existing?: Link): Record<string, string> {
  const f: Record<string, string> = {}
  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  const keep = <K extends keyof Link>(k: K) => (existing ? str(existing[k]) : '')
  f.alias = body.alias !== undefined ? str(body.alias) : (existing?.alias ?? '')
  f.title = body.title !== undefined ? str(body.title) : keep('title')
  f.target_url = body.target_url !== undefined ? str(body.target_url) : keep('target_url')
  f.redirect_code = body.redirect_code !== undefined ? str(body.redirect_code) : String(existing?.redirect_code ?? 302)
  const enabled = body.is_enabled !== undefined ? !!body.is_enabled : existing ? !!existing.is_enabled : true
  if (enabled) f.is_enabled = '1'
  const iso = (v: unknown, cur: number | null | undefined) => {
    if (v === undefined) return toLocalInput(cur ?? null, tz)
    if (v === null || v === '') return ''
    const t = Date.parse(String(v))
    return Number.isFinite(t) ? toLocalInput(t, tz) : 'invalido'
  }
  f.starts_at = iso(body.starts_at, existing?.starts_at)
  f.ends_at = iso(body.ends_at, existing?.ends_at)
  f.click_limit = body.click_limit !== undefined ? str(body.click_limit) : keep('click_limit')
  if (body.password !== undefined) {
    if (body.password === null || body.password === '') f.remove_password = '1'
    else f.password = str(body.password)
  }
  const sens = body.is_sensitive !== undefined ? !!body.is_sensitive : !!existing?.is_sensitive
  if (sens) f.is_sensitive = '1'
  const utm = (body.utm ?? existing?.utm ?? {}) as Record<string, unknown>
  for (const k of UTM_KEYS) if (utm[k]) f[k] = str(utm[k])
  f.project_id = body.project_id !== undefined ? str(body.project_id) : str(existing?.project_id ?? '')
  return f
}

export function registerApi(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  // ---------- llaves (panel) ----------
  app.get('/panel/api', { preHandler: userGuard }, async (req, reply) => {
    const ctx = req.ctx
    const { t } = ctx
    const user = req.ctx.user as User
    const lim = limitsOf(db, user, deps.now())
    const keys = db.prepare('SELECT id, name, prefix, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY id').all(user.id) as { id: number; name: string; prefix: string; last_used_at: number | null; created_at: number }[]
    const fresh = req.cookies.tb_newkey ? req.unsignCookie(req.cookies.tb_newkey) : null
    if (req.cookies.tb_newkey) reply.clearCookie('tb_newkey', { path: '/panel/api' })
    return sendHtml(reply, panelLayout(ctx, {
      title: 'API',
      active: 'account',
      path: '/panel/api',
      body: html`<h1>API</h1>
${!lim.api
  ? emptyState(t('api.locked'), html`<a class="btn btn-primary" href="/panel/plan">${t('plan.see_plans')}</a>`)
  : html`<p class="muted">${t('api.intro')} <a href="https://github.com/xmedook/tubio/blob/master/docs/API.md">${t('api.docs')}</a></p>
${fresh?.valid ? html`<div class="flash flash-ok" role="status">${t('api.new_key')}<br><code class="mono">${fresh.value}</code> <button type="button" class="btn-link" data-copy="${fresh.value ?? ''}" data-copied="${t('links.copied')}">${t('links.copy')}</button></div>` : ''}
${keys.length ? html`<ul class="list">${keys.map((k) => html`<li><div class="grow"><div class="title">${k.name}</div><div class="sub mono">tb_${k.prefix}_… · ${k.last_used_at ? t('api.used', { when: formatDateTime(ctx.locale, k.last_used_at, user.timezone) }) : t('api.never')}</div></div>
${postButton(ctx, `/panel/api/${k.id}/delete`, t('api.revoke'), { cls: 'btn btn-sm btn-danger', confirm: t('api.revoke_confirm') })}</li>`)}</ul>` : ''}
<form class="card" method="post" action="/panel/api" novalidate>${csrfField(ctx)}
  ${input({ ctx, name: 'name', label: t('api.key_name'), required: true, maxlength: 60, placeholder: 'Zapier, script…' })}
  <button class="btn btn-primary" type="submit">${t('api.create')}</button></form>`}`,
    }))
  })

  app.post('/panel/api', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    if (!limitsOf(db, user, deps.now()).api) return reply.redirect('/panel/plan', 303)
    if ((db.prepare('SELECT COUNT(*) FROM api_keys WHERE user_id = ?').pluck().get(user.id) as number) >= 10) return reply.redirect('/panel/api', 303)
    const name = field(req.body, 'name').trim().slice(0, 60) || 'API'
    let prefix = randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
    while (prefix.length < 8 || db.prepare('SELECT 1 FROM api_keys WHERE prefix = ?').get(prefix)) prefix = randomToken(8).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
    const secret = randomToken(32)
    db.prepare('INSERT INTO api_keys (user_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, name, prefix, sha256(secret), deps.now())
    audit(db, { actorId: user.id, userId: user.id, action: 'api.key_created', target: prefix }, deps.now())
    // la llave completa se muestra una sola vez
    reply.setCookie('tb_newkey', `tb_${prefix}_${secret}`, { path: '/panel/api', httpOnly: true, sameSite: 'strict', signed: true, maxAge: 120, secure: deps.config.baseUrl.startsWith('https://') })
    return reply.redirect('/panel/api', 303)
  })

  app.post('/panel/api/:id/delete', { preHandler: userGuard }, async (req, reply) => {
    db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(Number((req.params as { id: string }).id), (req.ctx.user as User).id)
    return reply.redirect('/panel/api', 303)
  })

  // ---------- API ----------
  const err = (reply: FastifyReply, status: number, code: string, details?: unknown) => reply.code(status).send({ error: { code, ...(details ? { details } : {}) } })

  async function auth(req: FastifyRequest, reply: FastifyReply) {
    const h = String(req.headers.authorization ?? '')
    const m = KEY_RE.exec(h.replace(/^Bearer\s+/i, ''))
    const row = m ? (db.prepare('SELECT * FROM api_keys WHERE prefix = ?').get(m[1]) as { id: number; user_id: number; key_hash: string } | undefined) : undefined
    if (!m || !row || !safeEqual(sha256(m[2] as string), row.key_hash)) return err(reply, 401, 'unauthorized')
    const user = findUserById(db, row.user_id)
    if (!user || user.status !== 'active') return err(reply, 401, 'unauthorized')
    if (!limitsOf(db, user, deps.now()).api) return err(reply, 402, 'plan_required')
    db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(deps.now(), row.id)
    req.apiUser = user
  }

  const opts = { preHandler: auth, config: { csrf: false, rateLimit: { max: 120, timeWindow: '1 minute', keyGenerator: (r: FastifyRequest) => String(r.headers.authorization ?? r.ip).slice(0, 20) } } }
  const U = (req: FastifyRequest) => req.apiUser as User
  const ownLink = (req: FastifyRequest) => getOwnLink(db, Number((req.params as { id: string }).id), U(req).id)

  app.get('/api/v1/me', opts, async (req) => {
    const u = U(req)
    const lim = limitsOf(db, u, deps.now())
    return { id: u.id, email: u.email, name: u.name, locale: u.locale, timezone: u.timezone, limits: lim, usage: usageOf(db, u.id) }
  })

  app.get('/api/v1/links', opts, async (req) => {
    const q = req.query as { kind?: string; q?: string; limit?: string; offset?: string }
    const kind = (LINK_KINDS as readonly string[]).includes(q.kind ?? '') ? (q.kind as LinkKind) : undefined
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50))
    const r = listLinks(db, U(req).id, { kind, q: q.q?.slice(0, 100), limit, offset: Math.max(0, Number(q.offset) || 0) })
    return { total: r.total, items: r.items.map((l) => publicLink(deps.config.baseUrl, l, U(req).timezone)) }
  })

  app.post('/api/v1/links', opts, async (req, reply) => {
    const user = U(req)
    const body = (req.body ?? {}) as Record<string, unknown>
    const kind = body.kind === 'bio' ? 'bio' : 'short'
    const lim = limitsOf(db, user, deps.now())
    const used = usageOf(db, user.id)
    if (kind === 'bio' ? !withinLimit(lim.bio_pages, used.bio_pages) : !withinLimit(lim.links, used.links)) return err(reply, 402, 'plan_limit')
    const r = await parseLinkForm(deps, user, kind, { fields: linkFields(body, user.timezone), files: [] }, undefined, false)
    if (!r.ok) return err(reply, 422, 'validation', r.errors)
    if (kind === 'bio') r.input.data = defaultBioData(r.input.title || r.input.alias, user.name)
    const link = createLink(db, user.id, r.input, deps.now())
    audit(db, { actorId: user.id, userId: user.id, action: 'link.create', target: `link:${link.id}`, meta: { kind, via: 'api' } }, deps.now())
    return reply.code(201).send(publicLink(deps.config.baseUrl, link, user.timezone))
  })

  app.get('/api/v1/links/:id', opts, async (req, reply) => {
    const l = ownLink(req)
    return l ? publicLink(deps.config.baseUrl, l, U(req).timezone) : err(reply, 404, 'not_found')
  })

  app.patch('/api/v1/links/:id', opts, async (req, reply) => {
    const l = ownLink(req)
    if (!l) return err(reply, 404, 'not_found')
    if (l.kind !== 'short' && l.kind !== 'bio') return err(reply, 422, 'kind_not_editable_via_api')
    const user = U(req)
    const r = await parseLinkForm(deps, user, l.kind, { fields: linkFields((req.body ?? {}) as Record<string, unknown>, user.timezone, l), files: [] }, l, false)
    if (!r.ok) return err(reply, 422, 'validation', r.errors)
    const { kind: _k, ...patch } = r.input
    updateLink(db, l.id, patch, deps.now())
    return publicLink(deps.config.baseUrl, getOwnLink(db, l.id, user.id) as Link, user.timezone)
  })

  app.delete('/api/v1/links/:id', opts, async (req, reply) => {
    const l = ownLink(req)
    if (!l) return err(reply, 404, 'not_found')
    deleteLink(db, l.id)
    return reply.code(204).send()
  })

  app.get('/api/v1/links/:id/stats', opts, async (req, reply) => {
    const l = ownLink(req)
    if (!l) return err(reply, 404, 'not_found')
    const q = req.query as { from?: string; to?: string }
    const r = buildReport(db, { linkId: l.id }, parseRange(q.from, q.to, U(req).timezone, deps.now()), 50)
    return { range: { from: r.range.from, to: r.range.to }, totals: r.totals, series: r.series, breakdowns: r.breakdowns, blocks: r.blocks }
  })

  app.get('/api/v1/links/:id/blocks', opts, async (req, reply) => {
    const l = ownLink(req)
    if (!l || l.kind !== 'bio') return err(reply, 404, 'not_found')
    return { items: listBlocks(db, l.id).map((b) => ({ id: b.id, type: b.type, position: b.position, is_enabled: !!b.is_enabled, data: b.data, clicks: b.clicks })) }
  })

  app.post('/api/v1/links/:id/blocks', opts, async (req, reply) => {
    const l = ownLink(req)
    if (!l || l.kind !== 'bio') return err(reply, 404, 'not_found')
    const user = U(req)
    const body = (req.body ?? {}) as { type?: string; data?: Record<string, unknown> }
    const def = BLOCK_BY_TYPE.get(String(body.type))
    if (!def) return err(reply, 422, 'unknown_type')
    // sólo bloques sin archivos por API (imágenes: subir desde el panel)
    if (def.fields.some((f) => f.kind === 'image' || f.kind === 'images' || f.kind === 'file')) return err(reply, 422, 'type_needs_upload')
    const fields: Record<string, string | string[]> = { is_enabled: '1' }
    for (const [k, v] of Object.entries(body.data ?? {})) {
      if (Array.isArray(v)) v.forEach((row, i) => (typeof row === 'object' && row ? Object.entries(row as Record<string, unknown>).forEach(([c, cv]) => (fields[`${k}__${i}__${c}`] = String(cv ?? ''))) : (fields[k] = v.map(String))))
      else if (typeof v === 'object' && v) Object.entries(v as Record<string, unknown>).forEach(([n, nv]) => (fields[`social_${n}`] = String(nv ?? '')))
      else if (typeof v === 'boolean') v && (fields[k] = '1')
      else fields[k] = String(v ?? '')
    }
    const r = await parseBlockForm(deps, user, def, { fields, files: [] }, undefined, new URL(deps.config.baseUrl).hostname)
    if (!r.ok) return err(reply, 422, 'validation', r.errors)
    const b = createBlock(db, l.id, r.input, deps.now())
    return reply.code(201).send({ id: b.id, type: b.type, position: b.position, data: b.data })
  })

  app.delete('/api/v1/blocks/:id', opts, async (req, reply) => {
    const b = getOwnBlock(db, Number((req.params as { id: string }).id), U(req).id)
    if (!b) return err(reply, 404, 'not_found')
    deleteBlock(db, b.id)
    return reply.code(204).send()
  })

  app.get('/api/v1/qr', opts, async (req) => ({
    items: (db.prepare('SELECT id, name, kind, link_id, created_at FROM qr_codes WHERE user_id = ? ORDER BY id DESC LIMIT 200').all(U(req).id) as Record<string, unknown>[]),
  }))

  /** QR al vuelo (sin guardarlo): POST { kind, data, style } → SVG o PNG */
  app.post('/api/v1/qr/render', opts, async (req, reply) => {
    const body = (req.body ?? {}) as { kind?: string; data?: Record<string, unknown>; style?: Record<string, unknown>; format?: string }
    if (!(QR_KINDS as readonly string[]).includes(body.kind ?? '') || body.kind === 'link') return err(reply, 422, 'unknown_kind')
    const raw: Record<string, string> = {}
    for (const [k, v] of Object.entries(body.data ?? {})) raw[k] = String(v ?? '')
    const p = buildPayload(body.kind as QrKind, raw)
    if (!p.ok) return err(reply, 422, 'validation', p.errors)
    const svg = renderQrSvg(p.text, parseQrStyle(body.style ?? {}))
    if (body.format === 'png') return reply.type('image/png').send(await rasterizeSvg(svg, 'png', parseQrStyle(body.style ?? {}).size))
    return reply.type('image/svg+xml').send(svg)
  })

  app.get('/api/v1/qr/:id.svg', opts, async (req, reply) => {
    const row = db.prepare('SELECT * FROM qr_codes WHERE id = ? AND user_id = ?').get(Number((req.params as { id: string }).id), U(req).id) as { kind: QrKind; data: string; style: string } | undefined
    if (!row) return err(reply, 404, 'not_found')
    const text = payloadText(row.kind, JSON.parse(row.data), (id) => {
      const l = getOwnLink(db, id, U(req).id)
      return l ? linkUrl(deps.config.baseUrl, l) : null
    })
    if (!text) return err(reply, 404, 'not_found')
    return reply.type('image/svg+xml').send(renderQrSvg(text, parseQrStyle(JSON.parse(row.style))))
  })

  app.get('/api/v1/data', opts, async (req) => {
    const q = req.query as { since?: string; limit?: string }
    const since = Date.parse(q.since ?? '') || 0
    const rows = db
      .prepare("SELECT c.id, c.kind, c.data, c.created_at, l.alias FROM collected c JOIN links l ON l.id = c.link_id WHERE c.user_id = ? AND c.kind != 'poll' AND c.created_at > ? ORDER BY c.created_at LIMIT ?")
      .all(U(req).id, since, Math.min(500, Number(q.limit) || 100)) as { id: number; kind: string; data: string; created_at: number; alias: string }[]
    return { items: rows.map((r) => ({ id: r.id, kind: r.kind, page: r.alias, data: JSON.parse(r.data), created_at: new Date(r.created_at).toISOString() })) }
  })

  app.get('/api/v1/projects', opts, async (req) => ({ items: db.prepare('SELECT id, name, color FROM projects WHERE user_id = ? ORDER BY name').all(U(req).id) }))

}
