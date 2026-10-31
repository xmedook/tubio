import type { DB } from '../../db/index.ts'
import type { BlockRow } from '../bio/blocks.ts'
import {
  CLASSIC_SECTION,
  MS_MAX_PAGES,
  MS_MAX_SECTIONS,
  pageDataSchema,
  readPageData,
  readSectionData,
  readSite,
  sectionDataSchema,
  type PageData,
  type SectionData,
  type SiteConfig,
} from './schema.ts'

export type MsPage = { id: number; link_id: number; slug: string; title: string; position: number; is_enabled: number; data: PageData }
export type MsSection = { id: number; page_id: number; position: number; is_enabled: number; data: SectionData }

export type Site = {
  config: SiteConfig
  pages: MsPage[]
  sections: MsSection[]
  /** false = la bio aún no tiene filas de sitio: se ve como un sitio de 1 página con 1 sección angosta */
  materialized: boolean
}

type PageRaw = Omit<MsPage, 'data'> & { data: string }
type SectionRaw = Omit<MsSection, 'data'> & { data: string }

const parse = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
const hydratePage = (r: PageRaw): MsPage => ({ ...r, data: readPageData(parse(r.data)) })
const hydrateSection = (r: SectionRaw): MsSection => ({ ...r, data: readSectionData(parse(r.data)) })

/** Sitio virtual de una bio sin filas: lo que ya existía, sin cambiar nada */
function virtualSite(config: SiteConfig): Site {
  return {
    config,
    materialized: false,
    pages: [{ id: 0, link_id: 0, slug: '', title: '', position: 0, is_enabled: 1, data: pageDataSchema.parse({}) }],
    sections: [{ id: 0, page_id: 0, position: 0, is_enabled: 1, data: CLASSIC_SECTION }],
  }
}

export function loadSite(db: DB, linkId: number): Site {
  const cfgRow = db.prepare('SELECT data FROM ms_sites WHERE link_id = ?').pluck().get(linkId) as string | undefined
  const config = readSite(cfgRow ? parse(cfgRow) : {})
  const pages = (db.prepare('SELECT * FROM ms_pages WHERE link_id = ? ORDER BY position, id').all(linkId) as PageRaw[]).map(hydratePage)
  if (!pages.length) return virtualSite(config)
  const ids = pages.map((p) => p.id)
  const sections = (db.prepare(`SELECT * FROM ms_sections WHERE page_id IN (${ids.map(() => '?').join(',')}) ORDER BY position, id`).all(...ids) as SectionRaw[]).map(hydrateSection)
  return { config, pages, sections, materialized: true }
}

/** ¿Se ve igual que una bio de siempre? (1 página, 1 sección clásica, sin cabecera/barra/pie) */
export function isClassic(site: Site): boolean {
  const c = site.config
  return (
    site.pages.length === 1 &&
    site.pages[0]?.slug === '' &&
    site.sections.length === 1 &&
    !!site.sections[0]?.data.classic &&
    !c.cabecera.activa &&
    !c.barra.activa &&
    !c.pie.activo
  )
}

export function homePage(site: Site): MsPage {
  return site.pages.find((p) => p.slug === '') ?? (site.pages[0] as MsPage)
}

export function pageBySlug(site: Site, slug: string): MsPage | undefined {
  return site.pages.find((p) => p.slug === slug)
}

export function sectionsOf(site: Site, pageId: number): MsSection[] {
  return site.sections.filter((s) => s.page_id === pageId)
}

/** Reparte los bloques por sección; los sueltos (section_id NULL o huérfano) caen en la 1.ª sección de inicio */
export function groupBlocks(site: Site, blocks: BlockRow[]): Map<number, BlockRow[]> {
  const out = new Map<number, BlockRow[]>()
  for (const s of site.sections) out.set(s.id, [])
  const known = new Set(site.sections.map((s) => s.id))
  const first = sectionsOf(site, homePage(site).id)[0]
  for (const b of blocks) {
    const sid = b.section_id != null && known.has(b.section_id) ? b.section_id : first?.id
    if (sid != null) out.get(sid)?.push(b)
  }
  return out
}

// ------------------------------------------------------------------ escritura

/** Crea las filas del sitio (inicio + sección clásica con los bloques actuales) si aún no existen */
export function ensureSite(db: DB, linkId: number, now: number): Site {
  const cur = loadSite(db, linkId)
  if (cur.materialized) return cur
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO ms_sites (link_id, data, updated_at) VALUES (?, ?, ?)').run(linkId, JSON.stringify(cur.config), now)
    const pid = Number(db.prepare("INSERT INTO ms_pages (link_id, slug, title, position, is_enabled, data, created_at, updated_at) VALUES (?, '', '', 0, 1, '{}', ?, ?)").run(linkId, now, now).lastInsertRowid)
    const sid = Number(db.prepare('INSERT INTO ms_sections (page_id, position, is_enabled, data, created_at, updated_at) VALUES (?, 0, 1, ?, ?, ?)').run(pid, JSON.stringify(CLASSIC_SECTION), now, now).lastInsertRowid)
    db.prepare('UPDATE bio_blocks SET section_id = ? WHERE link_id = ? AND section_id IS NULL').run(sid, linkId)
  })()
  return loadSite(db, linkId)
}

export function saveSiteConfig(db: DB, linkId: number, config: SiteConfig, now: number): void {
  db.prepare('INSERT INTO ms_sites (link_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(link_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(linkId, JSON.stringify(config), now)
}

export type PageInput = { slug: string; title: string; is_enabled: boolean; data: PageData }

export function createPage(db: DB, linkId: number, p: PageInput, now: number): MsPage | 'limit' | 'taken' {
  const n = db.prepare('SELECT COUNT(*) FROM ms_pages WHERE link_id = ?').pluck().get(linkId) as number
  if (n >= MS_MAX_PAGES) return 'limit'
  if (db.prepare('SELECT 1 FROM ms_pages WHERE link_id = ? AND slug = ?').get(linkId, p.slug)) return 'taken'
  const pos = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM ms_pages WHERE link_id = ?').pluck().get(linkId) as number) ?? 0
  const id = Number(db.prepare('INSERT INTO ms_pages (link_id, slug, title, position, is_enabled, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(linkId, p.slug, p.title, pos, p.is_enabled ? 1 : 0, JSON.stringify(p.data), now, now).lastInsertRowid)
  // toda página nace con una sección para poder poner bloques de inmediato
  db.prepare('INSERT INTO ms_sections (page_id, position, is_enabled, data, created_at, updated_at) VALUES (?, 0, 1, ?, ?, ?)').run(id, JSON.stringify(sectionDataSchema.parse({})), now, now)
  return getPage(db, id) as MsPage
}

export function getPage(db: DB, id: number): MsPage | undefined {
  const r = db.prepare('SELECT * FROM ms_pages WHERE id = ?').get(id) as PageRaw | undefined
  return r ? hydratePage(r) : undefined
}

/** Página sólo si su sitio es del usuario */
export function getOwnPage(db: DB, id: number, userId: number): MsPage | undefined {
  const r = db.prepare('SELECT p.* FROM ms_pages p JOIN links l ON l.id = p.link_id WHERE p.id = ? AND l.user_id = ?').get(id, userId) as PageRaw | undefined
  return r ? hydratePage(r) : undefined
}

/** La página de inicio conserva su slug vacío; las demás pueden cambiarlo si no choca */
export function updatePage(db: DB, id: number, p: PageInput, now: number): 'ok' | 'taken' {
  const cur = getPage(db, id)
  if (!cur) return 'ok'
  const slug = cur.slug === '' ? '' : p.slug
  if (slug !== cur.slug && db.prepare('SELECT 1 FROM ms_pages WHERE link_id = ? AND slug = ? AND id <> ?').get(cur.link_id, slug, id)) return 'taken'
  db.prepare('UPDATE ms_pages SET slug = ?, title = ?, is_enabled = ?, data = ?, updated_at = ? WHERE id = ?').run(slug, p.title, cur.slug === '' ? 1 : p.is_enabled ? 1 : 0, JSON.stringify(p.data), now, id)
  return 'ok'
}

/** Borra una página (nunca la de inicio) con sus secciones y bloques */
export function deletePage(db: DB, id: number): boolean {
  const cur = getPage(db, id)
  if (!cur || cur.slug === '') return false
  db.transaction(() => {
    db.prepare('DELETE FROM bio_blocks WHERE section_id IN (SELECT id FROM ms_sections WHERE page_id = ?)').run(id)
    db.prepare('DELETE FROM ms_pages WHERE id = ?').run(id)
  })()
  return true
}

function swapPosition(db: DB, table: 'ms_pages' | 'ms_sections', scopeCol: 'link_id' | 'page_id', scope: number, id: number, dir: -1 | 1): void {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE ${scopeCol} = ? ORDER BY position, id`).pluck().all(scope) as number[]
  const i = rows.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= rows.length) return
  ;[rows[i], rows[j]] = [rows[j] as number, rows[i] as number]
  const upd = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`)
  db.transaction(() => rows.forEach((rid, k) => upd.run(k, rid)))()
}

export function movePage(db: DB, id: number, dir: -1 | 1): void {
  const p = getPage(db, id)
  if (p) swapPosition(db, 'ms_pages', 'link_id', p.link_id, id, dir)
}

export function getSection(db: DB, id: number): MsSection | undefined {
  const r = db.prepare('SELECT * FROM ms_sections WHERE id = ?').get(id) as SectionRaw | undefined
  return r ? hydrateSection(r) : undefined
}

export function getOwnSection(db: DB, id: number, userId: number): (MsSection & { link_id: number }) | undefined {
  const r = db
    .prepare('SELECT s.*, p.link_id AS link_id FROM ms_sections s JOIN ms_pages p ON p.id = s.page_id JOIN links l ON l.id = p.link_id WHERE s.id = ? AND l.user_id = ?')
    .get(id, userId) as (SectionRaw & { link_id: number }) | undefined
  return r ? { ...hydrateSection(r), link_id: r.link_id } : undefined
}

/** ¿La sección pertenece a un sitio de este enlace? */
export function sectionInLink(db: DB, sectionId: number, linkId: number): boolean {
  return !!db.prepare('SELECT 1 FROM ms_sections s JOIN ms_pages p ON p.id = s.page_id WHERE s.id = ? AND p.link_id = ?').get(sectionId, linkId)
}

export function createSection(db: DB, pageId: number, data: SectionData, now: number): MsSection | 'limit' {
  const n = db.prepare('SELECT COUNT(*) FROM ms_sections WHERE page_id = ?').pluck().get(pageId) as number
  if (n >= MS_MAX_SECTIONS) return 'limit'
  const pos = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM ms_sections WHERE page_id = ?').pluck().get(pageId) as number) ?? 0
  const id = Number(db.prepare('INSERT INTO ms_sections (page_id, position, is_enabled, data, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)').run(pageId, pos, JSON.stringify(data), now, now).lastInsertRowid)
  return getSection(db, id) as MsSection
}

export function updateSection(db: DB, id: number, data: SectionData, enabled: boolean, now: number): void {
  db.prepare('UPDATE ms_sections SET data = ?, is_enabled = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(data), enabled ? 1 : 0, now, id)
}

/** Borra la sección y sus bloques; una página siempre conserva al menos una sección */
export function deleteSection(db: DB, id: number): boolean {
  const s = getSection(db, id)
  if (!s) return false
  const n = db.prepare('SELECT COUNT(*) FROM ms_sections WHERE page_id = ?').pluck().get(s.page_id) as number
  if (n <= 1) return false
  db.transaction(() => {
    db.prepare('DELETE FROM bio_blocks WHERE section_id = ?').run(id)
    db.prepare('DELETE FROM ms_sections WHERE id = ?').run(id)
  })()
  return true
}

export function moveSection(db: DB, id: number, dir: -1 | 1): void {
  const s = getSection(db, id)
  if (s) swapPosition(db, 'ms_sections', 'page_id', s.page_id, id, dir)
}

/** Copia el sitio completo (ajustes, páginas, secciones y bloques) a otro enlace; devuelve false si no hay sitio materializado */
export function copySite(db: DB, fromLinkId: number, toLinkId: number, now: number): boolean {
  const site = loadSite(db, fromLinkId)
  if (!site.materialized) return false
  db.transaction(() => {
    saveSiteConfig(db, toLinkId, site.config, now)
    const sectionMap = new Map<number, number>()
    for (const p of site.pages) {
      const pid = Number(db.prepare('INSERT INTO ms_pages (link_id, slug, title, position, is_enabled, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(toLinkId, p.slug, p.title, p.position, p.is_enabled, JSON.stringify(p.data), now, now).lastInsertRowid)
      for (const s of sectionsOf(site, p.id)) {
        sectionMap.set(s.id, Number(db.prepare('INSERT INTO ms_sections (page_id, position, is_enabled, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(pid, s.position, s.is_enabled, JSON.stringify(s.data), now, now).lastInsertRowid))
      }
    }
    const first = [...sectionMap.values()][0]
    const rows = db.prepare('SELECT type, position, is_enabled, starts_at, ends_at, data, style, section_id FROM bio_blocks WHERE link_id = ? ORDER BY position, id').all(fromLinkId) as {
      type: string; position: number; is_enabled: number; starts_at: number | null; ends_at: number | null; data: string; style: string; section_id: number | null
    }[]
    const ins = db.prepare('INSERT INTO bio_blocks (link_id, type, position, is_enabled, starts_at, ends_at, data, style, section_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const b of rows) ins.run(toLinkId, b.type, b.position, b.is_enabled, b.starts_at, b.ends_at, b.data, b.style, (b.section_id != null ? sectionMap.get(b.section_id) : undefined) ?? first ?? null, now, now)
  })()
  return true
}

/** Llaves de imágenes que usa el sitio (logo, fondos, SEO de páginas) para no tratarlas como huérfanas */
export function siteImageKeys(db: DB, userId: number): Set<string> {
  const keys = new Set<string>()
  const add = (v: unknown) => {
    if (typeof v === 'string' && /^[\w-]+\.webp$/.test(v)) keys.add(v)
  }
  for (const d of db.prepare('SELECT s.data FROM ms_sites s JOIN links l ON l.id = s.link_id WHERE l.user_id = ?').pluck().all(userId) as string[]) add((readSite(parse(d)).cabecera as { logo: string | null }).logo)
  for (const d of db.prepare('SELECT p.data FROM ms_pages p JOIN links l ON l.id = p.link_id WHERE l.user_id = ?').pluck().all(userId) as string[]) add(readPageData(parse(d)).seo_image)
  for (const d of db.prepare('SELECT s.data FROM ms_sections s JOIN ms_pages p ON p.id = s.page_id JOIN links l ON l.id = p.link_id WHERE l.user_id = ?').pluck().all(userId) as string[]) add(readSectionData(parse(d)).imagen)
  return keys
}
