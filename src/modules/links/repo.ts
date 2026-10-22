import type { DB } from '../../db/index.ts'
import type { Utm } from '../../lib/urls.ts'

export const LINK_KINDS = ['bio', 'short', 'file', 'vcard', 'event'] as const
export type LinkKind = (typeof LINK_KINDS)[number]
export const MAIN_DOMAIN = 0

type Row = {
  id: number
  user_id: number
  project_id: number | null
  domain_id: number
  alias: string
  kind: LinkKind
  title: string
  target_url: string | null
  redirect_code: 301 | 302 | 307 | 308
  data: string
  is_enabled: number
  starts_at: number | null
  ends_at: number | null
  expired_url: string | null
  click_limit: number | null
  limit_url: string | null
  password_hash: string | null
  is_sensitive: number
  utm: string
  pixel_ids: string
  splash_id: number | null
  targeting: string
  cloak: number
  forward_query: number
  public_stats: number
  clicks: number
  hits: number
  created_at: number
  updated_at: number
}

export type TargetRule = { type: 'country' | 'device' | 'lang' | 'os'; value: string; url: string }
export type Targeting = { rules?: TargetRule[]; ab?: { url: string; weight: number }[] }
export type Link = Omit<Row, 'data' | 'utm' | 'pixel_ids' | 'targeting'> & { data: Record<string, unknown>; utm: Utm; pixel_ids: number[]; targeting: Targeting }

function parseJson<T>(s: string, fallback: T): T {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as T) : fallback
  } catch {
    return fallback
  }
}

function hydrate(r: Row | undefined): Link | undefined {
  if (!r) return undefined
  const ids = parseJson<unknown[]>(r.pixel_ids ?? '[]', [])
  return {
    ...r,
    data: parseJson(r.data, {}),
    utm: parseJson(r.utm, {}),
    pixel_ids: Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : [],
    targeting: parseJson<Targeting>(r.targeting ?? '{}', {}),
  }
}

export type LinkInput = {
  project_id: number | null
  alias: string
  kind: LinkKind
  title: string
  target_url: string | null
  redirect_code: 301 | 302 | 307 | 308
  data: Record<string, unknown>
  is_enabled: boolean
  starts_at: number | null
  ends_at: number | null
  expired_url: string | null
  click_limit: number | null
  limit_url: string | null
  /** undefined = no cambiar; null = quitar */
  password_hash?: string | null
  is_sensitive: boolean
  utm: Utm
  forward_query: boolean
  public_stats: boolean
  pixel_ids?: number[]
  splash_id?: number | null
  targeting?: Targeting
  cloak?: boolean
}

function toParams(input: Partial<LinkInput>): Record<string, unknown> {
  const p: Record<string, unknown> = { ...input }
  if (input.data) p.data = JSON.stringify(input.data)
  if (input.utm) p.utm = JSON.stringify(input.utm)
  if (input.pixel_ids) p.pixel_ids = JSON.stringify(input.pixel_ids)
  if (input.targeting) p.targeting = JSON.stringify(input.targeting)
  for (const k of ['is_enabled', 'is_sensitive', 'forward_query', 'public_stats', 'cloak'] as const) if (k in input) p[k] = input[k] ? 1 : 0
  return p
}

export function createLink(db: DB, userId: number, input: LinkInput, now: number): Link {
  const p = { password_hash: null, ...toParams(input), user_id: userId, domain_id: MAIN_DOMAIN, created_at: now, updated_at: now }
  const cols = Object.keys(p)
  const info = db.prepare(`INSERT INTO links (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`).run(p)
  return getLink(db, Number(info.lastInsertRowid)) as Link
}

const UPDATABLE = new Set([
  'project_id', 'alias', 'title', 'target_url', 'redirect_code', 'data', 'is_enabled', 'starts_at', 'ends_at',
  'expired_url', 'click_limit', 'limit_url', 'password_hash', 'is_sensitive', 'utm', 'forward_query', 'public_stats',
  'pixel_ids', 'splash_id', 'targeting', 'cloak',
])

export function updateLink(db: DB, id: number, patch: Partial<LinkInput>, now: number): void {
  const p = toParams(patch)
  const keys = Object.keys(p).filter((k) => UPDATABLE.has(k) && p[k] !== undefined)
  if (!keys.length) return
  db.prepare(`UPDATE links SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = @updated_at WHERE id = @id`).run({
    ...Object.fromEntries(keys.map((k) => [k, p[k]])),
    updated_at: now,
    id,
  })
}

export function getLink(db: DB, id: number): Link | undefined {
  return hydrate(db.prepare('SELECT * FROM links WHERE id = ?').get(id) as Row | undefined)
}

/** El enlace sólo si es de ese usuario */
export function getOwnLink(db: DB, id: number, userId: number): Link | undefined {
  return hydrate(db.prepare('SELECT * FROM links WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined)
}

export function findByAlias(db: DB, alias: string, domainId = MAIN_DOMAIN): Link | undefined {
  return hydrate(db.prepare('SELECT * FROM links WHERE domain_id = ? AND alias = ?').get(domainId, alias.toLowerCase()) as Row | undefined)
}

export function aliasTaken(db: DB, alias: string, exceptId?: number, domainId = MAIN_DOMAIN): boolean {
  return !!db.prepare('SELECT 1 FROM links WHERE domain_id = ? AND alias = ? AND id != ?').get(domainId, alias, exceptId ?? 0)
}

export type LinkFilter = { kind?: LinkKind | undefined; projectId?: number | undefined; q?: string | undefined; limit?: number; offset?: number }

export function listLinks(db: DB, userId: number, f: LinkFilter = {}): { items: Link[]; total: number } {
  const where = ['user_id = @userId']
  const params: Record<string, unknown> = { userId, limit: f.limit ?? 50, offset: f.offset ?? 0 }
  if (f.kind) {
    where.push('kind = @kind')
    params.kind = f.kind
  }
  if (f.projectId) {
    where.push('project_id = @projectId')
    params.projectId = f.projectId
  }
  if (f.q) {
    where.push("(alias LIKE @q ESCAPE '\\' OR title LIKE @q ESCAPE '\\' OR target_url LIKE @q ESCAPE '\\')")
    params.q = `%${f.q.replace(/[%_\\]/g, (c) => '\\' + c)}%`
  }
  const w = where.join(' AND ')
  const items = (db.prepare(`SELECT * FROM links WHERE ${w} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`).all(params) as Row[]).map(
    (r) => hydrate(r) as Link,
  )
  const { limit: _l, offset: _o, ...countParams } = params
  const total = db.prepare(`SELECT COUNT(*) FROM links WHERE ${w}`).pluck().get(countParams) as number
  return { items, total }
}

export function deleteLink(db: DB, id: number): void {
  db.prepare('DELETE FROM links WHERE id = ?').run(id)
}

/** hits = toda entrega (tope de clics); clicks = sólo visitas humanas */
export function incrementClicks(db: DB, id: number, human = true): void {
  db.prepare('UPDATE links SET hits = hits + 1, clicks = clicks + ? WHERE id = ?').run(human ? 1 : 0, id)
}

export function linkUrl(baseUrl: string, link: Pick<Link, 'alias'>): string {
  return `${baseUrl}/${link.alias}`
}
