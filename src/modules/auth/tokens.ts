import type { DB } from '../../db/index.ts'
import { randomToken, sha256 } from '../../lib/crypto.ts'

export type TokenKind = 'verify_email' | 'reset_password'

export const TOKEN_TTL: Record<TokenKind, number> = {
  verify_email: 7 * 24 * 3600 * 1000,
  reset_password: 3600 * 1000,
}

export function createAuthToken(db: DB, userId: number, kind: TokenKind, now = Date.now()): string {
  const token = randomToken()
  // un solo token vivo por tipo y usuario
  db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ? AND used_at IS NULL').run(userId, kind)
  db.prepare(
    'INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(userId, kind, sha256(token), now + TOKEN_TTL[kind], now)
  return token
}

type Row = { id: number; user_id: number; expires_at: number; used_at: number | null }

/** Sin consumir: sirve para mostrar el formulario de nueva contraseña */
export function peekAuthToken(db: DB, token: string, kind: TokenKind, now = Date.now()): number | null {
  const row = db
    .prepare('SELECT id, user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ? AND kind = ?')
    .get(sha256(token), kind) as Row | undefined
  if (!row || row.used_at || row.expires_at <= now) return null
  return row.user_id
}

export function consumeAuthToken(db: DB, token: string, kind: TokenKind, now = Date.now()): number | null {
  const userId = peekAuthToken(db, token, kind, now)
  if (userId === null) return null
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE token_hash = ?').run(now, sha256(token))
  return userId
}
