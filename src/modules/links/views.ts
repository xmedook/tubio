import { html, type SafeHtml } from '../../lib/html.ts'
import { formatNumber, plural } from '../../lib/i18n.ts'
import { UTM_KEYS } from '../../lib/urls.ts'
import { icon } from '../../views/icons.ts'
import { panelLayout } from '../../views/layout.ts'
import { checkbox, emptyState, input, postButton, select, textarea, type Errors, type Option } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import type { Project } from '../projects/repo.ts'
import { type FormValues } from './form.ts'
import { LINK_KINDS, linkUrl, type Link, type LinkKind } from './repo.ts'

/** «hoy», «ayer», día de la semana (esta semana) o «12 oct» — en la zona de la cuenta */
function relDay(ctx: Ctx, ts: number): string {
  const tz = ctx.user?.timezone || 'America/Mexico_City'
  const day = (x: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(x)
  const diff = Math.round((Date.parse(day(ctx.now)) - Date.parse(day(ts))) / 86400_000)
  if (diff <= 0) return ctx.t('time.today')
  if (diff === 1) return ctx.t('time.yesterday')
  if (diff < 7) return new Intl.DateTimeFormat(ctx.locale, { weekday: 'short', timeZone: tz }).format(ts).replace('.', '')
  return new Intl.DateTimeFormat(ctx.locale, { day: 'numeric', month: 'short', timeZone: tz }).format(ts).replace('.', '')
}

export function kindLabel(ctx: Ctx, kind: LinkKind): string {
  return ctx.t(`links.kind_${kind}`)
}

function projectOptions(ctx: Ctx, projects: Project[]): Option[] {
  return [{ value: '', label: ctx.t('links.no_project') }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]
}

export function dashboardPage(
  ctx: Ctx,
  opts: { items: Link[]; total: number; projects: Project[]; kind?: string | undefined; project?: number | undefined; q?: string | undefined; page: number; perPage: number; last?: Map<number, number> },
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
    <a class="btn" href="/panel/stats">${t('stats.title')}</a>
    <details class="menu"><summary class="btn">${t('links.more')}</summary>
      <div class="menu-body">
        <a href="/panel/links/new?kind=file">${t('links.kind_file')}</a>
        <a href="/panel/links/new?kind=vcard">${t('links.kind_vcard')}</a>
        <a href="/panel/links/new?kind=event">${t('links.kind_event')}</a>
        <a href="/panel/links/bulk">${t('bulk.short')}</a>
        <a href="/panel/pixels">${t('mk.title')}</a>
        <a href="/panel/domains">${t('domains.title')}</a>
      </div>
    </details>
  </div>
</div>
<form class="toolbar search-bar" method="get" action="/panel" role="search"${filtered ? '' : html` data-collapsed`}>
  ${input({ ctx, name: 'q', type: 'search', label: t('links.search'), value: opts.q, placeholder: t('links.search_ph') })}
  ${opts.kind ? html`<input type="hidden" name="kind" value="${opts.kind}">` : ''}
  ${opts.projects.length ? select({ ctx, name: 'project', label: t('nav.projects'), value: opts.project ?? '', options: [{ value: '', label: t('links.all_projects') }, ...opts.projects.map((p) => ({ value: String(p.id), label: p.name }))] }) : ''}
  <button class="btn" type="submit">${t('links.filter')}</button>
  ${filtered ? html`<a class="btn-link" href="/panel">${t('links.clear')}</a>` : ''}
</form>
<nav class="chips" aria-label="${t('links.kind')}">
  ${[['', t('links.chip_all')] as const, ...LINK_KINDS.map((k) => [k, k === 'bio' ? t('links.chip_bio') : k === 'short' ? t('links.chip_short') : kindLabel(ctx, k)] as const)].map(([k, label]) => {
    const p = new URLSearchParams()
    if (k) p.set('kind', k)
    if (opts.q) p.set('q', opts.q)
    if (opts.project) p.set('project', String(opts.project))
    const href = p.toString() ? `/panel?${p}` : '/panel'
    return html`<a class="chip" href="${href}"${(opts.kind ?? '') === k ? html` aria-current="true"` : ''}>${label}</a>`
  })}
</nav>
${opts.items.length === 0
  ? emptyState(
      filtered ? t('links.empty_filtered') : t('links.empty'),
      filtered ? '' : html`<p class="muted">${t('links.empty_body')}</p><a class="btn btn-primary" href="/panel/links/new?kind=bio">${t('links.new_bio')}</a>`,
    )
  : html`<ul class="list link-list chat-list">${opts.items.map((l) => {
      const url = linkUrl(ctx.baseUrl, l)
      const p = l.project_id ? byId.get(l.project_id) : undefined
      const main = l.kind === 'bio' ? `/panel/links/${l.id}/blocks` : `/panel/links/${l.id}`
      const ic = l.kind === 'vcard' ? 'card' : l.kind
      const name = l.title || l.alias
      const initials = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·'
      const when = opts.last?.get(l.id) ?? l.created_at
      return html`<li class="link-item chat-row${l.is_enabled ? '' : ' is-off'}">
  <a class="row-a" href="${main}">
    <span class="av" aria-hidden="true">${l.kind === 'bio' ? initials : icon(ic)}</span>
    <span class="row-b">
      <span class="row-1"><b class="title">${p ? html`<span class="dot" style="background:${p.color}" title="${p.name}"></span>` : ''}${name}</b><time datetime="${new Date(when).toISOString()}">${relDay(ctx, when)}</time></span>
      <span class="row-2"><span class="u">${l.is_enabled ? '' : html`<span class="tag tag-off">${t('links.disabled')}</span> `}${url.replace(/^https?:\/\//, '')}${l.kind === 'short' && l.target_url ? html` → ${l.target_url.replace(/^https?:\/\/(www\.)?/, '')}` : ''}</span>${l.clicks ? html`<span class="cnt" title="${plural(t, ctx.locale, l.kind === 'bio' ? 'links.n_views' : 'links.n_clicks', l.clicks)}">${formatNumber(ctx.locale, l.clicks)}<span class="sr-only"> ${plural(t, ctx.locale, l.kind === 'bio' ? 'links.n_views' : 'links.n_clicks', l.clicks).replace(/^[\d.,\s]+/, '')}</span></span>` : ''}</span>
    </span>
  </a>
  <details class="row-menu">
    <summary class="icon-btn" aria-label="${t('nav.more')}: ${name}">${icon('more')}</summary>
    <div class="menu-body">
      ${l.kind === 'bio' ? html`<a href="/panel/links/${l.id}/blocks">${t('links.edit_page')}</a>` : ''}
      <a href="/panel/links/${l.id}">${l.kind === 'bio' ? t('links.settings') : t('common.edit')}</a>
      <button type="button" data-copy="${url}" data-copied="${t('links.copied')}">${t('links.copy')}</button>
      <a href="/panel/links/${l.id}/stats">${t('stats.title')}</a>
      <a href="/panel/qr/new?link=${l.id}">QR</a>
      <a href="${url}" target="_blank" rel="noopener">${t('links.open')}</a>
      ${l.kind !== 'file' ? postButton(ctx, `/panel/links/${l.id}/duplicate`, t('links.duplicate'), { cls: '' }) : ''}
    </div>
  </details>
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
${input({ ctx, name: 'file', type: 'file', label: isNew ? t('links.file') : t('links.replace_file'), error: e.file, required: isNew, hint: t('links.file_hint') })}
${checkbox({ name: 'as_site', label: t('site.as_site'), checked: v.as_site === '1', hint: t('site.as_site_hint') })}${e.as_site ? html`<p class="error" role="alert">${t(e.as_site)}</p>` : ''}`
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

function marketingSection(ctx: Ctx, kind: LinkKind, v: FormValues, e: Errors, mk?: { enabled: boolean; pixels: { id: number; name: string; kind: string }[]; splashes: { id: number; name: string }[] }): SafeHtml {
  const { t } = ctx
  if (!mk) return html``
  if (!mk.enabled) return html`<details class="opt"><summary>${t('mk.title')} <span class="tag">Pro</span></summary><div class="opt-body"><p>${t('mk.locked')} <a href="/panel/plan">${t('plan.see_plans')}</a></p></div></details>`
  const chosen = new Set((v.pixel_ids ?? '').split(',').filter(Boolean))
  const hasRules = Object.keys(v).some((k) => k.startsWith('tg__') || k.startsWith('ab__')) || v.splash_id || v.cloak || chosen.size
  const types = ['country', 'device', 'lang', 'os'].map((x) => ({ value: x, label: t(`mk.rule_${x}`) }))
  return html`<details class="opt"${hasRules ? html` open` : ''}><summary>${t('mk.title')}</summary><div class="opt-body">
  <fieldset><legend>${t('mk.pixels')}</legend>
    ${mk.pixels.length ? mk.pixels.map((p) => checkbox({ name: 'px', value: String(p.id), label: `${p.name} (${t(`mk.px_${p.kind}`)})`, checked: chosen.has(String(p.id)) })) : html`<p class="hint">${t('mk.no_pixels')} <a href="/panel/pixels">${t('mk.manage_pixels')}</a></p>`}
  </fieldset>
  ${kind === 'short' ? html`
  ${select({ ctx, name: 'splash_id', label: t('mk.splash'), value: v.splash_id ?? '', options: [{ value: '', label: t('mk.no_splash') }, ...mk.splashes.map((s) => ({ value: String(s.id), label: s.name }))], hint: t('mk.splash_hint') })}
  ${checkbox({ name: 'cloak', label: t('mk.cloak'), checked: !!v.cloak, hint: t('mk.cloak_hint') })}
  <fieldset class="rows"><legend>${t('mk.rules')}</legend><p class="hint">${t('mk.rules_hint')}</p>
    <ol class="rows-list">${[0, 1, 2, 3, 4].map((i) => html`<li class="row-item"><div class="grid-3">
      ${select({ ctx, name: `tg__${i}__type`, label: t('mk.rule_type'), value: v[`tg__${i}__type`] ?? 'country', options: types })}
      ${input({ ctx, name: `tg__${i}__value`, label: t('mk.rule_value'), value: v[`tg__${i}__value`], error: e[`tg__${i}__value`], placeholder: 'MX · mobile · es · ios', maxlength: 60 })}
      ${input({ ctx, name: `tg__${i}__url`, label: t('mk.rule_url'), value: v[`tg__${i}__url`], error: e[`tg__${i}__url`], placeholder: 'https://' })}
    </div></li>`)}</ol></fieldset>
  <fieldset class="rows"><legend>${t('mk.ab')}</legend><p class="hint">${t('mk.ab_hint')}</p>
    <ol class="rows-list">${[0, 1, 2, 3].map((i) => html`<li class="row-item"><div class="grid-2">
      ${input({ ctx, name: `ab__${i}__url`, label: t('mk.rule_url'), value: v[`ab__${i}__url`], error: e[`ab__${i}__url`], placeholder: 'https://' })}
      ${input({ ctx, name: `ab__${i}__weight`, type: 'number', label: t('mk.weight'), value: v[`ab__${i}__weight`], error: e[`ab__${i}__weight`], min: 1, max: 100 })}
    </div></li>`)}</ol></fieldset>` : ''}
</div></details>`
}

export function linkFormPage(
  ctx: Ctx,
  opts: {
    kind: LinkKind
    link?: Link | undefined
    values: FormValues
    errors: Errors
    projects: Project[]
    marketing?: { enabled: boolean; pixels: { id: number; name: string; kind: string }[]; splashes: { id: number; name: string }[] }
    domains?: { id: number; host: string }[]
  },
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
${hasErrors ? html`<p class="flash flash-error" role="alert">${t(e._form ?? 'err.form')}</p>` : ''}
<form method="post" action="${action}" enctype="multipart/form-data" novalidate>
  <div class="card">
    ${kind !== 'bio' ? kindFields(ctx, kind, v, e, isNew) : ''}
    <div class="field${e.alias ? ' has-error' : ''}">
      <label for="f-alias">${t('links.alias')}</label>
      ${opts.domains?.length ? html`<label class="sr-only" for="f-domain">${t('domains.domain')}</label><select id="f-domain" name="domain_id" class="domain-pick">
        <option value="0"${v.domain_id && v.domain_id !== '0' ? '' : html` selected`}>${ctx.baseUrl.replace(/^https?:\/\//, '')}</option>
        ${opts.domains.map((d) => html`<option value="${d.id}"${String(d.id) === v.domain_id ? html` selected` : ''}>${d.host}</option>`)}</select>` : ''}
      <div class="prefixed"><span class="prefix" aria-hidden="true">${opts.domains?.length ? '/' : `${ctx.baseUrl.replace(/^https?:\/\//, '')}/`}</span>
        <input id="f-alias" name="alias" value="${v.alias ?? ''}" maxlength="64" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="f-alias-hint${e.alias ? ' f-alias-err' : ''}"${e.alias ? html` aria-invalid="true"` : ''}></div>
      <p class="hint" id="f-alias-hint">${isNew ? t('links.alias_hint_new') : t('links.alias_hint')}</p>
      ${e.alias ? html`<p class="error" id="f-alias-err" role="alert">${t(e.alias)}</p>` : ''}
    </div>
    <div class="grid-2">
      ${input({ ctx, name: 'title', label: kind === 'bio' ? t('links.page_name') : t('links.title'), value: v.title, error: e.title, maxlength: 120, hint: t('links.title_hint') })}
      ${select({ ctx, name: 'project_id', label: t('nav.projects'), value: v.project_id, options: projectOptions(ctx, opts.projects) })}
    </div>
    ${checkbox({ name: 'is_enabled', label: t('links.enabled'), checked: !!v.is_enabled, hint: t('links.enabled_hint') })}
    ${checkbox({ name: 'public_stats', label: t('links.public_stats'), checked: !!v.public_stats, hint: t('links.public_stats_hint') })}
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

  ${marketingSection(ctx, kind, v, e, opts.marketing)}

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
