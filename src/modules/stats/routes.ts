import type { FastifyInstance, FastifyReply } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { formatDateTime } from '../../lib/i18n.ts'
import { authLayout, panelLayout } from '../../views/layout.ts'
import { sendHtml, userGuard } from '../../web/context.ts'
import { listBlocks } from '../bio/repo.ts'
import { findByAlias, listLinks, type Link } from '../links/repo.ts'
import { ownLinkOr404 } from '../links/routes.ts'
import { linkTabs } from '../links/views.ts'
import { availability } from '../public/gate.ts'
import type { User } from '../users/repo.ts'
import { limitsOf } from '../plans/limits.ts'
import { buildReport, csvCell, iterateEvents, parseRange, type Range, type Scope } from './query.ts'
import { reportBody } from './views.ts'

const CSV_COLS = ['ts', 'kind', 'link_id', 'block_id', 'country', 'city', 'device', 'os', 'browser', 'lang', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign'] as const

function exportReply(deps: AppDeps, reply: FastifyReply, scope: Scope, range: Range, format: string, name: string) {
  const file = `tubio-${name}-${range.from}_${range.to}`
  if (format === 'json') {
    reply.header('Content-Disposition', `attachment; filename="${file}.json"`)
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(buildReport(deps.db, scope, range, 100), null, 2))
  }
  let out = '﻿' + CSV_COLS.join(',') + '\n'
  for (const e of iterateEvents(deps.db, scope, range)) {
    out += CSV_COLS.map((c) => csvCell(c === 'ts' ? new Date(e.ts).toISOString() : e[c])).join(',') + '\n'
  }
  reply.header('Content-Disposition', `attachment; filename="${file}.csv"`)
  return reply.type('text/csv; charset=utf-8').send(out)
}

/** El plan limita cuántos días atrás se ven las estadísticas */
function clampToPlan(deps: AppDeps, user: User, r: Range): Range {
  const days = limitsOf(deps.db, user, deps.now()).stats_days
  if (days < 0 || r.days.length <= days) return r
  const from = r.days[r.days.length - days] as string
  return parseRange(from, r.to, user.timezone, deps.now())
}

export function registerStats(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const geoAttribution = () => deps.geo.attribution === true

  app.get('/panel/links/:id/stats', { preHandler: userGuard }, async (req, reply) => {
    const link = ownLinkOr404(deps, req, reply)
    if (!link) return
    const user = req.ctx.user as User
    const q = req.query as { from?: string; to?: string; format?: string }
    const range = clampToPlan(deps, user, parseRange(q.from, q.to, user.timezone, deps.now()))
    if (q.format === 'csv' || q.format === 'json') return exportReply(deps, reply, { linkId: link.id }, range, q.format, link.alias)
    const report = buildReport(db, { linkId: link.id }, range)
    const { t } = req.ctx
    return sendHtml(reply, panelLayout(req.ctx, {
      title: `${t('stats.title')} · ${link.title || link.alias}`,
      active: 'links',
      path: `/panel/links/${link.id}/stats`,
      body: html`${linkTabs(req.ctx, link, 'stats')}
<p class="muted">${t('stats.lifetime', { n: link.clicks })} · ${t('stats.created', { date: formatDateTime(req.ctx.locale, link.created_at, user.timezone) })}
${link.public_stats ? html` · <a href="/_/stats/${link.alias}">${t('stats.public_link')}</a>` : ''}</p>
${reportBody(req.ctx, report, { exportBase: `/panel/links/${link.id}/stats`, blocks: link.kind === 'bio' ? listBlocks(db, link.id) : undefined, geoAttribution: geoAttribution(), action: `/panel/links/${link.id}/stats` })}`,
    }))
  })

  app.get('/panel/stats', { preHandler: userGuard }, async (req, reply) => {
    const user = req.ctx.user as User
    const q = req.query as { from?: string; to?: string; format?: string }
    const range = clampToPlan(deps, user, parseRange(q.from, q.to, user.timezone, deps.now()))
    if (q.format === 'csv' || q.format === 'json') return exportReply(deps, reply, { userId: user.id }, range, q.format, 'todo')
    const report = buildReport(db, { userId: user.id }, range)
    const links = new Map<number, Link>(listLinks(db, user.id, { limit: 10000 }).items.map((l) => [l.id, l]))
    const { t } = req.ctx
    return sendHtml(reply, panelLayout(req.ctx, {
      title: t('stats.all_title'),
      active: 'stats',
      path: '/panel/stats',
      body: html`<h1>${t('stats.all_title')}</h1>
${reportBody(req.ctx, report, { exportBase: '/panel/stats', links, geoAttribution: geoAttribution(), action: '/panel/stats' })}`,
    }))
  })

  // estadísticas públicas (opcional por enlace): sin exportar ni ciudades
  app.get('/_/stats/:alias', async (req, reply) => {
    const link = findByAlias(db, (req.params as { alias: string }).alias)
    if (!link || !link.public_stats || link.password_hash || availability(deps, link) === 'missing') return reply.callNotFound()
    const q = req.query as { from?: string; to?: string }
    const range = parseRange(q.from, q.to, 'UTC', deps.now())
    const report = buildReport(db, { linkId: link.id }, range)
    report.breakdowns.city = []
    const { t } = req.ctx
    reply.header('X-Robots-Tag', 'noindex')
    return sendHtml(reply, authLayout(req.ctx, {
      title: `${t('stats.title')} · ${link.alias}`,
      path: `/_/stats/${link.alias}`,
      body: html`<h1>${t('stats.public_title', { alias: link.alias })}</h1>
<div class="public-stats">${reportBody(req.ctx, report, { geoAttribution: geoAttribution(), action: `/_/stats/${link.alias}` })}</div>`,
    }))
  })
}
