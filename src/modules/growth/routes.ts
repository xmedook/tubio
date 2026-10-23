import { notifyUser } from '../inbox/repo.ts'
import { randomInt } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { formatDateTime, formatNumber } from '../../lib/i18n.ts'
import { imageUrl } from '../../lib/uploads.ts'
import { ASSET_VERSION, panelLayout } from '../../views/layout.ts'
import { emptyState, input, postButton, select } from '../../views/ui.ts'
import { adminGuard, cookieOpts, sendHtml, userGuard } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import { actorOf } from '../auth/routes.ts'
import { linkUrl } from '../links/repo.ts'
import { money } from '../plans/routes.ts'
import { audit, getSetting } from '../settings/repo.ts'
import { findUserById, updateUser, type User } from '../users/repo.ts'

const CATS = ['creator', 'business', 'music', 'art', 'food', 'education', 'tech', 'health', 'nonprofit', 'other']
const REF = 'abcdefghjkmnpqrstuvwxyz23456789'

export function refCodeOf(deps: AppDeps, user: User): string {
  if (user.ref_code) return user.ref_code
  let code = ''
  do {
    code = ''
    for (let i = 0; i < 7; i++) code += REF[randomInt(REF.length)]
  } while (deps.db.prepare('SELECT 1 FROM users WHERE ref_code = ?').get(code))
  updateUser(deps.db, user.id, { ref_code: code }, deps.now())
  return code
}

/** Al aprobar un pago: comisión para quien refirió (una por pago) */
export function creditReferral(deps: AppDeps, payment: { id: number; user_id: number; amount: number; discount: number; currency: string }): void {
  const u = findUserById(deps.db, payment.user_id)
  if (!u?.referred_by) return
  const pct = getSetting(deps.db, 'referral_percent')
  const amount = Math.round(((payment.amount - payment.discount) * pct) / 100)
  if (amount <= 0) return
  const r = deps.db.prepare('INSERT OR IGNORE INTO referral_earnings (affiliate_id, referred_id, payment_id, amount, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(u.referred_by, u.id, payment.id, amount, payment.currency, deps.now())
  if (r.changes) notifyUser(deps.db, u.referred_by, { kind: 'referral', title: 'Ganaste una comisión de afiliado', body: `${(amount / 100).toFixed(2)} ${payment.currency}`, url: '/panel/referrals' }, deps.now())
}

export function registerGrowth(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps

  // ?ref=CODIGO en cualquier página pública deja la cookie de referido (30 días; gana el primero)
  app.addHook('onRequest', async (req, reply) => {
    const ref = (req.query as { ref?: string } | undefined)?.ref
    if (typeof ref === 'string' && /^[a-z0-9]{7}$/.test(ref) && !req.cookies.tb_ref) {
      reply.setCookie('tb_ref', ref, { ...cookieOpts(deps, 30 * 86400), signed: true })
    }
  })

  // ---------- directorio ----------
  app.get('/directory', async (req, reply) => {
    const ctx = req.ctx
    const { t } = ctx
    const q = req.query as { q?: string; cat?: string; page?: string }
    const term = (q.q ?? '').trim().slice(0, 60)
    const cat = CATS.includes(q.cat ?? '') ? (q.cat as string) : ''
    const page = Math.max(1, Number(q.page) || 1)
    const like = `%${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`
    const rows = db
      .prepare(
        `SELECT l.id, l.alias, l.title, l.domain_id, json_extract(l.data, '$.seo_description') AS descr, json_extract(l.data, '$.category') AS cat,
          (SELECT json_extract(b.data, '$.image') FROM bio_blocks b WHERE b.link_id = l.id AND b.type = 'avatar' AND b.is_enabled = 1 ORDER BY b.position LIMIT 1) AS avatar,
          u.is_verified
         FROM links l JOIN users u ON u.id = l.user_id
         WHERE l.kind = 'bio' AND l.is_enabled = 1 AND l.dir_hidden = 0 AND l.password_hash IS NULL AND l.is_sensitive = 0
           AND json_extract(l.data, '$.directory') = 1 AND u.status = 'active' AND u.email_verified_at IS NOT NULL
           AND (SELECT COUNT(*) FROM bio_blocks b WHERE b.link_id = l.id AND b.is_enabled = 1) >= 3
           ${cat ? "AND json_extract(l.data, '$.category') = @cat" : ''}
           ${term ? "AND (l.title LIKE @like ESCAPE '\\' OR l.alias LIKE @like ESCAPE '\\' OR json_extract(l.data, '$.seo_description') LIKE @like ESCAPE '\\')" : ''}
         ORDER BY u.is_verified DESC, l.clicks DESC LIMIT 25 OFFSET @off`,
      )
      .all({ cat, like, off: (page - 1) * 24 }) as { id: number; alias: string; title: string; domain_id: number; descr: string | null; cat: string | null; avatar: string | null; is_verified: number }[]
    const more = rows.length > 24
    const qs = (p: number) => `/directory?${new URLSearchParams({ ...(term ? { q: term } : {}), ...(cat ? { cat } : {}), page: String(p) })}`
    return sendHtml(reply, html`<html lang="${ctx.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t('dir.title')} · tubio</title>
<meta name="description" content="${t('dir.desc')}"><link rel="stylesheet" href="/_/static/css/app.css?v=${ASSET_VERSION}"><link rel="icon" href="/_/static/img/favicon.svg"></head>
<body class="home"><header class="home-top"><a class="brand" href="/">tu<span>bio</span></a><nav><a href="/blog">${t('site.blog')}</a> <a href="/login">${t('auth.login_link')}</a></nav></header>
<main id="main" class="wrap wrap-wide"><h1>${t('dir.title')}</h1><p class="muted">${t('dir.desc')}</p>
<form class="toolbar" method="get" action="/directory" role="search">${input({ ctx, name: 'q', type: 'search', label: t('links.search'), value: term })}
${select({ ctx, name: 'cat', label: t('dir.category'), value: cat, options: [{ value: '', label: t('dir.all') }, ...CATS.map((c) => ({ value: c, label: t(`dir.cat_${c}`) }))] })}<button class="btn" type="submit">${t('links.filter')}</button></form>
${rows.length === 0 ? emptyState(t('dir.empty'), '') : html`<ul class="dir-grid">${rows.slice(0, 24).map((r) => html`<li><a class="dir-card" href="${linkUrl(deps.config.baseUrl, r)}">
  ${r.avatar ? html`<img src="${imageUrl(r.avatar)}" alt="" loading="lazy" width="64" height="64">` : html`<span class="dir-ph" aria-hidden="true">${(r.title || r.alias).charAt(0).toUpperCase()}</span>`}
  <span class="dir-t">${r.title || r.alias}${r.is_verified ? ' ✓' : ''}</span>${r.descr ? html`<span class="dir-d">${r.descr}</span>` : ''}${r.cat ? html`<span class="tag">${t(`dir.cat_${r.cat}`)}</span>` : ''}</a></li>`)}</ul>`}
<nav class="pager">${page > 1 ? html`<a class="btn btn-sm" href="${qs(page - 1)}">← ${t('links.prev')}</a>` : ''}${more ? html`<a class="btn btn-sm" href="${qs(page + 1)}">${t('links.next')} →</a>` : ''}</nav>
</main><footer class="foot"><a href="/terms">${t('legal.terms')}</a> · <a href="/privacy">${t('legal.privacy')}</a></footer></body></html>`)
  })

  app.post('/admin/links/:id/dir-hide', { preHandler: adminGuard }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    db.prepare('UPDATE links SET dir_hidden = 1 - dir_hidden WHERE id = ?').run(id)
    audit(db, { actorId: actorOf(req), action: 'admin.dir_toggle', target: `link:${id}` }, deps.now())
    return reply.redirect('/admin/links', 303)
  })

  // ---------- afiliados ----------
  app.get('/panel/referrals', { preHandler: userGuard }, async (req, reply) => {
    const ctx = req.ctx
    const { t, locale } = ctx
    const user = (ctx.member ?? ctx.user) as User
    const code = refCodeOf(deps, user)
    const referred = db.prepare('SELECT COUNT(*) FROM users WHERE referred_by = ?').pluck().get(user.id) as number
    const sums = db.prepare("SELECT status, SUM(amount) AS s FROM referral_earnings WHERE affiliate_id = ? GROUP BY status").all(user.id) as { status: string; s: number }[]
    const sum = (st: string) => sums.find((x) => x.status === st)?.s ?? 0
    const url = `${deps.config.baseUrl}/?ref=${code}`
    return sendHtml(reply, panelLayout(ctx, {
      title: t('ref.title'),
      active: 'account',
      path: '/panel/referrals',
      body: html`<h1>${t('ref.title')}</h1><p class="muted">${t('ref.intro', { pct: getSetting(db, 'referral_percent') })}</p>
<div class="card"><p class="mono">${url} <button type="button" class="btn-link" data-copy="${url}" data-copied="${t('links.copied')}">${t('links.copy')}</button></p></div>
<div class="kpis"><div class="kpi"><span class="kpi-n">${formatNumber(locale, referred)}</span><span class="kpi-l">${t('ref.referred')}</span></div>
<div class="kpi"><span class="kpi-n">${money(locale, sum('pending'))}</span><span class="kpi-l">${t('ref.pending')}</span></div>
<div class="kpi"><span class="kpi-n">${money(locale, sum('paid'))}</span><span class="kpi-l">${t('ref.paid')}</span></div></div>
<p class="hint">${t('ref.payout_hint')}</p>`,
    }))
  })

  app.get('/admin/referrals', { preHandler: adminGuard }, async (req, reply) => {
    const ctx = req.ctx
    const { t, locale } = ctx
    const rows = db.prepare("SELECT e.*, u.email FROM referral_earnings e JOIN users u ON u.id = e.affiliate_id WHERE e.status = 'pending' ORDER BY e.created_at").all() as { id: number; email: string; amount: number; currency: string; created_at: number }[]
    return sendHtml(reply, panelLayout(ctx, {
      title: t('ref.title'),
      active: 'admin',
      path: '/admin/referrals',
      body: html`<h1>${t('ref.title')}</h1>${rows.length === 0 ? emptyState(t('ref.none'), '') : html`<ul class="list">${rows.map((r) => html`<li><div class="grow"><div class="title">${r.email}</div><div class="sub">${money(locale, r.amount, r.currency)} · ${formatDateTime(locale, r.created_at, 'America/Mexico_City')}</div></div>
${postButton(ctx, `/admin/referrals/${r.id}/paid`, t('ref.mark_paid'), { cls: 'btn btn-sm btn-primary' })}${postButton(ctx, `/admin/referrals/${r.id}/void`, t('ref.void'), { cls: 'btn btn-sm' })}</li>`)}</ul>`}`,
    }))
  })
  for (const [path, status] of [['paid', 'paid'], ['void', 'void']] as const) {
    app.post(`/admin/referrals/:id/${path}`, { preHandler: adminGuard }, async (req, reply) => {
      db.prepare(`UPDATE referral_earnings SET status = ?, paid_at = ? WHERE id = ? AND status = 'pending'`).run(status, status === 'paid' ? deps.now() : null, Number((req.params as { id: string }).id))
      audit(db, { actorId: actorOf(req), action: `admin.referral_${status}`, target: field(req.body, 'id') }, deps.now())
      return reply.redirect('/admin/referrals', 303)
    })
  }

}
