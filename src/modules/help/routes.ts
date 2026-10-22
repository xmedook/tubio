import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html, raw, type SafeHtml } from '../../lib/html.ts'
import type { Locale } from '../../lib/i18n.ts'
import { renderMarkdown } from '../../lib/markdown.ts'
import { ASSET_VERSION } from '../../views/layout.ts'
import { csrfField, input, powAttr, powField, select, textarea } from '../../views/ui.ts'
import { powOk, sendHtml, type Ctx } from '../../web/context.ts'
import { field } from '../../web/forms.ts'
import type { User } from '../users/repo.ts'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../content/help')
export const HELP_ARTICLES = ['primeros-pasos', 'enlaces', 'estadisticas', 'dominios', 'planes', 'cuenta'] as const
const TOPICS = ['account', 'billing', 'bug', 'abuse', 'other'] as const

function load(slug: string, locale: Locale): string {
  try {
    return readFileSync(join(DIR, `${slug}.${locale}.md`), 'utf8')
  } catch {
    return readFileSync(join(DIR, `${slug}.es-MX.md`), 'utf8')
  }
}
const titleOf = (md: string) => /^#\s+(.+)$/m.exec(md)?.[1] ?? ''

function shell(ctx: Ctx, title: string, body: SafeHtml, pow = false): SafeHtml {
  const { t } = ctx
  return html`<html lang="${ctx.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · tubio</title><link rel="stylesheet" href="/_/static/css/app.css?v=${ASSET_VERSION}"><link rel="icon" href="/_/static/img/favicon.svg">
${pow ? html`<script type="module" src="/_/static/js/pow.js?v=${ASSET_VERSION}" nonce="${ctx.nonce}"></script>` : ''}</head>
<body class="legal"><main id="main" class="wrap legal-text"><p><a class="brand" href="/">tu<span>bio</span></a> · <a href="/help">${t('help.title')}</a></p>${body}
<p class="muted small"><a href="/help/contact">${t('help.contact')}</a> · <a href="/terms">${t('legal.terms')}</a> · <a href="/privacy">${t('legal.privacy')}</a></p></main></body></html>`
}

export function registerHelp(app: FastifyInstance, deps: AppDeps): void {
  const supportTo = () => process.env.TUBIO_SUPPORT_EMAIL || process.env.TUBIO_CONTACT_EMAIL || 'hola@tubio.link'

  app.get('/help', async (req, reply) => {
    const { t } = req.ctx
    reply.header('Cache-Control', 'public, max-age=600')
    return sendHtml(reply, shell(req.ctx, t('help.title'), html`<h1>${t('help.title')}</h1><p class="lead">${t('help.lead')}</p>
<ul class="help-list">${HELP_ARTICLES.map((s) => html`<li><a href="/help/${s}">${titleOf(load(s, req.ctx.locale))}</a></li>`)}</ul>
<p><a class="btn btn-primary" href="/help/contact">${t('help.contact')}</a></p>`))
  })

  app.get('/help/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    if (slug === 'contact') return contactPage(req.ctx, reply)
    if (!(HELP_ARTICLES as readonly string[]).includes(slug)) return reply.callNotFound()
    const md = load(slug, req.ctx.locale)
    reply.header('Cache-Control', 'public, max-age=600')
    return sendHtml(reply, shell(req.ctx, titleOf(md), html`${raw(renderMarkdown(md))}`))
  })

  function contactPage(ctx: Ctx, reply: Parameters<typeof sendHtml>[0], opts: { error?: string; sent?: boolean; values?: Record<string, string> } = {}, code = 200) {
    const { t } = ctx
    const me = (ctx.member ?? ctx.user) as User | null
    const v = opts.values ?? {}
    const pow = ctx.pow()
    reply.header('Cache-Control', 'private, no-store')
    return sendHtml(reply, shell(ctx, t('help.contact'), opts.sent
      ? html`<h1>${t('help.contact')}</h1><p class="flash flash-ok" role="status">${t('help.sent')}</p><p><a href="/help">${t('help.back')}</a></p>`
      : html`<h1>${t('help.contact')}</h1><p>${t('help.contact_lead')}</p>
<form method="post" action="/help/contact" novalidate${powAttr(pow)}>${csrfField(ctx)}
${input({ ctx, name: 'email', type: 'email', label: t('auth.email'), value: v.email ?? me?.email ?? '', required: true, autocomplete: 'email' })}
${select({ ctx, name: 'topic', label: t('help.topic'), value: v.topic ?? 'other', options: TOPICS.map((k) => ({ value: k, label: t(`help.topic_${k}`) })) })}
${textarea({ ctx, name: 'message', label: t('help.message'), value: v.message ?? '', required: true, rows: 6, maxlength: 4000 })}
${opts.error ? html`<p class="error" role="alert">${t(opts.error)}</p>` : ''}
${powField(ctx, pow)}<button class="btn btn-primary" type="submit">${t('help.send')}</button></form>`, true), code)
  }

  app.post('/help/contact', { config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const ctx = req.ctx
    const values = { email: field(req.body, 'email').trim().slice(0, 254), topic: field(req.body, 'topic'), message: field(req.body, 'message').trim().slice(0, 4000) }
    if (!powOk(deps, req.body)) return contactPage(ctx, reply, { error: 'err.pow', values }, 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return contactPage(ctx, reply, { error: 'err.email', values }, 422)
    if (values.message.length < 10) return contactPage(ctx, reply, { error: 'help.too_short', values }, 422)
    const topic = (TOPICS as readonly string[]).includes(values.topic) ? values.topic : 'other'
    const me = (ctx.member ?? ctx.user) as User | null
    // sólo a nuestro buzón (nunca al correo que escribió el visitante: eso sería un relevo de spam)
    await deps.mailer.send({
      to: supportTo(),
      replyTo: values.email,
      subject: `[tubio soporte] ${topic} — ${values.email}`,
      text: [`De: ${values.email}${me ? ` (cuenta #${me.id}${me.email !== values.email ? `, ${me.email}` : ''})` : ' (sin sesión)'}`, `Tema: ${topic}`, `Idioma: ${ctx.locale}`, '', values.message].join('\n'),
    })
    return contactPage(ctx, reply, { sent: true })
  })
}
