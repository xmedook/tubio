// npm run ejemplos [-- --rehacer] [--whatsapp 521…] — crea (o rehace) los 6 sitios de ejemplo del home: /ejemplo-restaurante, /ejemplo-belleza…
// Corre también en producción: son contenido público de tubio, a nombre de una cuenta interna sin acceso (sin contraseña usable).
import { loadConfig } from '../config.ts'
import { migrate, openDb } from '../db/index.ts'
import { hashPassword, randomToken } from '../lib/crypto.ts'
import { defaultBioData } from '../modules/bio/design.ts'
import { createLink, deleteLink, findByAlias } from '../modules/links/repo.ts'
import { applyGiro, GIROS, GIRO_META } from '../modules/minisitio/giros.ts'
import { getSetting } from '../modules/settings/repo.ts'
import { createUser, findUserByEmail, updateUser } from '../modules/users/repo.ts'

const EMAIL = 'ejemplos@tubio.link'
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
  owner = createUser(db, { email: EMAIL, name: 'tubio · ejemplos', passwordHash: await hashPassword(randomToken(24)) }, now)
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
      data: { ...defaultBioData(m.exampleName, '', m.theme), seo_title: `${m.exampleName} · ejemplo de sitio tubio`, category: m.category, noindex: true },
      is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false,
    }, now)
    applyGiro(db, link.id, g, { name: m.exampleName, whatsapp, address: 'Calle de los Ejemplos 123, Colima, Col.', example: true }, now)
  })()
  console.log(`listo: /${m.example}`)
}
db.close()
