import type { DB } from '../../db/index.ts'
import { listBlocks } from '../bio/repo.ts'
import type { Site } from './repo.ts'

/**
 * Lo que le falta a un sitio para quedar listo (sobre todo los que arma la Varita, que no inventa datos):
 * WhatsApp, logo, una foto, precios y dirección. Cada pendiente lleva a donde se arregla.
 */
export type Todo = { key: 'whatsapp' | 'logo' | 'photo' | 'prices' | 'address'; done: boolean; href: string }

const hasImage = (v: unknown): boolean => {
  if (typeof v === 'string') return /^[\w-]+\.webp$/.test(v)
  if (Array.isArray(v)) return v.some(hasImage)
  if (v && typeof v === 'object') return Object.values(v).some(hasImage)
  return false
}

export function siteTodos(db: DB, linkId: number, site: Site): Todo[] {
  if (!site.materialized) return []
  const blocks = listBlocks(db, linkId).filter((b) => b.is_enabled)
  const first = site.sections[0]
  const priced = blocks.find((b) => b.type === 'menu' || b.type === 'services')
  const items = (priced?.data.items ?? []) as { precio?: string }[]
  const address = site.config.pie.direccion || blocks.some((b) => b.type === 'location')
  return [
    { key: 'whatsapp', done: !!site.config.whatsapp, href: '#whatsapp-field' },
    { key: 'logo', done: !!site.config.cabecera.logo, href: '#header-field' },
    { key: 'photo', done: site.sections.some((s) => s.data.fondo === 'imagen' && !!s.data.imagen) || blocks.some((b) => hasImage(b.data)), href: first ? `/panel/ms/sections/${first.id}` : '#' },
    ...(priced ? [{ key: 'prices' as const, done: items.length > 0 && items.every((i) => !!i.precio?.trim()), href: `/panel/blocks/${priced.id}` }] : []),
    { key: 'address', done: !!address, href: '#footer-field' },
  ]
}
