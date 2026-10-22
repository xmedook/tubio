import { html, type SafeHtml } from '../../lib/html.ts'
import { formatNumber, type Locale } from '../../lib/i18n.ts'
import type { Ctx } from '../../web/context.ts'
import { BLOCK_BY_TYPE, type BlockRow } from '../bio/blocks.ts'
import type { Link } from '../links/repo.ts'
import type { Dimension, Report, Row } from './query.ts'

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
  const H = 220
  const padL = 36
  const padB = 24
  const n = r.series.length
  const max = Math.max(1, ...r.series.map((s) => s.views + s.clicks))
  const step = (W - padL) / n
  const bw = Math.max(1, step * 0.7)
  const y = (v: number) => H - padB - (v / max) * (H - padB - 10)
  const ticks = [0, Math.round(max / 2), max]
  const every = Math.ceil(n / 8)
  const line = r.series.map((s, i) => `${(padL + i * step + step / 2).toFixed(1)},${y(s.visitors).toFixed(1)}`).join(' ')
  return html`<figure class="chart">
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('stats.chart_label', { from: r.range.from, to: r.range.to })}" preserveAspectRatio="none">
  ${ticks.map((v) => html`<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${formatNumber(locale, v)}</text>`)}
  ${r.series.map((s, i) => {
    const x = padL + i * step + (step - bw) / 2
    return html`<g><title>${shortDay(locale, s.day)}: ${formatNumber(locale, s.views)} ${t('stats.views')}, ${formatNumber(locale, s.clicks)} ${t('stats.clicks')}, ${formatNumber(locale, s.visitors)} ${t('stats.visitors')}</title>
      <rect x="${x.toFixed(1)}" y="${y(s.views + s.clicks).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - padB - y(s.clicks)).toFixed(1)}" class="bar-clicks"/>
      <rect x="${x.toFixed(1)}" y="${y(s.views + s.clicks).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(s.clicks) - y(s.views + s.clicks)).toFixed(1)}" class="bar-views"/></g>`
  })}
  <polyline points="${line}" class="line-visitors"/>
  ${r.series.map((s, i) => (i % every === 0 ? html`<text x="${(padL + i * step + step / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="axis">${shortDay(locale, s.day)}</text>` : ''))}
</svg>
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

function table(ctx: Ctx, dim: Dimension, rows: Row[], total: number): SafeHtml {
  const { t, locale } = ctx
  return html`<section class="card stat-table"><h3>${t(`stats.dim_${dim}`)}</h3>
${rows.length === 0
  ? html`<p class="muted">${t('stats.no_data')}</p>`
  : html`<table class="data"><thead><tr><th scope="col">${t(`stats.dim_${dim}`)}</th><th scope="col" class="num">${t('stats.total')}</th><th scope="col" class="num">%</th></tr></thead><tbody>
  ${rows.map((r) => {
    const n = r.views + r.clicks
    const pct = total ? Math.round((n / total) * 100) : 0
    return html`<tr><td><span class="bar-bg"><span class="bar-fill" style="width:${pct}%"></span></span><span class="lbl">${label(ctx, dim, r.key)}</span></td><td class="num">${formatNumber(locale, n)}</td><td class="num">${pct}%</td></tr>`
  })}</tbody></table>`}
</section>`
}

export function reportBody(ctx: Ctx, r: Report, opts: { exportBase?: string; blocks?: BlockRow[]; links?: Map<number, Link>; geoAttribution: boolean; action: string }): SafeHtml {
  const { t, locale } = ctx
  const total = r.totals.views + r.totals.clicks
  const blockById = new Map((opts.blocks ?? []).map((b) => [b.id, b]))
  const hourMax = Math.max(1, ...r.hours)
  return html`<form class="toolbar" method="get" action="${opts.action}">
  <div class="field"><label for="st-from">${t('stats.from')}</label><input id="st-from" type="date" name="from" value="${r.range.from}"></div>
  <div class="field"><label for="st-to">${t('stats.to')}</label><input id="st-to" type="date" name="to" value="${r.range.to}"></div>
  <button class="btn" type="submit">${t('stats.apply')}</button>
  ${opts.exportBase
    ? html`<span class="grow-sp"></span><a class="btn btn-sm" href="${opts.exportBase}?format=csv&from=${r.range.from}&to=${r.range.to}" download>CSV</a>
      <a class="btn btn-sm" href="${opts.exportBase}?format=json&from=${r.range.from}&to=${r.range.to}" download>JSON</a>`
    : ''}
</form>
<div class="kpis">
  <div class="kpi"><span class="kpi-n">${formatNumber(locale, r.totals.views)}</span><span class="kpi-l">${t('stats.views')}</span></div>
  <div class="kpi"><span class="kpi-n">${formatNumber(locale, r.totals.visitors)}</span><span class="kpi-l">${t('stats.visitors')}</span></div>
  <div class="kpi"><span class="kpi-n">${formatNumber(locale, r.totals.clicks)}</span><span class="kpi-l">${t('stats.clicks')}</span></div>
</div>
<div class="card">${chartSvg(ctx, r)}</div>
${opts.links && r.links.length
  ? html`<section class="card"><h3>${t('stats.top_links')}</h3><table class="data"><thead><tr><th scope="col">${t('nav.links')}</th><th class="num" scope="col">${t('stats.views')}</th><th class="num" scope="col">${t('stats.clicks')}</th></tr></thead><tbody>
    ${r.links.map((l) => {
      const link = opts.links?.get(l.link_id)
      return html`<tr><td>${link ? html`<a href="/panel/links/${link.id}/stats">${link.title || link.alias}</a>` : `#${l.link_id}`}</td><td class="num">${formatNumber(locale, l.views)}</td><td class="num">${formatNumber(locale, l.clicks)}</td></tr>`
    })}</tbody></table></section>`
  : ''}
${opts.blocks
  ? html`<section class="card"><h3>${t('stats.block_clicks')}</h3>${r.blocks.length === 0
      ? html`<p class="muted">${t('stats.no_data')}</p>`
      : html`<table class="data"><thead><tr><th scope="col">${t('bio.blocks')}</th><th class="num" scope="col">${t('stats.clicks')}</th></tr></thead><tbody>
        ${r.blocks.map((b) => {
          const block = blockById.get(b.block_id)
          const def = block ? BLOCK_BY_TYPE.get(block.type) : undefined
          return html`<tr><td>${block ? html`${t(`bio.type_${block.type}`)} · <span class="muted">${def?.summary(block) ?? ''}</span>` : t('stats.deleted_block')}</td><td class="num">${formatNumber(locale, b.clicks)}</td></tr>`
        })}</tbody></table>`}</section>`
  : ''}
<div class="stat-grid">
  ${(['country', 'city', 'device', 'os', 'browser', 'lang', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign'] as const).map((d) => table(ctx, d, r.breakdowns[d], total))}
  <section class="card stat-table"><h3>${t('stats.hours')}</h3>
    <div class="hours" role="img" aria-label="${t('stats.hours')}">${r.hours.map((n, h) => html`<span class="hour" title="${h}:00 · ${formatNumber(locale, n)}"><span class="hour-bar" style="height:${Math.round((n / hourMax) * 100)}%"></span><span class="hour-l">${h % 3 === 0 ? h : ''}</span></span>`)}</div>
  </section>
</div>
<p class="muted small">${t('stats.privacy_note')}${opts.geoAttribution ? html` ${t('stats.geo_attribution')} <a href="https://db-ip.com">DB-IP</a>.` : ''}</p>`
}
