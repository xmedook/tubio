import type { AppDeps } from '../../app.ts'
import { audit, getSetting } from '../settings/repo.ts'
import { findUserById, updateUser } from '../users/repo.ts'
import { getPlanBySlug } from './limits.ts'

/** Cuántos lugares de fundador quedan */
export function foundersLeft(deps: AppDeps): number {
  const max = getSetting(deps.db, 'founders_max')
  const used = deps.db.prepare('SELECT COUNT(*) FROM users WHERE founder_no IS NOT NULL').pluck().get() as number
  return Math.max(0, max - used)
}

/**
 * Al confirmar el correo: si quedan lugares, la cuenta es fundadora (número fijo) y recibe
 * el plan de fundadores por `founders_days`. No pisa un plan pagado vigente ni aplica a admins.
 * Devuelve el número de fundador o null.
 */
export function claimFounder(deps: AppDeps, userId: number): number | null {
  const { db } = deps
  const now = deps.now()
  if (!getSetting(db, 'founders_open')) return null
  const plan = getPlanBySlug(db, getSetting(db, 'founders_plan'))
  if (!plan) return null
  return db.transaction(() => {
    const u = findUserById(db, userId)
    if (!u || u.role === 'admin' || u.founder_no || !u.email_verified_at || u.status !== 'active') return null
    if (foundersLeft(deps) <= 0) return null
    const n = ((db.prepare('SELECT MAX(founder_no) FROM users').pluck().get() as number | null) ?? 0) + 1
    const paid = u.plan_id && (!u.plan_expires_at || u.plan_expires_at > now) && u.plan_id !== plan.id
    const base = u.plan_id === plan.id && u.plan_expires_at && u.plan_expires_at > now ? u.plan_expires_at : now
    updateUser(db, userId, paid ? { founder_no: n } : { founder_no: n, plan_id: plan.id, plan_expires_at: base + getSetting(db, 'founders_days') * 86400_000 }, now)
    audit(db, { actorId: userId, userId, action: 'user.founder', meta: { n, plan: plan.slug } }, now)
    return n
  })()
}
