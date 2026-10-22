import type { DB } from '../../db/index.ts'

export type Project = { id: number; user_id: number; name: string; color: string; created_at: number }

export function listProjects(db: DB, userId: number): Project[] {
  return db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY name COLLATE NOCASE').all(userId) as Project[]
}

export function getOwnProject(db: DB, id: number, userId: number): Project | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, userId) as Project | undefined
}

export function createProject(db: DB, userId: number, name: string, color: string, now: number): Project {
  const info = db.prepare('INSERT INTO projects (user_id, name, color, created_at) VALUES (?, ?, ?, ?)').run(userId, name, color, now)
  return getOwnProject(db, Number(info.lastInsertRowid), userId) as Project
}

export function updateProject(db: DB, id: number, name: string, color: string): void {
  db.prepare('UPDATE projects SET name = ?, color = ? WHERE id = ?').run(name, color, id)
}

export function deleteProject(db: DB, id: number): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

/** Cuántos enlaces y QR tiene cada proyecto */
export function projectCounts(db: DB, userId: number): Map<number, { links: number; qr: number }> {
  const out = new Map<number, { links: number; qr: number }>()
  for (const r of db.prepare('SELECT project_id AS id, COUNT(*) AS n FROM links WHERE user_id = ? AND project_id IS NOT NULL GROUP BY project_id').all(userId) as { id: number; n: number }[]) {
    out.set(r.id, { links: r.n, qr: 0 })
  }
  for (const r of db.prepare('SELECT project_id AS id, COUNT(*) AS n FROM qr_codes WHERE user_id = ? AND project_id IS NOT NULL GROUP BY project_id').all(userId) as { id: number; n: number }[]) {
    out.set(r.id, { links: out.get(r.id)?.links ?? 0, qr: r.n })
  }
  return out
}
