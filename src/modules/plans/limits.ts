import type { DB } from '../../db/index.ts'
import type { User } from '../users/repo.ts'

/** Límites de un plan. -1 = ilimitado. */
export type Limits = {
  bio_pages: number
  links: number
  blocks_per_page: number
  qr: number
  stats_days: number
  storage_mb: number
  remove_branding: boolean
  marketing: boolean
  custom_domains: number
  capture_targets: string[]
  custom_code: boolean
  team_members: number
  api: boolean
}

export type Plan = {
  id: number
  slug: string
  name: string
  price_month: number | null
  price_year: number | null
  price_lifetime: number | null
  currency: string
  trial_days: number
  limits: Limits
  is_public: number
  sort: number
}

const FALLBACK: Limits = {
  bio_pages: 1, links: 25, blocks_per_page: 30, qr: 10, stats_days: 30, storage_mb: 50, remove_branding: false,
  marketing: false, custom_domains: 0, capture_targets: ['email'], custom_code: false, team_members: 0, api: false,
}

type Raw = Omit<Plan, 'limits'> & { limits: string }
function hydrate(r: Raw): Plan {
  let limits: Partial<Limits> = {}
  try {
    limits = JSON.parse(r.limits)
  } catch {
    /* se queda con lo de respaldo */
  }
  return { ...r, limits: { ...FALLBACK, ...limits } }
}

export function listPlans(db: DB, onlyPublic = false): Plan[] {
  return (db.prepare(`SELECT * FROM plans ${onlyPublic ? 'WHERE is_public = 1' : ''} ORDER BY sort, id`).all() as Raw[]).map(hydrate)
}

export function getPlanBySlug(db: DB, slug: string): Plan | undefined {
  const r = db.prepare('SELECT * FROM plans WHERE slug = ?').get(slug) as Raw | undefined
  return r ? hydrate(r) : undefined
}

export function getPlan(db: DB, id: number): Plan | undefined {
  const r = db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as Raw | undefined
  return r ? hydrate(r) : undefined
}

/**
 * Plan vigente del usuario: el asignado si no venció; si no, el gratuito.
 * Los admins no tienen límites (operan y dan soporte).
 */
export function planOf(db: DB, user: Pick<User, 'role'> & { plan_id?: number | null; plan_expires_at?: number | null }, now: number): Plan {
  const free = getPlanBySlug(db, 'free') ?? ({ id: 0, slug: 'free', name: 'Gratis', price_month: null, price_year: null, price_lifetime: null, currency: 'MXN', trial_days: 0, limits: FALLBACK, is_public: 1, sort: 0 } as Plan)
  if (user.role === 'admin') return { ...free, slug: 'admin', name: 'Admin', limits: { ...FALLBACK, bio_pages: -1, links: -1, blocks_per_page: 100, qr: -1, stats_days: 3650, storage_mb: 100_000, remove_branding: true, marketing: true, custom_domains: 100, capture_targets: ['email', 'webhook', 'slack', 'discord', 'telegram'], custom_code: true, team_members: 100, api: true } }
  if (user.plan_id && (!user.plan_expires_at || user.plan_expires_at > now)) return getPlan(db, user.plan_id) ?? free
  return free
}

export function limitsOf(db: DB, user: Parameters<typeof planOf>[1], now: number): Limits {
  return planOf(db, user, now).limits
}

/** ¿Cabe uno más? (-1 = ilimitado) */
export function withinLimit(limit: number, used: number): boolean {
  return limit < 0 || used < limit
}

export type Usage = { bio_pages: number; links: number; qr: number; storage_mb: number }

export function usageOf(db: DB, userId: number): Usage {
  const n = (sql: string) => db.prepare(sql).pluck().get(userId) as number
  return {
    bio_pages: n("SELECT COUNT(*) FROM links WHERE user_id = ? AND kind = 'bio'"),
    links: n("SELECT COUNT(*) FROM links WHERE user_id = ? AND kind != 'bio'"),
    qr: n('SELECT COUNT(*) FROM qr_codes WHERE user_id = ?'),
    storage_mb: Math.round((n('SELECT COALESCE(SUM(size), 0) FROM files WHERE user_id = ?') / 1048576) * 10) / 10,
  }
}

/** Bloques que exigen función de plan */
export const PLAN_GATED_BLOCKS: Record<string, keyof Limits> = { html: 'custom_code', iframe: 'custom_code' }
