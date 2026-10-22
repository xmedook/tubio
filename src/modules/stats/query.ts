import type { DB } from '../../db/index.ts'

export type Scope = { linkId: number } | { userId: number }

export type Range = { from: string; to: string; fromTs: number; toTs: number; offsetMin: number; days: string[] }

/** Minutos de desfase de una zona horaria respecto a UTC en un instante */
export function tzOffsetMinutes(timeZone: string, at: number): number {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at)
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value)
    const local = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'))
    return Math.round((local - Math.floor(at / 60000) * 60000) / 60000)
  } catch {
    return 0
  }
}

function ymd(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

const DAY = 86400_000
export const MAX_RANGE_DAYS = 366

/**
 * Rango de días locales [from, to] (ambos incluidos) en la zona del usuario.
 * Lo inválido cae a los últimos 30 días.
 */
export function parseRange(fromQ: unknown, toQ: unknown, timeZone: string, now: number): Range {
  const offsetMin = tzOffsetMinutes(timeZone, now)
  const today = ymd(now + offsetMin * 60000)
  const valid = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
  let to = valid(toQ) && toQ <= today ? toQ : today
  let from = valid(fromQ) ? fromQ : ymd(Date.parse(to) - 29 * DAY)
  if (from > to) [from, to] = [to, from]
  if ((Date.parse(to) - Date.parse(from)) / DAY >= MAX_RANGE_DAYS) from = ymd(Date.parse(to) - (MAX_RANGE_DAYS - 1) * DAY)
  const days: string[] = []
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) days.push(ymd(t))
  return { from, to, fromTs: Date.parse(from) - offsetMin * 60000, toTs: Date.parse(to) + DAY - offsetMin * 60000, offsetMin, days }
}

function where(scope: Scope): { sql: string; param: number } {
  return 'linkId' in scope
    ? { sql: 'e.link_id = ?', param: scope.linkId }
    : { sql: 'e.link_id IN (SELECT id FROM links WHERE user_id = ?)', param: scope.userId }
}

export type Row = { key: string | null; views: number; visitors: number; clicks: number }

export type Report = {
  range: Range
  totals: { views: number; visitors: number; clicks: number }
  series: { day: string; views: number; visitors: number; clicks: number }[]
  hours: number[]
  breakdowns: Record<Dimension, Row[]>
  blocks: { block_id: number; clicks: number }[]
  links: { link_id: number; views: number; clicks: number }[]
}

export const DIMENSIONS = ['country', 'city', 'device', 'os', 'browser', 'lang', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'variant'] as const
export type Dimension = (typeof DIMENSIONS)[number]

/**
 * Visitante único = hash distinto por día (la sal rota a diario: por diseño no se puede
 * seguir a alguien de un día a otro). En rangos, los únicos son la suma de únicos diarios.
 */
export function buildReport(db: DB, scope: Scope, range: Range, limit = 10): Report {
  const w = where(scope)
  const off = range.offsetMin * 60
  const base = `FROM stat_events e WHERE ${w.sql} AND e.ts >= ? AND e.ts < ?`
  const params = [w.param, range.fromTs, range.toTs]
  const localDay = `date(e.ts / 1000 + ${off}, 'unixepoch')`
  const uniq = `COUNT(DISTINCT CASE WHEN e.kind = 'view' THEN e.visitor || ${localDay} END)`

  const t = db
    .prepare(`SELECT SUM(e.kind = 'view') AS views, SUM(e.kind = 'click') AS clicks, ${uniq} AS visitors ${base}`)
    .get(...params) as { views: number | null; clicks: number | null; visitors: number }

  const byDay = new Map(
    (db.prepare(`SELECT ${localDay} AS day, SUM(e.kind = 'view') AS views, SUM(e.kind = 'click') AS clicks, COUNT(DISTINCT CASE WHEN e.kind = 'view' THEN e.visitor END) AS visitors ${base} GROUP BY day`).all(...params) as {
      day: string
      views: number
      clicks: number
      visitors: number
    }[]).map((r) => [r.day, r]),
  )
  const series = range.days.map((day) => ({ day, views: byDay.get(day)?.views ?? 0, visitors: byDay.get(day)?.visitors ?? 0, clicks: byDay.get(day)?.clicks ?? 0 }))

  const hours = new Array<number>(24).fill(0)
  for (const r of db.prepare(`SELECT CAST(strftime('%H', e.ts / 1000 + ${off}, 'unixepoch') AS INTEGER) AS h, COUNT(*) AS n ${base} GROUP BY h`).all(...params) as { h: number; n: number }[]) {
    hours[r.h] = r.n
  }

  const breakdowns = {} as Record<Dimension, Row[]>
  for (const dim of DIMENSIONS) {
    breakdowns[dim] = db
      .prepare(
        `SELECT e.${dim} AS key, SUM(e.kind = 'view') AS views, SUM(e.kind = 'click') AS clicks, ${uniq} AS visitors
         ${base} GROUP BY e.${dim} ORDER BY views + clicks DESC, key LIMIT ?`,
      )
      .all(...params, limit) as Row[]
  }

  const blocks = db
    .prepare(`SELECT e.block_id, COUNT(*) AS clicks ${base} AND e.kind = 'click' AND e.block_id IS NOT NULL GROUP BY e.block_id ORDER BY clicks DESC`)
    .all(...params) as { block_id: number; clicks: number }[]
  const links =
    'userId' in scope
      ? (db.prepare(`SELECT e.link_id, SUM(e.kind = 'view') AS views, SUM(e.kind = 'click') AS clicks ${base} GROUP BY e.link_id ORDER BY views + clicks DESC LIMIT 20`).all(...params) as Report['links'])
      : []

  return { range, totals: { views: t.views ?? 0, visitors: t.visitors ?? 0, clicks: t.clicks ?? 0 }, series, hours, breakdowns, blocks, links }
}

export type EventRow = {
  ts: number
  kind: string
  link_id: number
  block_id: number | null
  country: string | null
  city: string | null
  device: string | null
  os: string | null
  browser: string | null
  lang: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

export function* iterateEvents(db: DB, scope: Scope, range: Range): Generator<EventRow> {
  const w = where(scope)
  yield* db
    .prepare(
      `SELECT e.ts, e.kind, e.link_id, e.block_id, e.country, e.city, e.device, e.os, e.browser, e.lang, e.referrer, e.utm_source, e.utm_medium, e.utm_campaign
       FROM stat_events e WHERE ${w.sql} AND e.ts >= ? AND e.ts < ? ORDER BY e.ts`,
    )
    .iterate(w.param, range.fromTs, range.toTs) as Generator<EventRow>
}

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // evita inyección de fórmulas al abrir en hojas de cálculo
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
