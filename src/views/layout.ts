import { siteShell } from '../modules/home/shell-site.ts'
import { ic, sprite } from './sprite.ts'
import { html, type HtmlValue, type SafeHtml } from '../lib/html.ts'
import type { Ctx } from '../web/context.ts'
import { csrfField, flashBox } from './ui.ts'
import { icon } from './icons.ts'
import { brandHead, wordmark } from './brand.ts'

export const ASSET_VERSION = '64'

function head(ctx: Ctx, title: string, extra: HtmlValue = ''): SafeHtml {
  return html`<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · túbio</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/_/static/css/app.css?v=${ASSET_VERSION}">
${brandHead(ctx.baseUrl)}
<script type="module" src="/_/static/js/app.js?v=${ASSET_VERSION}" nonce="${ctx.nonce}"></script>
<script type="module" src="/_/static/js/pow.js?v=${ASSET_VERSION}" nonce="${ctx.nonce}"></script>
${extra}
</head>`
}

function langSwitch(ctx: Ctx, path: string): SafeHtml {
  const other = ctx.locale === 'es-MX' ? 'en' : 'es-MX'
  return html`<a class="lang" href="/lang/${other}?next=${encodeURIComponent(path)}" hreflang="${other}" lang="${other}">${other === 'en' ? 'English' : 'Español'}</a>`
}

export type NavKey = 'links' | 'qr' | 'stats' | 'data' | 'projects' | 'account' | 'admin'

function tab2(current: boolean, href: string, label: string, name: string): SafeHtml {
  return html`<a class="tab" href="${href}"${current ? html` aria-current="page"` : ''}><span class="tab-i">${ic(name)}</span><span class="tab-l">${label}</span></a>`
}

function tab(active: NavKey | undefined, key: NavKey, href: string, label: string, ic: string): SafeHtml {
  return html`<a class="tab" href="${href}"${active === key ? html` aria-current="page"` : ''}><span class="tab-i">${icon(ic)}</span><span class="tab-l">${label}</span></a>`
}

export function panelLayout(
  ctx: Ctx,
  opts: { title: string; body: HtmlValue; active?: NavKey; path: string; head?: HtmlValue; wide?: boolean; noCreate?: boolean },
): SafeHtml {
  const { t, user } = ctx
  const path = opts.path
  const on = (href: string) => (href === '/panel' ? opts.active === 'links' : path === href || path.startsWith(`${href}/`) || path.startsWith(`${href}?`))
  const item = (href: string, icon_: string, label: string, extra: HtmlValue = '') =>
    html`<a href="${href}"${on(href) ? html` aria-current="page"` : ''}>${ic(icon_)}<span>${label}</span>${extra}</a>`
  const unread = ctx.unread ? html`<span class="cnt-n" aria-label="${t('inbox.bell_n', { n: ctx.unread })}">${ctx.unread > 9 ? '9+' : ctx.unread}</span>` : ''
  const initials = ((user?.name || user?.email || '?').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('')) || '?'
  const more: [string, string, string][] = [['/panel/qr', 'qr', t('nav.qr')], ['/panel/data', 'chart', t('nav.data')], ['/panel/projects', 'set', t('nav.projects')], ['/panel/pixels', 'eye', t('mk.title')]]
  return html`<html lang="${ctx.locale}">
${head(ctx, opts.title, opts.head)}
<body class="panel">
<a class="skip" href="#main">${t('a11y.skip')}</a>
${sprite()}
<div class="app">
<aside class="side">
  <a class="logo" href="/panel" aria-label="túbio">${wordmark(32, 'auto')}</a>
  <nav aria-label="${t('nav.main')}">
    ${item('/panel', 'link', t('nav.links'))}${item('/panel/stats', 'chart', t('nav.stats'))}${item('/panel/domains', 'globe', t('domains.title'))}${item('/panel/team', 'users', t('team.title'))}${item('/panel/referrals', 'gift', t('ref.title'))}${item('/panel/account', 'set', t('nav.account'))}
    <p class="side-k">${t('s4.tools')}</p>
    ${more.map(([h, i, l]) => item(h, i, l))}${item('/panel/inbox', 'mail', t('inbox.title'), unread)}${user?.role === 'admin' ? item('/admin', 'lock', t('nav.admin')) : ''}
  </nav>
  <div class="side-user"><div class="side-who"><span class="av" aria-hidden="true">${initials}</span><span><b>${user?.name || user?.email || ''}</b></span></div>
    <div class="side-act"><a class="btn btn-s btn-sm" href="/help">${t('help.title')}</a>${langSwitch(ctx, opts.path)}<form method="post" action="/logout" class="inline">${csrfField(ctx)}<button class="btn-link" type="submit">${t('nav.logout')}</button></form></div></div>
</aside>
<div class="app-main">
<header class="topbar">
  <a class="brand" href="/panel" aria-label="túbio">${wordmark(28, 'auto')}</a>
  <a class="icon-btn top-search" href="/panel?buscar=1" aria-label="${t('links.search')}">${icon('search')}</a>
  <a class="icon-btn bell" href="/panel/inbox" aria-label="${ctx.unread ? t('inbox.bell_n', { n: ctx.unread }) : t('inbox.title')}">${icon('bell')}${ctx.unread ? html`<span class="bell-n" aria-hidden="true">${ctx.unread > 9 ? '9+' : ctx.unread}</span>` : ''}</a>
  <details class="more-menu">
    <summary aria-label="${t('nav.more')}">${icon('more')}</summary>
    <ul class="menu">
      <li><a href="/panel/qr">${t('nav.qr')}</a></li>
      <li><a href="/panel/data">${t('nav.data')}</a></li>
      <li><a href="/panel/projects">${t('nav.projects')}</a></li>
      <li><a href="/panel/pixels">${t('mk.title')}</a></li>
      <li><a href="/panel/referrals">${t('ref.title')}</a></li>
      ${user?.role === 'admin' ? html`<li><a href="/admin">${t('nav.admin')}</a></li>` : ''}
      <li><a href="/help">${t('help.title')}</a></li>
      <li>${langSwitch(ctx, opts.path)}</li>
      <li><form method="post" action="/logout">${csrfField(ctx)}<button type="submit">${t('nav.logout')}</button></form></li>
    </ul>
  </details>
</header>
${ctx.announcement ? html`<div class="banner${ctx.announcement.level === 'warn' ? ' banner-warn' : ''}" role="status">${ctx.announcement.text}</div>` : ''}
${ctx.session?.impersonator_id
  ? html`<div class="banner banner-warn">${t('admin.impersonating', { email: user?.email ?? '' })}
      <form method="post" action="/admin/stop-impersonating" class="inline">${csrfField(ctx)}<button class="btn-link" type="submit">${t('admin.stop_impersonating')}</button></form></div>`
  : ''}
${ctx.member
  ? html`<div class="banner banner-warn">${t('team.working_in', { who: user?.name || user?.email || '', role: t(`team.role_${ctx.teamRole}`) })}
      <form method="post" action="/panel/workspace/personal" class="inline">${csrfField(ctx)}<button class="btn-link" type="submit">${t('team.back')}</button></form></div>`
  : ''}
${user && !ctx.member && !user.email_verified_at
  ? html`<div class="banner">${t('auth.verify_banner')}
      <form method="post" action="/verify/resend" class="inline">${csrfField(ctx)}<button class="btn-link" type="submit">${t('auth.verify_resend')}</button></form></div>`
  : ''}
<main id="main" class="${opts.wide ? 'wrap wrap-wide' : 'wrap'}">
${flashBox(ctx)}
${opts.body}
</main>
${opts.noCreate ? '' : html`<details class="create fab-wrap">
  <summary class="fab" aria-label="${t('nav.create')}">${icon('plus')}</summary>
  <div class="sheet" role="menu">
    <span class="sheet-grip" aria-hidden="true"></span>
    <p class="sheet-title">${t('nav.create')}</p>
    <a role="menuitem" class="sheet-magic" href="/panel/varita"><span class="tipo-ic">${icon('wand')}</span><span><b>${t('varita.title')}</b><small>${t('create.varita')}</small></span></a>
    <a role="menuitem" href="/panel/links/new?kind=bio"><span class="tipo-ic">${icon('bio')}</span><span><b>${t('links.kind_bio')}</b><small>${t('create.bio')}</small></span></a>
    <a role="menuitem" href="/panel/templates"><span class="tipo-ic">${icon('image')}</span><span><b>${t('tpl.start_with')}</b><small>${t('create.tpl')}</small></span></a>
    <a role="menuitem" href="/panel/links/new?kind=short"><span class="tipo-ic">${icon('short')}</span><span><b>${t('links.kind_short')}</b><small>${t('create.short')}</small></span></a>
    <a role="menuitem" href="/panel/qr/new"><span class="tipo-ic">${icon('qr')}</span><span><b>${t('nav.qr')}</b><small>${t('create.qr')}</small></span></a>
    <a role="menuitem" href="/panel/links/bulk"><span class="tipo-ic">${icon('links')}</span><span><b>${t('bulk.short')}</b><small>${t('create.bulk')}</small></span></a>
    <a role="menuitem" href="/panel/links/new?kind=file"><span class="tipo-ic">${icon('file')}</span><span><b>${t('links.kind_file')}</b><small>${t('create.file')}</small></span></a>
    <a role="menuitem" href="/panel/links/new?kind=vcard"><span class="tipo-ic">${icon('card')}</span><span><b>${t('links.kind_vcard')}</b><small>${t('create.vcard')}</small></span></a>
    <a role="menuitem" href="/panel/links/new?kind=event"><span class="tipo-ic">${icon('event')}</span><span><b>${t('links.kind_event')}</b><small>${t('create.event')}</small></span></a>
  </div>
</details>`}
<nav class="tabbar" aria-label="${t('nav.main')}">
  ${tab2(on('/panel'), '/panel', t('nav.links'), 'link')}
  ${tab2(on('/panel/stats'), '/panel/stats', t('nav.stats'), 'chart')}
  ${tab2(on('/panel/domains'), '/panel/domains', t('s4.tab_domains'), 'globe')}
  ${tab2(on('/panel/team'), '/panel/team', t('team.title'), 'users')}
  ${tab2(on('/panel/account') || on('/panel/referrals'), '/panel/account', t('s4.tab_more'), 'set')}
</nav>
<footer class="foot"><a href="/terms">${t('legal.terms')}</a> · <a href="/privacy">${t('legal.privacy')}</a> · <a href="https://www.gnu.org/licenses/agpl-3.0.html">AGPL-3.0</a> · <a href="/source">${t('foot.source')}</a></footer>
</div>
</div>
</body>
</html>`
}

export function authLayout(ctx: Ctx, opts: { title: string; body: HtmlValue; path: string }): SafeHtml {
  return html`<html lang="${ctx.locale}">
${head(ctx, opts.title)}
<body class="auth">
<main id="main" class="auth-card">
  <a class="brand brand-lg" href="/" aria-label="túbio">${wordmark(40, 'auto')}</a>
  ${flashBox(ctx)}
  ${opts.body}
  <p class="auth-foot">${langSwitch(ctx, opts.path)} · <a href="/terms">${ctx.t('legal.terms')}</a> · <a href="/privacy">${ctx.t('legal.privacy')}</a></p>
</main>
</body>
</html>`
}

/** Página simple para mensajes (404, error, enlace expirado…) con el diseño del sitio (bloque 6). */
export function messagePage(ctx: Ctx, opts: { title: string; message: string; status?: number }): SafeHtml {
  const { t } = ctx
  const body = html`<section class="hero"><div class="wrap" style="max-width:720px;text-align:left">${opts.status ? html`<span class="k">${t('s6.err_k', { n: opts.status })}</span>` : ''}<h1 class="h1" style="margin:14px 0 14px"><span class="hl-rosa">${opts.title}</span></h1><p class="lead">${opts.message}</p>
<div class="btns row" style="margin-top:24px"><a class="btn" href="/">${t('s6.go_home')}</a><a class="btn btn-s" href="/directory">${t('s6.go_dir')}</a></div></div></section>`
  return siteShell(ctx, { title: `${opts.title} · túbio`, description: opts.message, path: '/', body, mainHref: ctx.user ? '/panel' : '/register', noindex: true })
}
