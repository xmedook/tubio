// npm run seed-wa [alias] [preset] — agrega un bloque «Solicitud por WhatsApp» a un sitio de ejemplo; sólo desarrollo
import { loadConfig } from '../config.ts'
import { migrate, openDb } from '../db/index.ts'
import { createBlock } from '../modules/bio/repo.ts'
import { findByAlias } from '../modules/links/repo.ts'
import { loadSite, sectionsOf } from '../modules/minisitio/repo.ts'

const config = loadConfig()
if (config.env === 'production') throw new Error('seed-wa no corre en producción')
const db = openDb(config.dbPath)
migrate(db)
const alias = process.argv[2] ?? 'demo-ms'
const preset = process.argv[3] ?? 'cita'
const link = findByAlias(db, alias)
if (!link) throw new Error(`no existe /${alias}`)
const site = loadSite(db, link.id)
const sec = sectionsOf(site, site.pages[0]!.id)[0]
createBlock(db, link.id, { type: 'wa_request', is_enabled: true, starts_at: null, ends_at: null, data: { preset, guardar_copia: true }, style: {} }, Date.now(), sec?.id ?? null)
console.log(`listo: bloque ${preset} en /${alias}`)
