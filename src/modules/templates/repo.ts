import type { DB } from '../../db/index.ts'
import type { BlockRow } from '../bio/blocks.ts'

export type TemplateBlock = { type: string; is_enabled: number; data: Record<string, unknown>; style: Record<string, unknown> }
export type Template = { id: number; user_id: number | null; slug: string | null; name: string; category: string; design: Record<string, unknown>; blocks: TemplateBlock[]; uses: number; sort: number; created_at: number }

type Raw = Omit<Template, 'design' | 'blocks'> & { design: string; blocks: string }
const hydrate = (r: Raw): Template => ({ ...r, design: safe(r.design, {}), blocks: safe(r.blocks, []) })
function safe<T>(s: string, d: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return d
  }
}

/** Generales primero (por orden), luego las propias */
export function listTemplates(db: DB, userId: number): Template[] {
  return (db.prepare('SELECT * FROM templates WHERE user_id IS NULL OR user_id = ? ORDER BY user_id IS NOT NULL, sort, uses DESC, id').all(userId) as Raw[]).map(hydrate)
}

export function getUsableTemplate(db: DB, id: number, userId: number): Template | undefined {
  const r = db.prepare('SELECT * FROM templates WHERE id = ? AND (user_id IS NULL OR user_id = ?)').get(id, userId) as Raw | undefined
  return r ? hydrate(r) : undefined
}

export function createTemplate(db: DB, t: { userId: number | null; name: string; category: string; design: Record<string, unknown>; blocks: TemplateBlock[]; slug?: string; sort?: number }, now: number): number {
  return Number(
    db.prepare('INSERT INTO templates (user_id, slug, name, category, design, blocks, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(t.userId, t.slug ?? null, t.name, t.category, JSON.stringify(t.design), JSON.stringify(t.blocks), t.sort ?? 0, now).lastInsertRowid,
  )
}

export function snapshotBlocks(rows: BlockRow[]): TemplateBlock[] {
  return rows.map((b) => ({ type: b.type, is_enabled: b.is_enabled, data: b.data, style: b.style as Record<string, unknown> }))
}

/** Bloques en memoria para la vista previa (ids negativos: no son clicables) */
export function previewBlocks(t: Template, now: number): BlockRow[] {
  return t.blocks.map((b, i) => ({ id: -(i + 1), link_id: 0, section_id: null, type: b.type, position: i, is_enabled: b.is_enabled, starts_at: null, ends_at: null, data: b.data, style: b.style as BlockRow['style'], clicks: 0, created_at: now, updated_at: now }))
}
