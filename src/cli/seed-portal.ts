// npm run seed-portal [alias] — minisitio de ejemplo tipo «portal» (portada + panel de acciones + ubicación); sólo desarrollo
import sharp from 'sharp'
import { loadConfig } from '../config.ts'
import { migrate, openDb } from '../db/index.ts'
import { noGeo } from '../lib/geo.ts'
import { FileMailer } from '../lib/mail.ts'
import { storeImage } from '../lib/uploads.ts'
import { defaultBioData } from '../modules/bio/design.ts'
import { createBlock } from '../modules/bio/repo.ts'
import { createLink, findByAlias } from '../modules/links/repo.ts'
import { createPage, ensureSite, loadSite, saveSiteConfig, sectionsOf, updateSection } from '../modules/minisitio/repo.ts'
import { readSectionData, readSite } from '../modules/minisitio/schema.ts'
import { findUserByEmail } from '../modules/users/repo.ts'

const config = loadConfig()
if (config.env === 'production') throw new Error('seed-portal no corre en producción')
const db = openDb(config.dbPath)
migrate(db)
const deps = { config, db, mailer: new FileMailer('/dev/null', ''), geo: noGeo, now: () => Date.now() }
const user = findUserByEmail(db, 'demo@tubio.local')
if (!user) throw new Error('falta la cuenta demo: corre npm run seed-demo')
const alias = process.argv[2] ?? 'demo-cafe'
if (findByAlias(db, alias)) {
  console.log(`ya existe /${alias}`)
  process.exit(0)
}
const now = Date.now()
const link = createLink(db, user.id, {
  project_id: null, alias, kind: 'bio', title: 'Café Tal', target_url: null, redirect_code: 302,
  data: { ...defaultBioData('Café Tal · café de especialidad', '', 'noche'), seo_description: 'Café de especialidad en Colima (ejemplo)' },
  is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false,
}, now)
// «foto» provisional generada: un degradado cálido con granos
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b2418"/><stop offset=".55" stop-color="#8a5a35"/><stop offset="1" stop-color="#d9a066"/></linearGradient></defs><rect width="1600" height="1600" fill="url(#g)"/><circle cx="1150" cy="420" r="260" fill="#f2c88f" opacity=".35"/><circle cx="420" cy="1050" r="380" fill="#1e120b" opacity=".35"/></svg>')
const foto = await storeImage(deps, user.id, await sharp(svg).png().toBuffer(), 'cafe.png', { maxDim: 1800 })
const blk = (type: string, data: Record<string, unknown>, sectionId: number) => createBlock(db, link.id, { type, is_enabled: true, starts_at: null, ends_at: null, data, style: {} }, now, sectionId)

const site = ensureSite(db, link.id, now)
const s1 = site.sections[0]!
updateSection(db, s1.id, readSectionData({ ancla: 'inicio', relleno: 'ninguno', ancho: 'normal' }), true, now)
blk('hero', { foto: foto.key, antetitulo: 'Café de especialidad · Colima', titulo: 'Tu café de todos los días', subtitulo: 'Tostado en casa, pan del día y buena plática.', alineacion: 'abajo', alto: 'completa', oscurecer: 50, sonido: false, logo: null, video: null }, s1.id)
const rows = [
  { etiqueta: 'Pedido por WhatsApp', titulo: 'Pedir ahora', subtitulo: 'Recoge en tienda o a domicilio', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero hacer un pedido', principal: 'si' },
  { etiqueta: 'A domicilio', titulo: 'Uber Eats', subtitulo: 'Abrir plataforma', tipo: 'enlace', destino: 'https://www.ubereats.com/mx', mensaje: '', principal: 'no' },
  { etiqueta: 'A domicilio', titulo: 'Rappi', subtitulo: 'Abrir plataforma', tipo: 'enlace', destino: 'https://www.rappi.com.mx', mensaje: '', principal: 'no' },
  { etiqueta: 'Menú', titulo: 'Ver menú', subtitulo: 'Bebidas y alimentos', tipo: 'pagina', destino: 'menu', mensaje: '', principal: 'no' },
  { etiqueta: 'Pedido por teléfono', titulo: 'Llamar', subtitulo: 'Efectivo, tarjeta o transferencia', tipo: 'llamar', destino: '5213121234567', mensaje: '', principal: 'no' },
]
const s2 = sectionsOf(loadSite(db, link.id), site.pages[0]!.id)
void s2
import('../modules/minisitio/repo.ts').then(async ({ createSection }) => {
  const a = createSection(db, site.pages[0]!.id, readSectionData({ ancla: 'acciones', ancho: 'angosto' }), now)
  const b = createSection(db, site.pages[0]!.id, readSectionData({ ancla: 'ubicacion', antetitulo: 'Visítanos', titulo: 'Dónde estamos', fondo: 'color', color: '#f1e7da', ancho: 'angosto' }), now)
  if (typeof a === 'string' || typeof b === 'string') throw new Error('límite')
  blk('action_panel', { disposicion: 'principal', acciones: rows }, a.id)
  blk('location', {
    nombre_lugar: 'Café Tal', direccion: 'Calle de los Ejemplos 45, Centro, Colima', lat: 19.2433, lng: -103.725, referencias: 'A media cuadra del jardín principal', estacionamiento: 'Sobre la calle', timezone: 'America/Mexico_City',
    horario: ['mon', 'tue', 'wed', 'thu', 'fri'].map((day) => ({ day, open: '07:30', close: '21:00' })).concat([{ day: 'sat', open: '08:00', close: '22:00' }, { day: 'sun', open: '08:00', close: '15:00' }]),
  }, b.id)
  const pg = createPage(db, link.id, { slug: 'menu', title: 'Menú', is_enabled: true, data: { seo_title: 'Menú · Café Tal', seo_description: 'Bebidas y alimentos', seo_image: null } }, now)
  if (typeof pg === 'string') throw new Error(pg)
  const ps = sectionsOf(loadSite(db, link.id), pg.id)[0]!
  updateSection(db, ps.id, readSectionData({ titulo: 'Menú', ancla: 'menu', ancho: 'angosto' }), true, now)
  blk('paragraph', { text: 'Espresso · $40\nAmericano · $45\nCapuchino · $60\nPan del día · $35' }, ps.id)
  saveSiteConfig(db, link.id, readSite({
    whatsapp: '5213121234567',
    cabecera: { activa: true, nombre: 'Café Tal', nav: 'manual', nav_manual: [{ texto: 'Pedir', tipo: 'ancla', destino: 'acciones' }, { texto: 'Menú', tipo: 'pagina', destino: 'menu' }, { texto: 'Ubicación', tipo: 'ancla', destino: 'ubicacion' }], cta: { texto: 'Pedir', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero hacer un pedido' } },
    barra: { activa: true, acciones: [{ texto: 'Pedir', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero hacer un pedido' }, { texto: 'Cómo llegar', tipo: 'ancla', destino: 'ubicacion', mensaje: '' }] },
    pie: { activo: true, servicios: 'Café · Pan · Desayunos', direccion: 'Calle de los Ejemplos 45, Colima', texto: '' },
  }), now)
  console.log(`listo: /${alias}  /${alias}/menu`)
})
