import { randomInt } from 'node:crypto'
import type { DB } from '../../db/index.ts'
import { getPlan, type Plan } from './limits.ts'

export type Period = 'month' | 'year' | 'lifetime'
export const PERIODS: Period[] = ['month', 'year', 'lifetime']
export const IVA = 0.16

export type Payment = {
  id: number
  user_id: number
  plan_id: number
  period: Period
  amount: number
  discount: number
  currency: string
  method: 'transfer' | 'stripe' | 'mercadopago' | 'manual'
  status: 'pending' | 'paid' | 'rejected' | 'refunded' | 'cancelled'
  reference: string
  coupon_code: string | null
  proof_file_id: number | null
  provider_ref: string | null
  billing_name: string
  notes: string
  created_at: number
  paid_at: number | null
  reviewed_by: number | null
}

export function priceOf(plan: Plan, period: Period): number | null {
  return period === 'month' ? plan.price_month : period === 'year' ? plan.price_year : plan.price_lifetime
}

export type Coupon = { code: string; percent_off: number; max_uses: number | null; used: number; expires_at: number | null; plans: string }

/** Cupón aplicable o la clave del error */
export function checkCoupon(db: DB, code: string, plan: Plan, now: number): { coupon: Coupon } | { error: string } {
  const c = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code.trim().toUpperCase()) as Coupon | undefined
  if (!c) return { error: 'err.coupon_invalid' }
  if (c.expires_at && c.expires_at < now) return { error: 'err.coupon_expired' }
  if (c.max_uses !== null && c.used >= c.max_uses) return { error: 'err.coupon_used' }
  let plans: string[] = []
  try {
    plans = JSON.parse(c.plans)
  } catch {
    plans = []
  }
  if (plans.length && !plans.includes(plan.slug)) return { error: 'err.coupon_plan' }
  return { coupon: c }
}

export function quote(plan: Plan, period: Period, coupon: Coupon | null): { gross: number; discount: number; total: number } | null {
  const gross = priceOf(plan, period)
  if (gross === null) return null
  const discount = coupon ? Math.round((gross * coupon.percent_off) / 100) : 0
  return { gross, discount, total: gross - discount }
}

// sin 0/O, 1/I para que se pueda dictar en el banco
const REF = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function newReference(): string {
  let s = 'TB'
  for (let i = 0; i < 8; i++) s += REF[randomInt(REF.length)]
  return s
}

/** Activa (o extiende) el plan pagado. Extiende si ya tenía el mismo plan vigente. */
export function activatePayment(db: DB, p: Payment, now: number): number | null {
  const plan = getPlan(db, p.plan_id)
  if (!plan) return null
  const u = db.prepare('SELECT plan_id, plan_expires_at FROM users WHERE id = ?').get(p.user_id) as { plan_id: number | null; plan_expires_at: number | null } | undefined
  if (!u) return null
  let expires: number | null
  if (p.period === 'lifetime') expires = null
  else {
    const base = u.plan_id === p.plan_id && u.plan_expires_at && u.plan_expires_at > now ? u.plan_expires_at : now
    const d = new Date(base)
    if (p.period === 'month') d.setUTCMonth(d.getUTCMonth() + 1)
    else d.setUTCFullYear(d.getUTCFullYear() + 1)
    expires = d.getTime()
  }
  db.prepare('UPDATE users SET plan_id = ?, plan_expires_at = ? WHERE id = ?').run(p.plan_id, expires, p.user_id)
  db.prepare("UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ?").run(now, p.id)
  if (p.coupon_code) db.prepare('UPDATE coupons SET used = used + 1 WHERE code = ?').run(p.coupon_code)
  return expires
}

/** Desglose del IVA de un precio con IVA incluido (centavos) */
export function ivaBreakdown(total: number): { subtotal: number; iva: number } {
  const subtotal = Math.round(total / (1 + IVA))
  return { subtotal, iva: total - subtotal }
}
