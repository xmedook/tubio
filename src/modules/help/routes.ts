import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html, type SafeHtml } from '../../lib/html.ts'
import type { Locale } from '../../lib/i18n.ts'
import { fld, fldSelect, fldTextarea } from '../../views/sitio-ui.ts'
import { ic } from '../../views/sprite.ts'
import { csrfField, powAttr, powField } from '../../views/ui.ts'
import { docPage } from '../home/doc-page.ts'
import { siteShell } from '../home/shell-site.ts'
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

const ICONS: Record<string, string> = { 'primeros-pasos': 'link', enlaces: 'img', estadisticas: 'chart', dominios: 'globe', planes: 'gift', cuenta: 'users' }
const plainOf = (md: string) => md.replace(/^#.*$/gm, '').replace(/\{\{\w+\}\}/g, '').replace(/[*`_>\[\]]|\(https?:[^)]*\)/g, '').replace(/\s+/g, ' ').trim()
const descOf = (md: string) => plainOf(md).slice(0, 110).replace(/\s\S*$/, '…')

/** Página del centro de ayuda con el diseño del sitio (bloque 6). */
function shell(ctx: Ctx, title: string, body: SafeHtml, pow = false): SafeHtml {
  return siteShell(ctx, { title: `${title} · túbio`, description: title, path: '/help', body: html`<section class="sec" style="border-top:0"><div class="wrap" style="max-width:720px">${body}</div></section>`, mainHref: ctx.user ? '/panel' : '/register', nav: 'help', scripts: pow ? ['pow.js'] : [] })
}

/**
 * Ticket en Zammad (TUBIO_ZAMMAD_URL + TUBIO_ZAMMAD_TOKEN, agente sólo del grupo TUBIO_ZAMMAD_GROUP).
 * El cliente del ticket es quien escribió, no no-reply. Devuelve el número o null si no se pudo.
 */
export async function zammadTicket(deps: AppDeps, t: { email: string; title: string; body: string; tags: string[] }): Promise<string | null> {
  const url = process.env.TUBIO_ZAMMAD_URL
  const token = process.env.TUBIO_ZAMMAD_TOKEN
  if (!url || !token) return null
  const http = deps.fetch ?? fetch
  try {
    const r = await http(`${url.replace(/\/$/, '')}/api/v1/tickets`, {
      method: 'POST',
      headers: { authorization: `Token token=${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: t.title,
        group: process.env.TUBIO_ZAMMAD_GROUP || 'tubio',
        customer_id: `guess:${t.email}`,
        tags: t.tags.join(','),
        article: { type: 'web', sender: 'Customer', internal: false, content_type: 'text/plain', subject: t.title, body: t.body },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!r.ok) return null
    const j = (await r.json()) as { number?: string }
    return j.number ?? null
  } catch {
    return null
  }
}

export function registerHelp(app: FastifyInstance, deps: AppDeps): void {
  const supportTo = () => process.env.TUBIO_SUPPORT_EMAIL || process.env.TUBIO_CONTACT_EMAIL || 'hola@tubio.link'

  app.get('/help', async (req, reply) => {
    const { t, locale } = req.ctx
    const q = String((req.query as { q?: string }).q ?? '').trim().slice(0, 60).toLowerCase()
    const all = HELP_ARTICLES.map((s) => ({ slug: s, md: load(s, locale) }))
    const found = q ? all.filter((x) => x.md.toLowerCase().includes(q)) : all
    reply.header('Cache-Control', q ? 'private, no-store' : 'public, max-age=600')
    const body = html`
<section class="hero"><div class="wrap" style="max-width:820px"><span class="k">${t('s6.help_k')}</span><h1 class="h1" style="font-size:clamp(34px,8vw,56px);margin:14px 0 18px">${t('s6.help_h')} <span class="hl-azul">${t('s6.help_hl')}</span>?</h1>
<form role="search" class="fld" action="/help" method="get"><label class="sr" for="hq">${t('s6.help_search')}</label><div style="display:flex;gap:8px"><input class="in" id="hq" name="q" type="search" value="${q}" placeholder="${t('s6.help_ph')}" style="flex:1;min-width:0"><button class="btn" type="submit">${t('s6.help_go')}</button></div></form></div></section>
<section class="sec" style="border-top:0"><div class="wrap">${q && !found.length ? html`<div class="al info" role="status">${ic('info')}<div>${t('s6.help_none', { q })}</div></div>` : ''}
<div class="grid g3">${found.map((x) => html`<a class="card" href="/help/${x.slug}" style="text-decoration:none;display:grid;gap:8px;align-content:start"><span class="av" style="width:44px;height:44px;border-radius:8px;background:var(--soft)" aria-hidden="true">${ic(ICONS[x.slug] ?? 'info')}</span><h3 class="h4">${titleOf(x.md)}</h3><p class="p sm">${descOf(x.md)}</p></a>`)}</div></div></section>
<section class="band"><div class="wrap hero-g"><div><h2 class="h2">${t('s6.help_not')}</h2><p class="lead" style="margin-top:10px">${t('help.lead')}</p></div><div class="btns row"><a class="btn" href="/help/contact">${t('help.contact')}</a></div></div></section>`
    return sendHtml(reply, siteShell(req.ctx, { title: `${t('help.title')} · túbio`, description: t('help.lead'), path: '/help', body, mainHref: req.ctx.user ? '/panel' : '/register', nav: 'help' }))
  })

  app.get('/help/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    if (slug === 'contact') return contactPage(req.ctx, reply)
    if (!(HELP_ARTICLES as readonly string[]).includes(slug)) return reply.callNotFound()
    const { t } = req.ctx
    const md = load(slug, req.ctx.locale)
    reply.header('Cache-Control', 'public, max-age=600')
    return sendHtml(reply, docPage(req.ctx, { md, path: `/help/${slug}`, kicker: t('help.title'), nav: 'help', tocLabel: t('s6.toc_article'), description: descOf(md), crumb: html`<nav aria-label="${t('s6.crumb')}" class="sm p"><a href="/help">${t('help.title')}</a> / <span>${titleOf(md)}</span></nav>` }))
  })

  function contactPage(ctx: Ctx, reply: Parameters<typeof sendHtml>[0], opts: { error?: string; sent?: boolean; values?: Record<string, string> } = {}, code = 200) {
    const { t } = ctx
    const me = (ctx.member ?? ctx.user) as User | null
    const v = opts.values ?? {}
    const pow = ctx.pow()
    reply.header('Cache-Control', 'private, no-store')
    return sendHtml(reply, shell(ctx, t('help.contact'), opts.sent
      ? html`<h1 class="h2" style="margin-bottom:14px">${t('help.contact')}</h1><div class="al ok" role="status">${ic('check')}<div>${t('help.sent')}</div></div><p style="margin-top:18px"><a class="btn btn-s" href="/help">${t('help.back')}</a></p>`
      : html`<h1 class="h2" style="margin-bottom:8px">${t('help.contact')}</h1><p class="p" style="margin-bottom:20px">${t('help.contact_lead')}</p>
<form class="form" method="post" action="/help/contact" novalidate${powAttr(pow)}>${csrfField(ctx)}
${opts.error ? html`<div class="al crit" role="alert">${ic('alert')}<div>${t(opts.error)}</div></div>` : ''}
${fld({ ctx, name: 'email', type: 'email', label: t('auth.email'), value: v.email ?? me?.email ?? '', autocomplete: 'email' })}
${fldSelect({ ctx, name: 'topic', label: t('help.topic'), value: v.topic ?? 'other', options: TOPICS.map((k) => ({ value: k, label: t(`help.topic_${k}`) })) })}
${fldTextarea({ ctx, name: 'message', label: t('help.message'), value: v.message ?? '', rows: 6, maxlength: 4000 })}
${powField(ctx, pow)}<button class="btn btn-b" type="submit">${t('help.send')} ${ic('ar')}</button></form>`, true), code)
  }

  app.post('/help/contact', { config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const ctx = req.ctx
    const values = { email: field(req.body, 'email').trim().slice(0, 254), topic: field(req.body, 'topic'), message: field(req.body, 'message').trim().slice(0, 4000) }
    if (!powOk(deps, req.body)) return contactPage(ctx, reply, { error: 'err.pow', values }, 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return contactPage(ctx, reply, { error: 'err.email', values }, 422)
    if (values.message.length < 10) return contactPage(ctx, reply, { error: 'help.too_short', values }, 422)
    const topic = (TOPICS as readonly string[]).includes(values.topic) ? values.topic : 'other'
    const me = (ctx.member ?? ctx.user) as User | null
    const who = `${values.email}${me ? ` (cuenta #${me.id}${me.email !== values.email ? `, ${me.email}` : ''})` : ' (sin sesión)'}`
    const ticket = await zammadTicket(deps, {
      email: values.email,
      title: `[túbio] ${values.message.replace(/\s+/g, ' ').slice(0, 70)}`,
      body: [`De: ${who}`, `Tema: ${topic}`, `Idioma: ${ctx.locale}`, '', values.message].join('\n'),
      tags: ['tubio', topic],
    })
    if (ticket) return contactPage(ctx, reply, { sent: true })
    // sin Zammad (o falló): sólo a nuestro buzón (nunca al correo que escribió el visitante: eso sería un relevo de spam)
    await deps.mailer.send({
      to: supportTo(),
      replyTo: values.email,
      subject: `[túbio soporte] ${topic} — ${values.email}`,
      text: [`De: ${values.email}${me ? ` (cuenta #${me.id}${me.email !== values.email ? `, ${me.email}` : ''})` : ' (sin sesión)'}`, `Tema: ${topic}`, `Idioma: ${ctx.locale}`, '', values.message].join('\n'),
    })
    return contactPage(ctx, reply, { sent: true })
  })
}
