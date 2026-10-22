// npm run seed-demo — cuenta demo@tubio.local / demo-demo-demo con una página bio de ejemplo (sólo desarrollo)
import sharp from 'sharp'
import { loadConfig } from '../config.ts'
import { migrate, openDb } from '../db/index.ts'
import { hashPassword } from '../lib/crypto.ts'
import { noGeo } from '../lib/geo.ts'
import { FileMailer } from '../lib/mail.ts'
import { storeImage } from '../lib/uploads.ts'
import { defaultBioData } from '../modules/bio/design.ts'
import { createBlock } from '../modules/bio/repo.ts'
import { createLink, findByAlias } from '../modules/links/repo.ts'
import { createUser, findUserByEmail, updateUser } from '../modules/users/repo.ts'

const config = loadConfig()
if (config.env === 'production') throw new Error('seed-demo no corre en producción')
const db = openDb(config.dbPath)
migrate(db)
const deps = { config, db, mailer: new FileMailer('/dev/null', ''), geo: noGeo, now: () => Date.now() }
const now = Date.now()
let user = findUserByEmail(db, 'demo@tubio.local')
if (!user) {
  user = createUser(db, { email: 'demo@tubio.local', passwordHash: await hashPassword('demo-demo-demo'), name: 'Ana Demo' }, now)
  updateUser(db, user.id, { email_verified_at: now, is_verified: 1 })
}
const alias = process.argv[2] ?? 'demo'
if (findByAlias(db, alias)) {
  console.log(`ya existe /${alias}`)
  process.exit(0)
}
const theme = process.argv[3] ?? 'nube'
const link = createLink(db, user.id, {
  project_id: null, alias, kind: 'bio', title: 'Ana Demo', target_url: null, redirect_code: 302,
  data: { ...defaultBioData('Ana Demo · diseño y fotografía', ''), theme, seo_description: 'Diseñadora y fotógrafa en CDMX' },
  is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false,
}, now)
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="160" r="70" fill="#fde68a"/><rect x="95" y="250" width="210" height="150" rx="100" fill="#fde68a"/></svg>`)
const avatar = await storeImage(deps, user.id, await sharp(svg).png().toBuffer(), 'avatar.png', { maxDim: 400, square: true })
const thumb = await storeImage(deps, user.id, await sharp(svg).resize(200).png().toBuffer(), 'thumb.png', { maxDim: 600 })
const blocks: [string, Record<string, unknown>][] = [
  ['avatar', { image: avatar.key, alt: 'Ana', size: 'lg', shape: 'circle' }],
  ['heading', { text: 'Ana Demo', level: 'h1' }],
  ['paragraph', { text: 'Diseño de marca y fotografía de producto.\nCDMX · trabajo remoto' }],
  ['socials', { links: { instagram: 'https://instagram.com/ana', tiktok: 'https://www.tiktok.com/@ana', youtube: 'https://youtube.com/@ana', whatsapp: 'https://wa.me/5215512345678', email: 'mailto:ana@example.com' }, colored: false, size: 'md' }],
  ['big_link', { label: 'Agenda una sesión', subtitle: 'Lugares para noviembre', url: 'https://example.com/agenda', effect: 'shine' }],
  ['link', { label: 'Portafolio 2026', url: 'https://example.com/portafolio', subtitle: '' }],
  ['image_link', { label: 'Tienda de impresiones', url: 'https://example.com/tienda', image: thumb.key, layout: 'thumb' }],
  ['link', { label: 'Curso de fotografía con celular', url: 'https://example.com/curso', subtitle: '' }],
  ['alert', { text: 'Envíos gratis en impresiones hasta el 30 de noviembre.', variant: 'success' }],
  ['divider', { style: 'dots' }],
  ['list', { items: 'Identidad de marca\nFotografía de producto\nDirección de arte', style: 'check' }],
  ['share', { label: 'Compartir mi página' }],
]
for (const [type, data] of blocks) createBlock(db, link.id, { type, is_enabled: true, starts_at: null, ends_at: null, data, style: {} }, now)
console.log(`listo: /${alias} (tema ${theme}) — entrar con demo@tubio.local / demo-demo-demo`)
