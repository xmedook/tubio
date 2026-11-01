// npm run ejemplos [-- --rehacer] [--whatsapp 521…] — crea (o rehace) los 6 sitios de ejemplo del home: /ejemplo-restaurante, /ejemplo-belleza…
// Corre también en producción: son contenido público de tubio, a nombre de una cuenta interna sin acceso (sin contraseña usable).
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadConfig } from '../config.ts'
import { migrate, openDb } from '../db/index.ts'
import { hashPassword, randomToken } from '../lib/crypto.ts'
import { defaultBioData } from '../modules/bio/design.ts'
import { createLink, deleteLink, findByAlias } from '../modules/links/repo.ts'
import { applyGiro, GIROS, GIRO_META } from '../modules/minisitio/giros.ts'
import { getSetting } from '../modules/settings/repo.ts'
import { createUser, findUserByEmail, updateUser } from '../modules/users/repo.ts'

const EMAIL = 'ejemplos@tubio.link'
const FOTOS = join(import.meta.dirname, '..', 'content', 'ejemplos')

/** Sube (una sola vez por contenido) las fotos de un ejemplo a la cuenta interna y devuelve archivo → llave y texto alternativo */
function subirFotos(userId: number, giro: string): Record<string, { key: string; alt: string }> {
  const alts = (JSON.parse(readFileSync(join(FOTOS, 'fotos.json'), 'utf8')) as { fotos: Record<string, { alt: { es: string } }> }).fotos
  const out: Record<string, { key: string; alt: string }> = {}
  let files: string[] = []
  try { files = readdirSync(join(FOTOS, 'fotos', giro)) } catch { return out }
  for (const f of files.filter((x) => x.endsWith('.webp'))) {
    const buf = readFileSync(join(FOTOS, 'fotos', giro, f))
    const sha = createHash('sha256').update(buf).digest('hex')
    let key = db.prepare('SELECT key FROM files WHERE user_id = ? AND sha256 = ?').pluck().get(userId, sha) as string | undefined
    if (!key) {
      key = `${randomToken(18)}.webp` // las imágenes se guardan como <token>.webp (el esquema de secciones lo exige)
      const dest = join(config.dataDir, 'uploads', key.slice(0, 2), key)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, buf)
      db.prepare('INSERT INTO files (user_id, key, kind, original_name, mime, size, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(userId, key, 'image', f, 'image/webp', buf.length, sha, now)
    }
    out[`${giro}/${f}`] = { key, alt: alts[`${giro}/${f}`]?.alt.es ?? '' }
  }
  return out
}
const config = loadConfig()
const db = openDb(config.dbPath)
migrate(db)
const now = Date.now()
const redo = process.argv.includes('--rehacer')
// los botones de WhatsApp de los ejemplos llegan al WhatsApp de ventas de tubio (ajuste de admin) o al número que se pase
const wi = process.argv.indexOf('--whatsapp')
const whatsapp = ((wi > 0 ? process.argv[wi + 1] : '') || getSetting(db, 'sales_whatsapp') || '').replace(/\D/g, '')
let owner = findUserByEmail(db, EMAIL)
if (!owner) {
  owner = createUser(db, { email: EMAIL, name: 'túbio · ejemplos', passwordHash: await hashPassword(randomToken(24)) }, now)
  updateUser(db, owner.id, { email_verified_at: now })
}
for (const g of GIROS) {
  const m = GIRO_META[g]
  const cur = findByAlias(db, m.example)
  if (cur && !redo) {
    console.log(`ya existe /${m.example}`)
    continue
  }
  if (cur) {
    if (cur.user_id !== owner.id) throw new Error(`/${m.example} es de otra cuenta; no se toca`)
    deleteLink(db, cur.id)
  }
  db.transaction(() => {
    const link = createLink(db, owner!.id, {
      project_id: null, alias: m.example, kind: 'bio', title: m.exampleName, target_url: null, redirect_code: 302,
      data: { ...defaultBioData(m.exampleName, '', m.theme), seo_title: `${m.exampleName} · ejemplo de sitio túbio`, category: m.category, noindex: true },
      is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false,
    }, now)
    applyGiro(db, link.id, g, { name: m.exampleName, whatsapp, address: 'Calle de los Ejemplos 123, Colima, Col.', example: true, fotos: subirFotos(owner!.id, g) }, now)
  })()
  console.log(`listo: /${m.example}`)
}
db.close()
