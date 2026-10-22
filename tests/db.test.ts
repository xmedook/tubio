import { describe, expect, it } from 'vitest'
import { migrate, openDb } from '../src/db/index.ts'

describe('migraciones', () => {
  it('aplican una vez y son idempotentes', () => {
    const db = openDb(':memory:')
    const first = migrate(db)
    expect(first[0]).toBe('0001-init')
    expect(migrate(db)).toEqual([])
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").pluck().all()
    expect(tables).toEqual(expect.arrayContaining(['users', 'links', 'bio_blocks', 'qr_codes', 'stat_events']))
  })
  it('alias único por dominio', () => {
    const db = openDb(':memory:')
    migrate(db)
    db.prepare("INSERT INTO users (email, password_hash, created_at, updated_at) VALUES ('a@b.c','x',0,0)").run()
    const ins = db.prepare("INSERT INTO links (user_id, alias, kind, created_at, updated_at) VALUES (1, ?, 'short', 0, 0)")
    ins.run('hola')
    expect(() => ins.run('hola')).toThrow(/UNIQUE/)
  })
})
