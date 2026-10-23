import type { DB } from '../../db/index.ts'

export type Notification = { id: number; user_id: number; kind: string; title: string; body: string; url: string; read_at: number | null; created_at: number }

/** Deja un aviso en la campanita (url relativa del panel) */
export function notifyUser(db: DB, userId: number, n: { kind: string; title: string; body?: string; url?: string }, now: number): void {
  db.prepare('INSERT INTO notifications (user_id, kind, title, body, url, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(userId, n.kind, n.title.slice(0, 200), (n.body ?? '').slice(0, 500), n.url ?? '', now)
}

export function unreadCount(db: DB, userId: number): number {
  return db.prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL').pluck().get(userId) as number
}

export function listNotifications(db: DB, userId: number, limit = 50): Notification[] {
  return db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(userId, limit) as Notification[]
}

export function markAllRead(db: DB, userId: number, now: number): void {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now, userId)
}

export function purgeNotifications(db: DB, now: number): number {
  return db.prepare('DELETE FROM notifications WHERE created_at < ?').run(now - 90 * 86400_000).changes
}
