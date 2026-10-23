import { html, type SafeHtml } from '../../lib/html.ts'
import { formatNumber, type Locale } from '../../lib/i18n.ts'
import type { Ctx } from '../../web/context.ts'
import { BLOCK_BY_TYPE, type BlockRow } from '../bio/blocks.ts'
import type { Link } from '../links/repo.ts'
import { FILTER_KEYS, type Dimension, type Filters, type Report, type Row } from './query.ts'

function regionName(locale: Locale, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}
function languageName(locale: Locale, code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

function shortDay(locale: Locale, day: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(day))
}

/** Barras de visitas + línea de visitantes, SVG propio sin JS */
export function chartSvg(ctx: Ctx, r: Report): SafeHtml {
  const { t, locale } = ctx
  const W = 720
  const H = 200
  const n = r.series.length
  const max = Math.max(1, ...r.series.map((s) => s.views + s.clicks))
  const step = W / n
  const bw = Math.max(1, step * 0.72)
  const y = (v: number) => H - (v / max) * (H - 8)
  const line = r.series.map((s, i) => `${(i * step + step / 2).toFixed(1)},${y(s.visitors).toFixed(1)}`).join(' ')
  const mid = r.series[Math.floor(n / 2)]
  // sin texto dentro del SVG: escalado al ancho del teléfono quedaría diminuto; las etiquetas van en HTML
  return html`<figure class="chart">
<div class="chart-plot"><span class="chart-max">${formatNumber(locale, max)}</span>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('stats.chart_label', { from: r.range.from, to: r.range.to })}" preserveAspectRatio="none">
  <line x1="0" x2="${W}" y1="${y(max / 2)}" y2="${y(max / 2)}" class="grid"/>
  ${r.series.map((s, i) => {
    const x = i * step + (step - bw) / 2
    return html`<g><title>${shortDay(locale, s.day)}: ${formatNumber(locale, s.views)} ${t('stats.views')}, ${formatNumber(locale, s.clicks)} ${t('stats.clicks')}, ${formatNumber(locale, s.visitors)} ${t('stats.visitors')}</title>
      <rect x="${x.toFixed(1)}" y="${y(s.views + s.clicks).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - y(s.clicks)).toFixed(1)}" class="bar-clicks" rx="2"/>
      <rect x="${x.toFixed(1)}" y="${y(s.views + s.clicks).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(s.clicks) - y(s.views + s.clicks)).toFixed(1)}" class="bar-views" rx="2"/></g>`
  })}
  <polyline points="${line}" class="line-visitors" vector-effect="non-scaling-stroke"/>
</svg></div>
<div class="chart-x"><span>${n ? shortDay(locale, r.series[0]!.day) : ''}</span><span>${mid ? shortDay(locale, mid.day) : ''}</span><span>${n ? shortDay(locale, r.series[n - 1]!.day) : ''}</span></div>
<figcaption class="legend"><span class="k k-views"></span>${t('stats.views')} <span class="k k-clicks"></span>${t('stats.clicks')} <span class="k k-visitors"></span>${t('stats.visitors')}</figcaption>
</figure>`
}

function label(ctx: Ctx, dim: Dimension, key: string | null): string {
  const { t, locale } = ctx
  if (key === null || key === '') return dim === 'referrer' ? t('stats.direct') : t('stats.unknown')
  if (dim === 'country') return regionName(locale, key)
  if (dim === 'lang') return languageName(locale, key)
  if (dim === 'device') return t(`stats.device_${key}`)
  return key
}

/** Lista de un desglose; con `drill` cada fila filtra (cascada: país → ciudad, fuente → medio → campaña) */
function list(ctx: Ctx, dim: Dimension, rows: Row[], total: number, drill?: (key: string | null) => string): SafeHtml {
  const { t, locale } = ctx
  return html`<section class="card stat-list"><h2 class="h3">${t(`stats.dim_${dim}`)}</h2>
${rows.length === 0
  ? html`<p class="muted">${t('stats.no_data')}</p>`
  : html`<ul>${rows.map((r) => {
      const n = r.views + r.clicks
      const pct = total ? Math.round((n / total) * 100) : 0
      const inner = html`<span class="sl-1"><span class="sl-l">${label(ctx, dim, r.key)}</span><span class="sl-n">${formatNumber(locale, n)} <span class="muted">· ${pct}%</span></span></span><span class="sl-bar"><span style="width:${Math.max(pct, 1)}%"></span></span>`
      return html`<li>${drill ? html`<a class="sl-row" href="${drill(r.key)}">${inner}</a>` : html`<span class="sl-row">${inner}</span>`}</li>`
    })}</ul>`}
</section>`
}

/** Fecha local AAAA-MM-DD en la zona de la cuenta (o CDMX en páginas públicas) */
function today(ctx: Ctx): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ctx.user?.timezone || 'America/Mexico_City' }).format(ctx.now)
}
const minusDays = (ymd: string, n: number) => new Date(Date.parse(ymd) - n * 86400_000).toISOString().slice(0, 10)

export function reportBody(ctx: Ctx, r: Report, opts: { exportBase?: string; blocks?: BlockRow[]; links?: Map<number, Link>; geoAttribution: boolean; action: string; filters?: Filters; prev?: { views: number; clicks: number } }): SafeHtml {
  const { t, locale } = ctx
  const f = opts.filters ?? {}
  const total = r.totals.views + r.totals.clicks
  const blockById = new Map((opts.blocks ?? []).map((b) => [b.id, b]))
  const hourMax = Math.max(1, ...r.hours)
  const url = (over: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const base: Record<string, string | null> = { from: r.range.from, to: r.range.to, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [`f_${k}`, v ?? null])), ...over }
    for (const [k, v] of Object.entries(base)) if (v !== null && v !== undefined) p.set(k, v)
    return `${opts.action}?${p}`
  }
  const now = today(ctx)
  const n = r.range.days.length
  const presets = [7, 30, 90].map((d) => ({ d, from: minusDays(now, d - 1), on: r.range.to === now && n === d }))
  const pct = opts.prev && opts.prev.views ? Math.round(((r.totals.views - opts.prev.views) / opts.prev.views) * 100) : null
  const ctr = r.totals.views ? Math.round((r.totals.clicks / r.totals.views) * 1000) / 10 : 0
  const drill = (key: (typeof FILTER_KEYS)[number]) => (k: string | null) => url({ [`f_${key}`]: k ?? '' })
  const shown = (d: Dimension) => (d === 'country' && f.country !== undefined ? false : d === 'utm_source' && f.utm_source !== undefined ? false : d === 'utm_medium' && f.utm_medium !== undefined ? false : d === 'referrer' && f.referrer !== undefined ? false : true)
  const dims: Dimension[] = (['country', 'city', 'referrer', 'device', 'os', 'browser', 'lang', 'utm_source', 'utm_medium', 'utm_campaign', 'variant'] as Dimension[]).filter((d) => shown(d) && (d !== 'variant' || r.breakdowns.variant.some((x) => x.key)))
  const drillOf = (d: Dimension) => (d === 'country' ? drill('country') : d === 'utm_source' ? drill('utm_source') : d === 'utm_medium' ? drill('utm_medium') : d === 'referrer' ? drill('referrer') : undefined)
  const filterLabel = (k: string, v: string) => `${t(`stats.dim_${k}`)}: ${label(ctx, k as Dimension, v || null)}`
  return html`<nav class="chips range-chips" aria-label="${t('stats.range')}">
  ${presets.map((p) => html`<a class="chip" href="${url({ from: p.from, to: now })}"${p.on ? html` aria-current="true"` : ''}>${t('stats.last_days', { n: p.d })}</a>`)}
  <details class="range-custom"><summary class="chip">${presets.some((p) => p.on) ? t('stats.custom') : `${r.range.from} → ${r.range.to}`}</summary>
    <form class="toolbar" method="get" action="${opts.action}">
      ${Object.entries(f).map(([k, v]) => html`<input type="hidden" name="f_${k}" value="${v}">`)}
      <div class="field"><label for="st-from">${t('stats.from')}</label><input id="st-from" type="date" name="from" value="${r.range.from}"></div>
      <div class="field"><label for="st-to">${t('stats.to')}</label><input id="st-to" type="date" name="to" value="${r.range.to}"></div>
      <button class="btn" type="submit">${t('stats.apply')}</button>
    </form></details>
</nav>
${Object.keys(f).length ? html`<p class="chips active-filters">${Object.entries(f).map(([k, v]) => html`<a class="chip chip-on" href="${url({ [`f_${k}`]: null })}" aria-label="${t('stats.remove_filter')}: ${filterLabel(k, v ?? '')}">${filterLabel(k, v ?? '')} ✕</a>`)}</p>` : ''}
<section class="kpi-hero">
  <p class="st-l">${t('stats.views')} · ${t('stats.range_label', { from: r.range.from, to: r.range.to })}</p>
  <p class="st-n">${formatNumber(locale, r.totals.views)}</p>
  ${pct !== null ? html`<p class="st-d ${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '▲' : '▼'} ${t('stats.vs_prev', { pct: Math.abs(pct), n })}</p>` : ''}
  <dl class="st-k"><div><dt>${t('stats.clicks')}</dt><dd>${formatNumber(locale, r.totals.clicks)}</dd></div><div><dt>${t('stats.visitors')}</dt><dd>${formatNumber(locale, r.totals.visitors)}</dd></div><div><dt>${t('stats.ctr')}</dt><dd>${formatNumber(locale, ctr)} %</dd></div></dl>
</section>
<section class="card chart-card"><h2 class="h3">${t('stats.per_day')}</h2>${chartSvg(ctx, r)}</section>
${opts.links && r.links.length
  ? html`<section class="card stat-list"><h2 class="h3">${t('stats.top_links')}</h2><ul>${r.links.map((l) => {
      const link = opts.links?.get(l.link_id)
      const v = l.views + l.clicks
      const p = total ? Math.round((v / total) * 100) : 0
      return html`<li><a class="sl-row" href="${link ? `/panel/links/${link.id}/stats` : '#'}"><span class="sl-1"><span class="sl-l">${link ? link.title || link.alias : `#${l.link_id}`}</span><span class="sl-n">${formatNumber(locale, v)}</span></span><span class="sl-bar"><span style="width:${Math.max(p, 1)}%"></span></span></a></li>`
    })}</ul></section>`
  : ''}
${opts.blocks
  ? html`<section class="card stat-list"><h2 class="h3">${t('stats.block_clicks')}</h2>${r.blocks.length === 0
      ? html`<p class="muted">${t('stats.no_data')}</p>`
      : html`<ul>${r.blocks.map((b) => {
          const block = blockById.get(b.block_id)
          const def = block ? BLOCK_BY_TYPE.get(block.type) : undefined
          const max = r.blocks[0]?.clicks || 1
          return html`<li><span class="sl-row"><span class="sl-1"><span class="sl-l">${block ? html`${def?.summary(block) || t(`bio.type_${block.type}`)} <span class="muted">· ${t(`bio.type_${block.type}`)}</span>` : t('stats.deleted_block')}</span><span class="sl-n">${formatNumber(locale, b.clicks)}</span></span><span class="sl-bar"><span style="width:${Math.max(Math.round((b.clicks / max) * 100), 1)}%"></span></span></span></li>`
        })}</ul>`}</section>`
  : ''}
<div class="stat-grid">
  ${dims.map((d) => list(ctx, d, r.breakdowns[d], total, drillOf(d)))}
  <section class="card stat-list"><h2 class="h3">${t('stats.hours')}</h2>
    <div class="hours" role="img" aria-label="${t('stats.hours')}">${r.hours.map((n, h) => html`<span class="hour" title="${h}:00 · ${formatNumber(locale, n)}"><span class="hour-bar" style="height:${Math.round((n / hourMax) * 100)}%"></span><span class="hour-l">${h % 6 === 0 ? h : ''}</span></span>`)}</div>
  </section>
</div>
${opts.exportBase ? html`<p class="btn-row"><a class="btn btn-sm" href="${opts.exportBase}?format=csv&from=${r.range.from}&to=${r.range.to}" download>${t('stats.export')} CSV</a> <a class="btn btn-sm" href="${opts.exportBase}?format=json&from=${r.range.from}&to=${r.range.to}" download>JSON</a></p>` : ''}
<p class="muted">${t('stats.privacy_note')}${opts.geoAttribution ? html` ${t('stats.geo_attribution')} <a href="https://db-ip.com">DB-IP</a>.` : ''}</p>`
}
