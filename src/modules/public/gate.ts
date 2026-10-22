import type { FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { hmac, safeEqual } from '../../lib/crypto.ts'
import type { Link } from '../links/repo.ts'
import { findUserById } from '../users/repo.ts'

export const unlockCookie = (link: Link) => `tb_pw_${link.id}`
export const okCookie = (link: Link) => `tb_ok_${link.id}`
export const unlockValue = (deps: AppDeps, link: Link) => hmac(deps.config.secret, `${link.id}:${link.password_hash}`)
export const okValue = (deps: AppDeps, link: Link) => hmac(deps.config.secret, `${link.id}:ok`)

export type Availability = 'ok' | 'missing' | 'expired' | 'limit'

/** Estado del enlace sin mirar al visitante: activo, dueño activo, programación y tope */
export function availability(deps: AppDeps, link: Link): Availability {
  const now = deps.now()
  const owner = findUserById(deps.db, link.user_id)
  if (!owner || owner.status !== 'active' || !link.is_enabled) return 'missing'
  if (link.starts_at && now < link.starts_at) return 'missing'
  if (link.ends_at && now >= link.ends_at) return 'expired'
  if (link.click_limit && link.clicks >= link.click_limit) return 'limit'
  return 'ok'
}

export function isUnlocked(deps: AppDeps, req: FastifyRequest, link: Link): boolean {
  if (!link.password_hash) return true
  const c = req.cookies[unlockCookie(link)]
  return !!c && safeEqual(c, unlockValue(deps, link))
}

export function isConfirmed(deps: AppDeps, req: FastifyRequest, link: Link): boolean {
  if (!link.is_sensitive) return true
  const c = req.cookies[okCookie(link)]
  return !!c && safeEqual(c, okValue(deps, link))
}
