import { html, type SafeHtml } from '../../lib/html.ts'
import { formatNumber } from '../../lib/i18n.ts'
import { UTM_KEYS } from '../../lib/urls.ts'
import { panelLayout } from '../../views/layout.ts'
import { checkbox, emptyState, input, postButton, select, textarea, type Errors, type Option } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import type { Project } from '../projects/repo.ts'
import { type FormValues } from './form.ts'
import { LINK_KINDS, linkUrl, type Link, type LinkKind } from './repo.ts'

export function kindLabel(ctx: Ctx, kind: LinkKind): string {
  return ctx.t(`links.kind_${kind}`)
}

function projectOptions(ctx: Ctx, projects: Project[]): Option[] {
  return [{ value: '', label: ctx.t('links.no_project') }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]
}

export function dashboardPage(
  ctx: Ctx,
  opts: { items: Link[]; total: number; projects: Project[]; kind?: string | undefined; project?: number | undefined; q?: string | undefined; page: number; perPage: number },
): SafeHtml {
  const { t } = ctx
  const byId = new Map(opts.projects.map((p) => [p.id, p]))
  const pages = Math.max(1, Math.ceil(opts.total / opts.perPage))
  const qs = (page: number) => {
    const p = new URLSearchParams()
    if (opts.kind) p.set('kind', opts.kind)
    if (opts.project) p.set('project', String(opts.project))
    if (opts.q) p.set('q', opts.q)
    if (page > 1) p.set('page', String(page))
    const s = p.toString()
    return s ? `/panel?${s}` : '/panel'
  }
  const filtered = !!(opts.kind || opts.project || opts.q)
  return panelLayout(ctx, {
    title: t('nav.links'),
    active: 'links',
    path: '/panel',
    body: html`<div class="page-head">
  <h1>${t('nav.links')}</h1>
  <div class="btn-row" role="group" aria-label="${t('links.new')}">
    <a class="btn btn-primary" href="/panel/links/new?kind=bio">${t('links.new_bio')}</a>
    <a class="btn" href="/panel/links/new?kind=short">${t('links.new_short')}</a>
    <details class="menu"><summary class="btn">${t('links.more')}</summary>
      <div class="menu-body">
        <a href="/panel/links/new?kind=file">${t('links.kind_file')}</a>
        <a href="/panel/links/new?kind=vcard">${t('links.kind_vcard')}</a>
        <a href="/panel/links/new?kind=event">${t('links.kind_event')}</a>
      </div>
    </details>
  </div>
</div>
<form class="toolbar" method="get" action="/panel" role="search">
  ${input({ ctx, name: 'q', type: 'search', label: t('links.search'), value: opts.q })}
  ${select({ ctx, name: 'kind', label: t('links.kind'), value: opts.kind, options: [{ value: '', label: t('links.all_kinds') }, ...LINK_KINDS.map((k) => ({ value: k, label: kindLabel(ctx, k) }))] })}
  ${opts.projects.length ? select({ ctx, name: 'project', label: t('nav.projects'), value: opts.project ?? '', options: [{ value: '', label: t('links.all_projects') }, ...opts.projects.map((p) => ({ value: String(p.id), label: p.name }))] }) : ''}
  <button class="btn" type="submit">${t('links.filter')}</button>
  ${filtered ? html`<a class="btn-link" href="/panel">${t('links.clear')}</a>` : ''}
</form>
${opts.items.length === 0
  ? emptyState(
      filtered ? t('links.empty_filtered') : t('links.empty'),
      filtered ? '' : html`<p class="muted">${t('links.empty_body')}</p><a class="btn btn-primary" href="/panel/links/new?kind=bio">${t('links.new_bio')}</a>`,
    )
  : html`<ul class="list">${opts.items.map((l) => {
      const url = linkUrl(ctx.baseUrl, l)
      const p = l.project_id ? byId.get(l.project_id) : undefined
      return html`<li>
  <div class="grow">
    <div class="title">${p ? html`<span class="dot" style="background:${p.color}" title="${p.name}"></span>` : ''}${l.title || l.alias}
      <span class="tag">${kindLabel(ctx, l.kind)}</span>${l.is_enabled ? '' : html` <span class="tag tag-off">${t('links.disabled')}</span>`}</div>
    <div class="sub"><a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//, '')}</a>
      <button type="button" class="btn-link" data-copy="${url}" data-copied="${t('links.copied')}">${t('links.copy')}</button>
      ${l.kind === 'short' && l.target_url ? html` → ${l.target_url}` : ''}</div>
  </div>
  <a class="num-link" href="/panel/links/${l.id}/stats" aria-label="${t('links.clicks_aria', { n: l.clicks })}"><strong>${formatNumber(ctx.locale, l.clicks)}</strong> <span class="muted">${l.kind === 'bio' ? t('links.views') : t('links.clicks')}</span></a>
  <div class="btn-row">
    ${l.kind === 'bio' ? html`<a class="btn btn-sm" href="/panel/links/${l.id}/blocks">${t('links.edit_page')}</a>` : ''}
    <a class="btn btn-sm" href="/panel/links/${l.id}">${l.kind === 'bio' ? t('links.settings') : t('common.edit')}</a>
    <a class="btn btn-sm" href="/panel/qr/new?link=${l.id}">QR</a>
  </div>
</li>`
    })}</ul>
${pages > 1
  ? html`<nav class="pager" aria-label="${t('links.pages')}">
      ${opts.page > 1 ? html`<a class="btn btn-sm" href="${qs(opts.page - 1)}" rel="prev">← ${t('links.prev')}</a>` : ''}
      <span class="muted">${t('links.page_of', { page: opts.page, pages })}</span>
      ${opts.page < pages ? html`<a class="btn btn-sm" href="${qs(opts.page + 1)}" rel="next">${t('links.next')} →</a>` : ''}
    </nav>`
  : ''}`}`,
  })
}

/** Pestañas de un enlace (editor / ajustes / estadísticas) */
export function linkTabs(ctx: Ctx, link: Link, active: 'blocks' | 'design' | 'settings' | 'stats'): SafeHtml {
  const { t } = ctx
  const tab = (key: typeof active, href: string, label: string) =>
    html`<a href="${href}"${key === active ? html` aria-current="page"` : ''}>${label}</a>`
  return html`<div class="page-head">
  <div><h1>${link.title || link.alias}</h1>
  <p class="sub"><a href="${linkUrl(ctx.baseUrl, link)}" target="_blank" rel="noopener">${linkUrl(ctx.baseUrl, link).replace(/^https?:\/\//, '')}</a>
    <button type="button" class="btn-link" data-copy="${linkUrl(ctx.baseUrl, link)}" data-copied="${t('links.copied')}">${t('links.copy')}</button></p></div>
</div>
<nav class="tabs" aria-label="${t('links.sections')}">
  ${link.kind === 'bio' ? tab('blocks', `/panel/links/${link.id}/blocks`, t('bio.blocks')) : ''}
  ${link.kind === 'bio' ? tab('design', `/panel/links/${link.id}/design`, t('bio.design')) : ''}
  ${tab('settings', `/panel/links/${link.id}`, t('links.settings'))}
  ${tab('stats', `/panel/links/${link.id}/stats`, t('stats.title'))}
</nav>`
}

function kindFields(ctx: Ctx, kind: LinkKind, v: FormValues, e: Errors, isNew: boolean): SafeHtml {
  const { t } = ctx
  if (kind === 'short') {
    return html`${input({ ctx, name: 'target_url', type: 'url', label: t('links.target_url'), value: v.target_url, error: e.target_url, required: true, placeholder: 'https://', inputmode: 'url' })}
${select({ ctx, name: 'redirect_code', label: t('links.redirect_code'), value: v.redirect_code ?? '302', hint: t('links.redirect_hint'), options: [
  { value: '302', label: t('links.redirect_302') }, { value: '301', label: t('links.redirect_301') },
  { value: '307', label: t('links.redirect_307') }, { value: '308', label: t('links.redirect_308') }] })}`
  }
  if (kind === 'file') {
    return html`${v.file_name ? html`<p>${t('links.current_file')}: <strong>${v.file_name}</strong></p>` : ''}
${input({ ctx, name: 'file', type: 'file', label: isNew ? t('links.file') : t('links.replace_file'), error: e.file, required: isNew, hint: t('links.file_hint') })}`
  }
  if (kind === 'vcard') {
    const vc = (k: string, label: string, extra: Partial<Parameters<typeof input>[0]> = {}) =>
      input({ ctx, name: `vc_${k}`, label, value: v[`vc_${k}`], error: e[`vc_${k}`], ...extra })
    return html`<div class="grid-2">
  ${vc('first_name', t('vcard.first_name'), { autocomplete: 'off' })}
  ${vc('last_name', t('vcard.last_name'))}
  ${vc('org', t('vcard.org'))}
  ${vc('job_title', t('vcard.job_title'))}
  ${vc('phone', t('vcard.phone'), { type: 'tel' })}
  ${vc('phone_work', t('vcard.phone_work'), { type: 'tel' })}
  ${vc('email', t('vcard.email'), { type: 'email' })}
  ${vc('url', t('vcard.url'), { type: 'url' })}
  ${vc('street', t('vcard.street'))}
  ${vc('city', t('vcard.city'))}
  ${vc('region', t('vcard.region'))}
  ${vc('postal_code', t('vcard.postal_code'))}
  ${vc('country', t('vcard.country'))}
</div>
${textarea({ ctx, name: 'vc_note', label: t('vcard.note'), value: v.vc_note, error: e.vc_note, rows: 3, maxlength: 1000 })}`
  }
  if (kind === 'event') {
    return html`${input({ ctx, name: 'ev_name', label: t('event.name'), value: v.ev_name, error: e.ev_name, required: true, maxlength: 200 })}
<div class="grid-2">
  ${input({ ctx, name: 'ev_starts_at', type: 'datetime-local', label: t('event.starts_at'), value: v.ev_starts_at, error: e.ev_starts_at, required: true })}
  ${input({ ctx, name: 'ev_ends_at', type: 'datetime-local', label: t('event.ends_at'), value: v.ev_ends_at, error: e.ev_ends_at })}
</div>
${checkbox({ name: 'ev_all_day', label: t('event.all_day'), checked: !!v.ev_all_day })}
${input({ ctx, name: 'ev_location', label: t('event.location'), value: v.ev_location, error: e.ev_location, maxlength: 300 })}
${input({ ctx, name: 'ev_url', type: 'url', label: t('event.url'), value: v.ev_url, error: e.ev_url })}
${textarea({ ctx, name: 'ev_description', label: t('event.description'), value: v.ev_description, error: e.ev_description, rows: 4, maxlength: 2000 })}`
  }
  return html``
}

export function linkFormPage(
  ctx: Ctx,
  opts: { kind: LinkKind; link?: Link | undefined; values: FormValues; errors: Errors; projects: Project[] },
): SafeHtml {
  const { t } = ctx
  const { kind, link, values: v, errors: e } = opts
  const isNew = !link
  const action = isNew ? `/panel/links?kind=${kind}&_csrf=${encodeURIComponent(ctx.csrf)}` : `/panel/links/${link.id}?_csrf=${encodeURIComponent(ctx.csrf)}`
  const hasErrors = Object.keys(e).length > 0
  const openSchedule = !!(v.starts_at || v.ends_at || v.expired_url || e.starts_at || e.ends_at || e.expired_url)
  const openLimit = !!(v.click_limit || v.limit_url || e.click_limit || e.limit_url)
  const openAccess = !!(v.has_password || v.is_sensitive || e.password)
  const openUtm = UTM_KEYS.some((k) => v[k] || e[k]) || !!v.forward_query

  const body = html`
${isNew ? html`<h1>${t(`links.new_${kind}`)}</h1>` : ''}
${hasErrors ? html`<p class="flash flash-error" role="alert">${t('err.form')}</p>` : ''}
<form method="post" action="${action}" enctype="multipart/form-data" novalidate>
  <div class="card">
    ${kind !== 'bio' ? kindFields(ctx, kind, v, e, isNew) : ''}
    <div class="field${e.alias ? ' has-error' : ''}">
      <label for="f-alias">${t('links.alias')}</label>
      <div class="prefixed"><span class="prefix" aria-hidden="true">${ctx.baseUrl.replace(/^https?:\/\//, '')}/</span>
        <input id="f-alias" name="alias" value="${v.alias ?? ''}" maxlength="64" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="f-alias-hint${e.alias ? ' f-alias-err' : ''}"${e.alias ? html` aria-invalid="true"` : ''}></div>
      <p class="hint" id="f-alias-hint">${isNew ? t('links.alias_hint_new') : t('links.alias_hint')}</p>
      ${e.alias ? html`<p class="error" id="f-alias-err" role="alert">${t(e.alias)}</p>` : ''}
    </div>
    <div class="grid-2">
      ${input({ ctx, name: 'title', label: kind === 'bio' ? t('links.page_name') : t('links.title'), value: v.title, error: e.title, maxlength: 120, hint: t('links.title_hint') })}
      ${select({ ctx, name: 'project_id', label: t('nav.projects'), value: v.project_id, options: projectOptions(ctx, opts.projects) })}
    </div>
    ${checkbox({ name: 'is_enabled', label: t('links.enabled'), checked: !!v.is_enabled, hint: t('links.enabled_hint') })}
  </div>

  <h2>${t('links.options')}</h2>
  <details class="opt"${openSchedule ? html` open` : ''}><summary>${t('links.opt_schedule')}</summary><div class="opt-body">
    <p class="hint">${t('links.opt_schedule_hint', { tz: ctx.user?.timezone ?? '' })}</p>
    <div class="grid-2">
      ${input({ ctx, name: 'starts_at', type: 'datetime-local', label: t('links.starts_at'), value: v.starts_at, error: e.starts_at })}
      ${input({ ctx, name: 'ends_at', type: 'datetime-local', label: t('links.ends_at'), value: v.ends_at, error: e.ends_at })}
    </div>
    ${input({ ctx, name: 'expired_url', type: 'url', label: t('links.expired_url'), value: v.expired_url, error: e.expired_url, hint: t('links.expired_url_hint'), placeholder: 'https://' })}
  </div></details>

  <details class="opt"${openLimit ? html` open` : ''}><summary>${t('links.opt_limit')}</summary><div class="opt-body">
    <div class="grid-2">
      ${input({ ctx, name: 'click_limit', type: 'number', label: t('links.click_limit'), value: v.click_limit, error: e.click_limit, min: 1, inputmode: 'numeric' })}
      ${input({ ctx, name: 'limit_url', type: 'url', label: t('links.limit_url'), value: v.limit_url, error: e.limit_url, hint: t('links.limit_url_hint'), placeholder: 'https://' })}
    </div>
  </div></details>

  <details class="opt"${openAccess ? html` open` : ''}><summary>${t('links.opt_access')}</summary><div class="opt-body">
    ${input({ ctx, name: 'password', type: 'password', label: v.has_password ? t('links.password_change') : t('links.password'), error: e.password, autocomplete: 'new-password', hint: v.has_password ? t('links.password_set') : t('links.password_hint') })}
    ${v.has_password ? checkbox({ name: 'remove_password', label: t('links.password_remove') }) : ''}
    ${checkbox({ name: 'is_sensitive', label: t('links.sensitive'), checked: !!v.is_sensitive, hint: t('links.sensitive_hint') })}
  </div></details>

  <details class="opt"${openUtm ? html` open` : ''}><summary>${t('links.opt_utm')}</summary><div class="opt-body">
    <p class="hint">${kind === 'short' ? t('links.utm_hint') : t('links.utm_hint_other')}</p>
    <div class="grid-3">${UTM_KEYS.map((k) => input({ ctx, name: k, label: k, value: v[k], error: e[k], maxlength: 100 }))}</div>
    ${kind === 'short' ? checkbox({ name: 'forward_query', label: t('links.forward_query'), checked: !!v.forward_query, hint: t('links.forward_query_hint') }) : ''}
  </div></details>

  <div class="btn-row sticky-actions">
    <button class="btn btn-primary" type="submit">${isNew ? t('links.create') : t('common.save')}</button>
    <a class="btn" href="/panel">${t('common.cancel')}</a>
  </div>
</form>
${link
  ? html`<div class="card danger-zone"><h2>${t('links.delete')}</h2><p class="muted">${t('links.delete_body')}</p>
      ${postButton(ctx, `/panel/links/${link.id}/delete`, t('links.delete'), { cls: 'btn btn-danger', confirm: t('links.delete_confirm') })}</div>`
  : ''}`

  return panelLayout(ctx, {
    title: isNew ? t(`links.new_${kind}`) : link.title || link.alias,
    active: 'links',
    path: isNew ? `/panel/links/new?kind=${kind}` : `/panel/links/${link.id}`,
    body: link ? html`${linkTabs(ctx, link, 'settings')}${body}` : body,
  })
}
