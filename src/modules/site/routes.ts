import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html, raw, type SafeHtml } from '../../lib/html.ts'
import { formatDateTime, type Locale } from '../../lib/i18n.ts'
import { renderMarkdown } from '../../lib/markdown.ts'
import { ASSET_VERSION, panelLayout } from '../../views/layout.ts'
import { checkbox, csrfField, emptyState, input, postButton, select, textarea, type Errors } from '../../views/ui.ts'
import { adminGuard, sendHtml, setFlash, type Ctx } from '../../web/context.ts'
import { checked, field } from '../../web/forms.ts'
import { actorOf } from '../auth/routes.ts'
import { audit } from '../settings/repo.ts'

type SitePage = { id: number; kind: 'page' | 'post'; slug: string; locale: Locale; title: string; summary: string; body: string; in_footer: number; published_at: number | null; created_at: number; updated_at: number }

/** Páginas del pie (publicadas) en el idioma pedido; respaldo en español */
export function footerPages(deps: AppDeps, locale: Locale): { slug: string; title: string }[] {
  return deps.db
    .prepare("SELECT slug, title FROM site_pages WHERE kind = 'page' AND in_footer = 1 AND published_at IS NOT NULL AND published_at <= ? AND locale IN (?, 'es-MX') GROUP BY slug ORDER BY title")
    .all(deps.now(), locale) as { slug: string; title: string }[]
}

function shell(ctx: Ctx, title: string, body: SafeHtml, desc = ''): SafeHtml {
  const { t } = ctx
  return html`<html lang="${ctx.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · tubio</title>${desc ? html`<meta name="description" content="${desc}">` : ''}
<link rel="stylesheet" href="/_/static/css/app.css?v=${ASSET_VERSION}"><link rel="icon" href="/_/static/img/favicon.svg"></head>
<body class="legal"><header class="home-top"><a class="brand" href="/">tu<span>bio</span></a><nav><a href="/blog">${t('site.blog')}</a> <a href="/login">${t('auth.login_link')}</a></nav></header>
<main id="main" class="wrap legal-text">${body}</main>
<footer class="foot"><a href="/terms">${t('legal.terms')}</a> · <a href="/privacy">${t('legal.privacy')}</a> · <a href="/blog">${t('site.blog')}</a> · <a href="/source">${t('foot.source')}</a></footer></body></html>`
}

export function registerSite(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const published = (kind: string, slug: string, locale: Locale) =>
    (db.prepare('SELECT * FROM site_pages WHERE kind = ? AND slug = ? AND published_at IS NOT NULL AND published_at <= ? ORDER BY (locale = ?) DESC LIMIT 1').get(kind, slug, deps.now(), locale) as SitePage | undefined)

  app.get('/blog', async (req, reply) => {
    const ctx = req.ctx
    const { t, locale } = ctx
    const posts = db.prepare("SELECT * FROM site_pages WHERE kind = 'post' AND published_at IS NOT NULL AND published_at <= ? AND locale IN (?, 'es-MX') ORDER BY published_at DESC LIMIT 50").all(deps.now(), locale) as SitePage[]
    return sendHtml(reply, shell(ctx, t('site.blog'), html`<h1>${t('site.blog')}</h1>${posts.length === 0 ? html`<p class="muted">${t('site.no_posts')}</p>` : posts.map((p) => html`<article class="post-item"><h2><a href="/blog/${p.slug}">${p.title}</a></h2><p class="muted small">${formatDateTime(locale, p.published_at as number, 'America/Mexico_City')}</p>${p.summary ? html`<p>${p.summary}</p>` : ''}</article>`)}`, t('site.blog_desc')))
  })

  app.get('/blog/:slug', async (req, reply) => {
    const p = published('post', (req.params as { slug: string }).slug, req.ctx.locale)
    if (!p) return reply.callNotFound()
    return sendHtml(reply, shell(req.ctx, p.title, html`<p><a href="/blog">← ${req.ctx.t('site.blog')}</a></p><h1>${p.title}</h1><p class="muted small">${formatDateTime(req.ctx.locale, p.published_at as number, 'America/Mexico_City')}</p>${raw(renderMarkdown(p.body))}`, p.summary))
  })

  app.get('/p/:slug', async (req, reply) => {
    const p = published('page', (req.params as { slug: string }).slug, req.ctx.locale)
    if (!p) return reply.callNotFound()
    return sendHtml(reply, shell(req.ctx, p.title, html`<h1>${p.title}</h1>${raw(renderMarkdown(p.body))}`, p.summary))
  })

  // ---------- admin ----------
  function list(ctx: Ctx) {
    const { t } = ctx
    const rows = db.prepare('SELECT * FROM site_pages ORDER BY kind, updated_at DESC').all() as SitePage[]
    return panelLayout(ctx, {
      title: t('site.admin'),
      active: 'admin',
      path: '/admin/pages',
      body: html`<div class="page-head"><h1>${t('site.admin')}</h1><div class="btn-row"><a class="btn btn-primary" href="/admin/pages/new?kind=post">${t('site.new_post')}</a><a class="btn" href="/admin/pages/new?kind=page">${t('site.new_page')}</a></div></div>
${rows.length === 0 ? emptyState(t('site.empty'), '') : html`<ul class="list">${rows.map((p) => html`<li><div class="grow"><div class="title">${p.title} <span class="tag">${t(`site.kind_${p.kind}`)}</span> <span class="tag">${p.locale}</span>${p.published_at ? '' : html` <span class="tag tag-off">${t('site.draft')}</span>`}</div>
<div class="sub mono">${p.kind === 'post' ? '/blog/' : '/p/'}${p.slug}</div></div><a class="btn btn-sm" href="/admin/pages/${p.id}">${t('common.edit')}</a></li>`)}</ul>`}`,
    })
  }

  function form(ctx: Ctx, kind: 'page' | 'post', p?: Partial<SitePage>, errors: Errors = {}) {
    const { t } = ctx
    return panelLayout(ctx, {
      title: p?.title || t(kind === 'post' ? 'site.new_post' : 'site.new_page'),
      active: 'admin',
      path: '/admin/pages',
      body: html`<h1>${p?.id ? p.title : t(kind === 'post' ? 'site.new_post' : 'site.new_page')}</h1>
<form method="post" action="${p?.id ? `/admin/pages/${p.id}` : `/admin/pages?kind=${kind}`}" novalidate class="card">${csrfField(ctx)}
  <div class="grid-3">
    ${input({ ctx, name: 'title', label: t('bio.f.title'), value: p?.title, error: errors.title, required: true, maxlength: 160 })}
    ${input({ ctx, name: 'slug', label: t('site.slug'), value: p?.slug, error: errors.slug, required: true, maxlength: 80, hint: t('site.slug_hint') })}
    ${select({ ctx, name: 'locale', label: t('account.language'), value: p?.locale ?? 'es-MX', options: [{ value: 'es-MX', label: 'Español' }, { value: 'en', label: 'English' }] })}
  </div>
  ${input({ ctx, name: 'summary', label: t('site.summary'), value: p?.summary, maxlength: 300 })}
  ${textarea({ ctx, name: 'body', label: t('site.body'), value: p?.body, rows: 18, maxlength: 100000, hint: t('bio.f.markdown_hint') })}
  ${kind === 'page' ? checkbox({ name: 'in_footer', label: t('site.in_footer'), checked: !!p?.in_footer }) : ''}
  ${checkbox({ name: 'published', label: t('site.published'), checked: !!p?.published_at })}
  <div class="btn-row"><button class="btn btn-primary" type="submit">${t('common.save')}</button><a class="btn" href="/admin/pages">${t('common.cancel')}</a></div>
</form>
${p?.id ? postButton(ctx, `/admin/pages/${p.id}/delete`, t('common.delete'), { cls: 'btn btn-danger btn-sm', confirm: t('site.delete_confirm') }) : ''}`,
    })
  }

  const parse = (req: FastifyRequest) => {
    const b = req.body
    const errors: Errors = {}
    const title = field(b, 'title').trim().slice(0, 160)
    const slug = field(b, 'slug').trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
    if (!title) errors.title = 'err.required'
    if (!slug) errors.slug = 'err.required'
    const locale = field(b, 'locale') === 'en' ? 'en' : 'es-MX'
    return { errors, v: { title, slug, locale, summary: field(b, 'summary').trim().slice(0, 300), body: field(b, 'body').slice(0, 100000), in_footer: checked(b, 'in_footer') ? 1 : 0, published: checked(b, 'published') } }
  }

  app.get('/admin/pages', { preHandler: adminGuard }, async (req, reply) => sendHtml(reply, list(req.ctx)))
  app.get('/admin/pages/new', { preHandler: adminGuard }, async (req, reply) => sendHtml(reply, form(req.ctx, (req.query as { kind?: string }).kind === 'page' ? 'page' : 'post')))
  app.post('/admin/pages', { preHandler: adminGuard }, async (req, reply) => {
    const kind = (req.query as { kind?: string }).kind === 'page' ? 'page' : 'post'
    const { errors, v } = parse(req)
    if (!errors.slug && db.prepare('SELECT 1 FROM site_pages WHERE kind = ? AND slug = ? AND locale = ?').get(kind, v.slug, v.locale)) errors.slug = 'err.alias_taken'
    if (Object.keys(errors).length) return sendHtml(reply, form(req.ctx, kind, { ...v, locale: v.locale as Locale, kind }, errors), 422)
    const now = deps.now()
    const id = Number(db.prepare('INSERT INTO site_pages (kind, slug, locale, title, summary, body, in_footer, published_at, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(kind, v.slug, v.locale, v.title, v.summary, v.body, v.in_footer, v.published ? now : null, actorOf(req), now, now).lastInsertRowid)
    audit(db, { actorId: actorOf(req), action: 'site.page_create', target: `${kind}:${v.slug}` }, now)
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect(`/admin/pages/${id}`, 303)
  })
  const one = (req: FastifyRequest) => db.prepare('SELECT * FROM site_pages WHERE id = ?').get(Number((req.params as { id: string }).id)) as SitePage | undefined
  app.get('/admin/pages/:id', { preHandler: adminGuard }, async (req, reply) => {
    const p = one(req)
    return p ? sendHtml(reply, form(req.ctx, p.kind, p)) : reply.callNotFound()
  })
  app.post('/admin/pages/:id', { preHandler: adminGuard }, async (req, reply) => {
    const p = one(req)
    if (!p) return reply.callNotFound()
    const { errors, v } = parse(req)
    if (!errors.slug && db.prepare('SELECT 1 FROM site_pages WHERE kind = ? AND slug = ? AND locale = ? AND id != ?').get(p.kind, v.slug, v.locale, p.id)) errors.slug = 'err.alias_taken'
    if (Object.keys(errors).length) return sendHtml(reply, form(req.ctx, p.kind, { ...p, ...v, locale: v.locale as Locale }, errors), 422)
    const now = deps.now()
    db.prepare('UPDATE site_pages SET slug = ?, locale = ?, title = ?, summary = ?, body = ?, in_footer = ?, published_at = ?, updated_at = ? WHERE id = ?').run(v.slug, v.locale, v.title, v.summary, v.body, v.in_footer, v.published ? (p.published_at ?? now) : null, now, p.id)
    setFlash(reply, deps, { type: 'ok', key: 'account.saved' })
    return reply.redirect(`/admin/pages/${p.id}`, 303)
  })
  app.post('/admin/pages/:id/delete', { preHandler: adminGuard }, async (req, reply) => {
    db.prepare('DELETE FROM site_pages WHERE id = ?').run(Number((req.params as { id: string }).id))
    return reply.redirect('/admin/pages', 303)
  })
}
