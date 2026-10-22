import { addBlockClick } from '../stats/buffer.ts'
import type { DB } from '../../db/index.ts'
import type { BlockRow, BlockStyle } from './blocks.ts'

type Raw = Omit<BlockRow, 'data' | 'style'> & { data: string; style: string }

function hydrate(r: Raw): BlockRow {
  let data: Record<string, unknown> = {}
  let style: BlockStyle = {}
  try {
    data = JSON.parse(r.data)
  } catch {
    /* dato corrupto: bloque vacío */
  }
  try {
    style = JSON.parse(r.style)
  } catch {
    /* sin estilo */
  }
  return { ...r, data, style }
}

export function listBlocks(db: DB, linkId: number): BlockRow[] {
  return (db.prepare('SELECT * FROM bio_blocks WHERE link_id = ? ORDER BY position, id').all(linkId) as Raw[]).map(hydrate)
}

export function countBlocks(db: DB, linkId: number): number {
  return db.prepare('SELECT COUNT(*) FROM bio_blocks WHERE link_id = ?').pluck().get(linkId) as number
}

/** Bloque sólo si su página es del usuario */
export function getOwnBlock(db: DB, id: number, userId: number): BlockRow | undefined {
  const r = db
    .prepare('SELECT b.* FROM bio_blocks b JOIN links l ON l.id = b.link_id WHERE b.id = ? AND l.user_id = ?')
    .get(id, userId) as Raw | undefined
  return r ? hydrate(r) : undefined
}

export function getBlock(db: DB, id: number): BlockRow | undefined {
  const r = db.prepare('SELECT * FROM bio_blocks WHERE id = ?').get(id) as Raw | undefined
  return r ? hydrate(r) : undefined
}

export type BlockInput = {
  type: string
  is_enabled: boolean
  starts_at: number | null
  ends_at: number | null
  data: Record<string, unknown>
  style: BlockStyle
}

export function createBlock(db: DB, linkId: number, b: BlockInput, now: number): BlockRow {
  const pos = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM bio_blocks WHERE link_id = ?').pluck().get(linkId) as number) ?? 0
  const info = db
    .prepare(
      `INSERT INTO bio_blocks (link_id, type, position, is_enabled, starts_at, ends_at, data, style, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(linkId, b.type, pos, b.is_enabled ? 1 : 0, b.starts_at, b.ends_at, JSON.stringify(b.data), JSON.stringify(b.style), now, now)
  return getBlock(db, Number(info.lastInsertRowid)) as BlockRow
}

export function updateBlock(db: DB, id: number, b: Omit<BlockInput, 'type'>, now: number): void {
  db.prepare('UPDATE bio_blocks SET is_enabled = ?, starts_at = ?, ends_at = ?, data = ?, style = ?, updated_at = ? WHERE id = ?').run(
    b.is_enabled ? 1 : 0,
    b.starts_at,
    b.ends_at,
    JSON.stringify(b.data),
    JSON.stringify(b.style),
    now,
    id,
  )
}

export function setBlockEnabled(db: DB, id: number, enabled: boolean): void {
  db.prepare('UPDATE bio_blocks SET is_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
}

export function deleteBlock(db: DB, id: number): void {
  db.prepare('DELETE FROM bio_blocks WHERE id = ?').run(id)
}

/** Reordena con la lista completa de ids; ignora ids ajenos a la página */
export function reorderBlocks(db: DB, linkId: number, ids: number[]): void {
  const own = new Set(db.prepare('SELECT id FROM bio_blocks WHERE link_id = ?').pluck().all(linkId) as number[])
  const ordered = ids.filter((id) => own.has(id))
  for (const id of own) if (!ordered.includes(id)) ordered.push(id)
  const upd = db.prepare('UPDATE bio_blocks SET position = ? WHERE id = ?')
  db.transaction(() => ordered.forEach((id, i) => upd.run(i, id)))()
}

export function moveBlock(db: DB, linkId: number, id: number, dir: -1 | 1): void {
  const ids = listBlocks(db, linkId).map((b) => b.id)
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j] as number, ids[i] as number]
  reorderBlocks(db, linkId, ids)
}

export function incrementBlockClicks(db: DB, id: number): void {
  addBlockClick(db, id)
}

/** Llaves de imágenes que usa una página (bloques + diseño), para limpiar huérfanas */
export function imageKeysInUse(db: DB, userId: number): Set<string> {
  const keys = new Set<string>()
  const add = (v: unknown) => {
    if (typeof v === 'string' && /^[\w-]+\.webp$/.test(v)) keys.add(v)
    else if (Array.isArray(v)) v.forEach(add)
  }
  for (const d of db.prepare('SELECT b.data FROM bio_blocks b JOIN links l ON l.id = b.link_id WHERE l.user_id = ?').pluck().all(userId) as string[]) {
    try {
      for (const v of Object.values(JSON.parse(d) as Record<string, unknown>)) add(v)
    } catch {
      /* ignora */
    }
  }
  for (const d of db.prepare('SELECT data FROM splashes WHERE user_id = ?').pluck().all(userId) as string[]) {
    try {
      for (const v of Object.values(JSON.parse(d) as Record<string, unknown>)) add(v)
    } catch {
      /* ignora */
    }
  }
  for (const d of db.prepare("SELECT data FROM links WHERE user_id = ? AND kind = 'bio'").pluck().all(userId) as string[]) {
    try {
      for (const v of Object.values(JSON.parse(d) as Record<string, unknown>)) add(v)
    } catch {
      /* ignora */
    }
  }
  return keys
}
