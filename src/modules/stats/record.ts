import Bowser from 'bowser'
import type { FastifyRequest } from 'fastify'
import { isbot } from 'isbot'
import type { AppDeps } from '../../app.ts'
import { randomToken, sha256 } from '../../lib/crypto.ts'

export type Visit = {
  ua: string
  ip: string
  referrer: string | null
  lang: string | null
  utm: { source: string | null; medium: string | null; campaign: string | null }
}

export function visitFromRequest(req: FastifyRequest): Visit {
  const q = (req.query ?? {}) as Record<string, unknown>
  const s = (k: string) => (typeof q[k] === 'string' && (q[k] as string).trim() ? (q[k] as string).trim().slice(0, 100) : null)
  const al = req.headers['accept-language']
  return {
    ua: String(req.headers['user-agent'] ?? '').slice(0, 500),
    ip: req.ip,
    referrer: typeof req.headers.referer === 'string' ? req.headers.referer : null,
    lang: al ? (al.split(',')[0]?.split(';')[0]?.trim().split('-')[0]?.toLowerCase().slice(0, 8) ?? null) || null : null,
    utm: { source: s('utm_source'), medium: s('utm_medium'), campaign: s('utm_campaign') },
  }
}

export function isBotVisit(v: Visit): boolean {
  return !v.ua || isbot(v.ua)
}

function dayOf(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/** Sal del día: rota cada día UTC, así el hash no permite seguir a nadie más allá de un día. */
export function dailySalt(deps: AppDeps, day: string): string {
  const db = deps.db
  const row = db.prepare('SELECT salt FROM stat_salts WHERE day = ?').pluck().get(day) as string | undefined
  if (row) return row
  const salt = randomToken(32)
  db.prepare('INSERT OR IGNORE INTO stat_salts (day, salt) VALUES (?, ?)').run(day, salt)
  return db.prepare('SELECT salt FROM stat_salts WHERE day = ?').pluck().get(day) as string
}

function referrerHost(ref: string | null, ownHost: string): string | null {
  if (!ref) return null
  try {
    const h = new URL(ref).hostname.toLowerCase().replace(/^www\./, '')
    return h && h !== ownHost ? h.slice(0, 120) : null
  } catch {
    return null
  }
}

export function deviceInfo(ua: string): { device: string; os: string | null; browser: string | null } {
  try {
    const p = Bowser.parse(ua)
    const type = p.platform.type
    return {
      device: type === 'mobile' || type === 'tablet' || type === 'tv' ? type : 'desktop',
      os: p.os.name ?? null,
      browser: p.browser.name ?? null,
    }
  } catch {
    return { device: 'desktop', os: null, browser: null }
  }
}

/**
 * Registra una visita o clic. La IP nunca se guarda: sólo sha256(sal_del_día + ip + ua).
 * Devuelve false si fue un bot (no cuenta).
 */
export function recordEvent(
  deps: AppDeps,
  visit: Visit,
  e: { linkId: number; blockId?: number | null; kind: 'view' | 'click' },
): boolean {
  if (isBotVisit(visit)) return false
  const ts = deps.now()
  const day = dayOf(ts)
  const visitor = sha256(dailySalt(deps, day) + '|' + visit.ip + '|' + visit.ua).slice(0, 32)
  const geo = deps.geo.lookup(visit.ip)
  const dev = deviceInfo(visit.ua)
  let ownHost = ''
  try {
    ownHost = new URL(deps.config.baseUrl).hostname.replace(/^www\./, '')
  } catch {
    /* sin baseUrl válida */
  }
  deps.db
    .prepare(
      `INSERT INTO stat_events (link_id, block_id, kind, ts, day, hour, visitor, country, city, device, os, browser, lang, referrer, utm_source, utm_medium, utm_campaign)
       VALUES (@link_id, @block_id, @kind, @ts, @day, @hour, @visitor, @country, @city, @device, @os, @browser, @lang, @referrer, @utm_source, @utm_medium, @utm_campaign)`,
    )
    .run({
      link_id: e.linkId,
      block_id: e.blockId ?? null,
      kind: e.kind,
      ts,
      day,
      hour: new Date(ts).getUTCHours(),
      visitor,
      country: geo.country,
      city: geo.city,
      device: dev.device,
      os: dev.os,
      browser: dev.browser,
      lang: visit.lang,
      referrer: referrerHost(visit.referrer, ownHost),
      utm_source: visit.utm.source,
      utm_medium: visit.utm.medium,
      utm_campaign: visit.utm.campaign,
    })
  return true
}

/** Borra eventos fuera de la retención y sales de más de 2 días */
export function purgeStats(deps: AppDeps, retentionDays: number): { events: number; salts: number } {
  const now = deps.now()
  const events = deps.db.prepare('DELETE FROM stat_events WHERE ts < ?').run(now - retentionDays * 86400_000).changes
  const salts = deps.db.prepare('DELETE FROM stat_salts WHERE day < ?').run(dayOf(now - 2 * 86400_000)).changes
  return { events, salts }
}
