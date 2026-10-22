import type { DB } from '../../db/index.ts'

export type User = {
  id: number
  email: string
  password_hash: string
  name: string
  locale: string
  timezone: string
  role: 'user' | 'admin'
  status: 'active' | 'suspended'
  email_verified_at: number | null
  totp_secret: string | null
  totp_enabled_at: number | null
  is_verified: number
  created_at: number
  updated_at: number
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function findUserById(db: DB, id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined
}

export function findUserByEmail(db: DB, email: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) as User | undefined
}

export function createUser(
  db: DB,
  u: { email: string; passwordHash: string; name?: string; locale?: string; role?: 'user' | 'admin' },
  now = Date.now(),
): User {
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, name, locale, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(normalizeEmail(u.email), u.passwordHash, u.name ?? '', u.locale ?? 'es-MX', u.role ?? 'user', now, now)
  return findUserById(db, Number(info.lastInsertRowid)) as User
}

const UPDATABLE = [
  'email',
  'password_hash',
  'name',
  'locale',
  'timezone',
  'role',
  'status',
  'email_verified_at',
  'totp_secret',
  'totp_enabled_at',
  'is_verified',
] as const
type Updatable = Partial<Pick<User, (typeof UPDATABLE)[number]>>

export function updateUser(db: DB, id: number, patch: Updatable, now = Date.now()): void {
  const keys = Object.keys(patch).filter((k): k is (typeof UPDATABLE)[number] =>
    (UPDATABLE as readonly string[]).includes(k),
  )
  if (keys.length === 0) return
  const sets = keys.map((k) => `${k} = @${k}`).join(', ')
  db.prepare(`UPDATE users SET ${sets}, updated_at = @updated_at WHERE id = @id`).run({ ...patch, updated_at: now, id })
}

export function deleteUser(db: DB, id: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

export function countUsers(db: DB): number {
  return db.prepare('SELECT COUNT(*) FROM users').pluck().get() as number
}

export function searchUsers(db: DB, q: string, limit = 50, offset = 0): User[] {
  const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`
  return db
    .prepare(
      `SELECT * FROM users WHERE email LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'
       ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(like, like, limit, offset) as User[]
}
