import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type DB = Database.Database

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  return db
}

export type Migration = { id: string; sql: string }

export function listMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}-[\w-]+\.sql$/.test(f))
    .sort()
    .map((f) => ({ id: f.replace(/\.sql$/, ''), sql: readFileSync(join(dir, f), 'utf8') }))
}

/** Aplica en orden las migraciones pendientes; cada una en su transacción. Devuelve las aplicadas. */
export function migrate(db: DB, migrations = listMigrations()): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`)
  const done = new Set(db.prepare('SELECT id FROM schema_migrations').pluck().all() as string[])
  const applied: string[] = []
  for (const m of migrations) {
    if (done.has(m.id)) continue
    db.transaction(() => {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(m.id, Date.now())
    })()
    applied.push(m.id)
  }
  return applied
}
