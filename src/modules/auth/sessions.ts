import type { DB } from '../../db/index.ts'
import { randomToken, sha256 } from '../../lib/crypto.ts'
import { findUserById, type User } from '../users/repo.ts'

export const SESSION_COOKIE = 'tb_sid'
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000
/** Antes de completar el 2FA la sesión dura poco */
const PENDING_TTL_MS = 10 * 60 * 1000
const SLIDE_AFTER_MS = 24 * 3600 * 1000

export type Session = {
  id_hash: string
  user_id: number
  csrf: string
  pending_2fa: number
  impersonator_id: number | null
  created_at: number
  expires_at: number
  last_seen_at: number
}

export function createSession(
  db: DB,
  userId: number,
  opts: { pending2fa?: boolean; impersonatorId?: number | null } = {},
  now = Date.now(),
): { token: string; session: Session } {
  const token = randomToken()
  const session: Session = {
    id_hash: sha256(token),
    user_id: userId,
    csrf: randomToken(24),
    pending_2fa: opts.pending2fa ? 1 : 0,
    impersonator_id: opts.impersonatorId ?? null,
    created_at: now,
    expires_at: now + (opts.pending2fa ? PENDING_TTL_MS : SESSION_TTL_MS),
    last_seen_at: now,
  }
  db.prepare(
    `INSERT INTO sessions (id_hash, user_id, csrf, pending_2fa, impersonator_id, created_at, expires_at, last_seen_at)
     VALUES (@id_hash, @user_id, @csrf, @pending_2fa, @impersonator_id, @created_at, @expires_at, @last_seen_at)`,
  ).run(session)
  return { token, session }
}

export function loadSession(db: DB, token: string, now = Date.now()): { session: Session; user: User } | null {
  if (!token || token.length > 100) return null
  const session = db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(sha256(token)) as Session | undefined
  if (!session) return null
  if (session.expires_at <= now) {
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(session.id_hash)
    return null
  }
  const user = findUserById(db, session.user_id)
  if (!user) return null
  if (!session.pending_2fa && now - session.last_seen_at > SLIDE_AFTER_MS) {
    session.last_seen_at = now
    session.expires_at = now + SESSION_TTL_MS
    db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?').run(
      now,
      session.expires_at,
      session.id_hash,
    )
  }
  return { session, user }
}

export function destroySession(db: DB, idHash: string): void {
  db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash)
}

/** Cierra todas las sesiones del usuario, salvo opcionalmente una. */
export function destroyUserSessions(db: DB, userId: number, exceptIdHash?: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?').run(userId, exceptIdHash ?? '')
}

export function purgeExpiredSessions(db: DB, now = Date.now()): number {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes
}
