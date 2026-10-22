import type { DB } from '../../db/index.ts'

const parse = (s: unknown) => {
  try {
    return typeof s === 'string' ? JSON.parse(s) : s
  } catch {
    return s
  }
}

/** Todo lo del usuario en JSON (sin hashes de contraseña ni secretos de 2FA). */
export function exportUserData(db: DB, userId: number): Record<string, unknown> {
  const user = db
    .prepare('SELECT id, email, name, locale, timezone, role, email_verified_at, totp_enabled_at, is_verified, created_at FROM users WHERE id = ?')
    .get(userId)
  const links = (db.prepare('SELECT * FROM links WHERE user_id = ? ORDER BY id').all(userId) as Record<string, unknown>[]).map(
    ({ password_hash, ...l }) => ({ ...l, has_password: !!password_hash, data: parse(l.data), utm: parse(l.utm) }),
  )
  const blocks = (
    db.prepare('SELECT b.* FROM bio_blocks b JOIN links l ON l.id = b.link_id WHERE l.user_id = ? ORDER BY b.link_id, b.position').all(userId) as Record<string, unknown>[]
  ).map((b) => ({ ...b, data: parse(b.data), style: parse(b.style) }))
  const qr = (db.prepare('SELECT * FROM qr_codes WHERE user_id = ? ORDER BY id').all(userId) as Record<string, unknown>[]).map((q) => ({
    ...q,
    data: parse(q.data),
    style: parse(q.style),
  }))
  const stats = db
    .prepare(
      `SELECT e.link_id, e.day, e.kind, COUNT(*) AS events, COUNT(DISTINCT e.visitor) AS visitors
       FROM stat_events e JOIN links l ON l.id = e.link_id WHERE l.user_id = ?
       GROUP BY e.link_id, e.day, e.kind ORDER BY e.link_id, e.day`,
    )
    .all(userId)
  return {
    format: 'tubio-export/1',
    exported_at: new Date().toISOString(),
    user,
    projects: db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY id').all(userId),
    links,
    bio_blocks: blocks,
    qr_codes: qr,
    files: db.prepare('SELECT id, key, kind, original_name, mime, size, sha256, created_at FROM files WHERE user_id = ? ORDER BY id').all(userId),
    stats_daily: stats,
  }
}
