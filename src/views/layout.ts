import { html, type HtmlValue, type SafeHtml } from '../lib/html.ts'
import type { Ctx } from '../web/context.ts'
import { csrfField, flashBox } from './ui.ts'
import { icon } from './icons.ts'

export const ASSET_VERSION = '26'

function head(ctx: Ctx, title: string, extra: HtmlValue = ''): SafeHtml {
  return html`<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · tubio</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/_/static/css/app.css?v=${ASSET_VERSION}">
<link rel="icon" href="/_/static/img/favicon.svg" type="image/svg+xml">
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

function tab(active: NavKey | undefined, key: NavKey, href: string, label: string, ic: string): SafeHtml {
  return html`<a class="tab" href="${href}"${active === key ? html` aria-current="page"` : ''}><span class="tab-i">${icon(ic)}</span><span class="tab-l">${label}</span></a>`
}

export function panelLayout(
  ctx: Ctx,
  opts: { title: string; body: HtmlValue; active?: NavKey; path: string; head?: HtmlValue; wide?: boolean },
): SafeHtml {
  const { t, user } = ctx
  const nav: [NavKey, string, string][] = [
    ['links', '/panel', t('nav.links')],
    ['qr', '/panel/qr', t('nav.qr')],
    ['stats', '/panel/stats', t('nav.stats')],
    ['data', '/panel/data', t('nav.data')],
    ['projects', '/panel/projects', t('nav.projects')],
    ['account', '/panel/account', t('nav.account')],
  ]
  if (user?.role === 'admin') nav.push(['admin', '/admin', t('nav.admin')])
  return html`<html lang="${ctx.locale}">
${head(ctx, opts.title, opts.head)}
<body class="panel">
<a class="skip" href="#main">${t('a11y.skip')}</a>
<header class="topbar">
  <a class="brand" href="/panel" aria-label="tubio">tu<span>bio</span></a>
  <nav aria-label="${t('nav.main')}">
    <ul>${nav.map(
      ([k, href, label]) =>
        html`<li><a href="${href}"${k === opts.active ? html` aria-current="page"` : ''}>${label}</a></li>`,
    )}</ul>
  </nav>
  <div class="topbar-end">
    <a class="btn-link" href="/help">${t('help.title')}</a>
    ${langSwitch(ctx, opts.path)}
    <form method="post" action="/logout" class="inline">${csrfField(ctx)}<button class="btn-link" type="submit">${t('nav.logout')}</button></form>
  </div>
  <a class="icon-btn top-search" href="/panel?buscar=1" aria-label="${t('links.search')}">${icon('search')}</a>
  <a class="icon-btn bell" href="/panel/inbox" aria-label="${ctx.unread ? t('inbox.bell_n', { n: ctx.unread }) : t('inbox.title')}">${icon('bell')}${ctx.unread ? html`<span class="bell-n" aria-hidden="true">${ctx.unread > 9 ? '9+' : ctx.unread}</span>` : ''}</a>
  <details class="more-menu">
    <summary aria-label="${t('nav.more')}">${icon('more')}</summary>
    <ul class="menu">
      <li><a href="/panel/data">${t('nav.data')}</a></li>
      <li><a href="/panel/projects">${t('nav.projects')}</a></li>
      <li><a href="/panel/domains">${t('domains.title')}</a></li>
      <li><a href="/panel/pixels">${t('mk.title')}</a></li>
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
<details class="create fab-wrap">
  <summary class="fab" aria-label="${t('nav.create')}">${icon('plus')}</summary>
  <div class="sheet" role="menu">
    <span class="sheet-grip" aria-hidden="true"></span>
    <p class="sheet-title">${t('nav.create')}</p>
    <a role="menuitem" href="/panel/links/new?kind=bio"><span class="tipo-ic">${icon('bio')}</span><span><b>${t('links.kind_bio')}</b><small>${t('create.bio')}</small></span></a>
    <a role="menuitem" href="/panel/templates"><span class="tipo-ic">${icon('image')}</span><span><b>${t('tpl.start_with')}</b><small>${t('create.tpl')}</small></span></a>
    <a role="menuitem" href="/panel/links/new?kind=short"><span class="tipo-ic">${icon('short')}</span><span><b>${t('links.kind_short')}</b><small>${t('create.short')}</small></span></a>
    <a role="menuitem" href="/panel/qr/new"><span class="tipo-ic">${icon('qr')}</span><span><b>${t('nav.qr')}</b><small>${t('create.qr')}</small></span></a>
    <a role="menuitem" href="/panel/links/bulk"><span class="tipo-ic">${icon('links')}</span><span><b>${t('bulk.short')}</b><small>${t('create.bulk')}</small></span></a>
    <a role="menuitem" href="/panel/links/new?kind=file"><span class="tipo-ic">${icon('file')}</span><span><b>${t('links.kind_file')}</b><small>${t('create.file')}</small></span></a>
    <a role="menuitem" href="/panel/links/new?kind=vcard"><span class="tipo-ic">${icon('card')}</span><span><b>${t('links.kind_vcard')}</b><small>${t('create.vcard')}</small></span></a>
    <a role="menuitem" href="/panel/links/new?kind=event"><span class="tipo-ic">${icon('event')}</span><span><b>${t('links.kind_event')}</b><small>${t('create.event')}</small></span></a>
  </div>
</details>
<nav class="tabbar" aria-label="${t('nav.main')}">
  ${tab(opts.active, 'links', '/panel', t('nav.links'), 'links')}
  ${tab(opts.active, 'qr', '/panel/qr', 'QR', 'qr')}
  ${tab(opts.active, 'stats', '/panel/stats', t('nav.stats'), 'stats')}
  ${tab(opts.active, 'account', '/panel/account', t('nav.account'), 'user')}
</nav>
<footer class="foot"><a href="/terms">${t('legal.terms')}</a> · <a href="/privacy">${t('legal.privacy')}</a> · <a href="https://www.gnu.org/licenses/agpl-3.0.html">AGPL-3.0</a> · <a href="/source">${t('foot.source')}</a></footer>
</body>
</html>`
}

export function authLayout(ctx: Ctx, opts: { title: string; body: HtmlValue; path: string }): SafeHtml {
  return html`<html lang="${ctx.locale}">
${head(ctx, opts.title)}
<body class="auth">
<main id="main" class="auth-card">
  <a class="brand brand-lg" href="/" aria-label="tubio">tu<span>bio</span></a>
  ${flashBox(ctx)}
  ${opts.body}
  <p class="auth-foot">${langSwitch(ctx, opts.path)} · <a href="/terms">${ctx.t('legal.terms')}</a> · <a href="/privacy">${ctx.t('legal.privacy')}</a></p>
</main>
</body>
</html>`
}

/** Página simple para mensajes (404, error, enlace expirado…) */
export function messagePage(ctx: Ctx, opts: { title: string; message: string; status?: number }): SafeHtml {
  return html`<html lang="${ctx.locale}">
${head(ctx, opts.title)}
<body class="auth">
<main id="main" class="auth-card">
  <a class="brand brand-lg" href="/" aria-label="tubio">tu<span>bio</span></a>
  <h1>${opts.title}</h1>
  <p>${opts.message}</p>
</main>
</body>
</html>`
}
