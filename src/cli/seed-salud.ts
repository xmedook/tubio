// npm run seed-salud [alias] — sitio de ejemplo estilo «salud» (portada + confianza + categorías + perfil + videos + cita); sólo desarrollo
import sharp from 'sharp'
import { loadConfig } from '../config.ts'
import { migrate, openDb } from '../db/index.ts'
import { noGeo } from '../lib/geo.ts'
import { FileMailer } from '../lib/mail.ts'
import { storeImage } from '../lib/uploads.ts'
import { defaultBioData } from '../modules/bio/design.ts'
import { createBlock } from '../modules/bio/repo.ts'
import { createLink, findByAlias } from '../modules/links/repo.ts'
import { createPage, createSection, ensureSite, loadSite, saveSiteConfig, sectionsOf, updateSection } from '../modules/minisitio/repo.ts'
import { readSectionData, readSite } from '../modules/minisitio/schema.ts'
import { findUserByEmail } from '../modules/users/repo.ts'

const config = loadConfig()
if (config.env === 'production') throw new Error('seed-salud no corre en producción')
const db = openDb(config.dbPath)
migrate(db)
const deps = { config, db, mailer: new FileMailer('/dev/null', ''), geo: noGeo, now: () => Date.now() }
const user = findUserByEmail(db, 'demo@tubio.local')
if (!user) throw new Error('falta la cuenta demo: corre npm run seed-demo')
const alias = process.argv[2] ?? 'demo-salud'
if (findByAlias(db, alias)) {
  console.log(`ya existe /${alias}`)
  process.exit(0)
}
const now = Date.now()
const link = createLink(db, user.id, {
  project_id: null, alias, kind: 'bio', title: 'Dra. Elena Ruvalcaba', target_url: null, redirect_code: 302,
  data: { ...defaultBioData('Dra. Elena Ruvalcaba · cirugía plástica', '', 'papel'), seo_description: 'Cirugía plástica en Colima (ejemplo)' },
  is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false,
}, now)
const img = async (c1: string, c2: string, w = 800, h = 800) =>
  (await storeImage(deps, user.id, await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.3}" r="${h * 0.22}" fill="#fff" opacity=".18"/></svg>`)).png().toBuffer(), 'x.png', { maxDim: 1200 })).key
const site = ensureSite(db, link.id, now)
const home = site.pages[0]!
const s1 = site.sections[0]!
updateSection(db, s1.id, readSectionData({ ancla: 'inicio', relleno: 'ninguno' }), true, now)
const blk = (type: string, data: Record<string, unknown>, sid: number) => createBlock(db, link.id, { type, is_enabled: true, starts_at: null, ends_at: null, data, style: {} }, now, sid)
blk('hero', { foto: await img('#14434f', '#5b8a96', 1600, 1600), antetitulo: 'Cirugía plástica · Colima', titulo: 'Resultados naturales, con respaldo médico', subtitulo: 'Valoración personalizada y acompañamiento en cada paso.', alineacion: 'abajo', alto: 'media', oscurecer: 40, sonido: false, logo: null, video: null }, s1.id)
const mk = (data: Record<string, unknown>) => createSection(db, home.id, readSectionData(data), now) as { id: number }
const sTrust = mk({ ancho: 'normal' })
blk('wa_request', { preset: 'cita', boton: 'Agendar valoración', guardar_copia: true }, sTrust.id)
blk('trust_line', { items: [{ texto: 'Consulta en Colima' }, { texto: 'Certificación CMCPER 2278' }, { texto: 'Valoración sin compromiso' }] }, sTrust.id)
const sCat = mk({ ancla: 'opciones', antetitulo: 'Tratamientos', titulo: 'Conoce tus opciones', ancho: 'ancho' })
blk('category_grid', { titulo: '', items: [
  { foto: await img('#8a5a35', '#d9a066'), titulo: 'Rostro', sub_items: 'Rinoplastia, Blefaroplastia, Lifting', enlace: 'rostro', texto_enlace: 'Ver procedimientos' },
  { foto: await img('#2c6e7b', '#9ec7cf'), titulo: 'Cuerpo', sub_items: 'Abdominoplastia, Liposucción', enlace: '#contacto', texto_enlace: 'Agendar' },
  { foto: await img('#6d3b4a', '#d99aa8'), titulo: 'Mama', sub_items: 'Aumento, Reducción, Reconstrucción', enlace: '#contacto' },
] }, sCat.id)
const sPerfil = mk({ ancla: 'doctora', fondo: 'color', color: '#e3ebe9', ancho: 'normal', antetitulo: 'Tu cirujana', titulo: '' })
blk('profile', { foto: await img('#13313a', '#4c616a', 480, 600), nombre: 'Dra. Elena Ruvalcaba', especialidad: 'Cirugía plástica, estética y reconstructiva', bio: 'Más de **15 años** de práctica clínica. Cada plan se diseña contigo, con expectativas claras y seguimiento cercano.', credenciales: [
  { etiqueta: 'Formación médica', valor: 'Universidad Nacional', nota: 'Cédula 1234567' }, { etiqueta: 'Especialidad', valor: 'Cirugía plástica', nota: 'Cédula 7654321' }, { etiqueta: 'Certificación', valor: 'CMCPER 2278' }, { etiqueta: 'Consulta', valor: 'Colima, Col.' },
], enlace_verificacion: 'https://cedulaprofesional.sep.gob.mx/', texto_verificacion: 'Verificar cédula en la SEP' }, sPerfil.id)
const sVid = mk({ ancla: 'videos', antetitulo: 'En su voz', titulo: 'Videos', ancho: 'ancho' })
blk('video_carousel', { titulo: '', items: [
  { video: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', foto: await img('#14434f', '#2c6e7b', 600, 1067), titulo: 'Qué esperar de tu valoración', categoria: 'Consulta', cta_texto: 'Agendar', cta_enlace: '#contacto' },
  { video: 'https://www.youtube.com/shorts/aqz-KE-bpKQ', foto: await img('#6d3b4a', '#d99aa8', 600, 1067), titulo: 'Recuperación paso a paso', categoria: 'Cuerpo' },
  { video: 'https://vimeo.com/76979871', foto: await img('#8a5a35', '#d9a066', 600, 1067), titulo: 'Conoce la clínica', categoria: 'Clínica' },
] }, sVid.id)
const sCont = mk({ ancla: 'contacto', antetitulo: 'Hablemos de ti', titulo: 'Agenda tu valoración', ancho: 'angosto' })
blk('wa_request', { preset: 'cita', boton: 'Agendar por WhatsApp', guardar_copia: true }, sCont.id)
blk('location', { nombre_lugar: 'Consultorio', direccion: 'Av. de los Ejemplos 123, Colima', lat: 19.2433, lng: -103.725, timezone: 'America/Mexico_City', horario: ['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => ({ day: d, open: '10:00', close: '18:00' })) }, sCont.id)
const pg = createPage(db, link.id, { slug: 'rostro', title: 'Rostro', is_enabled: true, data: { seo_title: 'Procedimientos de rostro · Dra. Elena', seo_description: 'Rinoplastia, blefaroplastia y lifting.', seo_image: null } }, now)
if (typeof pg === 'string') throw new Error(pg)
const ps = sectionsOf(loadSite(db, link.id), pg.id)[0]!
updateSection(db, ps.id, readSectionData({ titulo: 'Procedimientos de rostro', ancho: 'normal' }), true, now)
blk('photo_cards', { items: [
  { foto: await img('#8a5a35', '#d9a066', 900, 700), antetitulo: 'Nariz', titulo: 'Rinoplastia', enlace: '#contacto' },
  { foto: await img('#2c6e7b', '#9ec7cf', 900, 700), antetitulo: 'Párpados', titulo: 'Blefaroplastia', enlace: '#contacto' },
] }, ps.id)
saveSiteConfig(db, link.id, readSite({
  whatsapp: '5213121234567',
  cabecera: { activa: true, nombre: 'Dra. Elena Ruvalcaba', nav: 'auto', cta: { texto: 'Agendar', tipo: 'ancla', destino: 'contacto', mensaje: '' } },
  barra: { activa: true, acciones: [{ texto: 'Agendar valoración', tipo: 'ancla', destino: 'contacto', mensaje: '' }, { texto: 'WhatsApp', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quisiera una valoración' }] },
  pie: { activo: true, servicios: 'Cirugía plástica · Estética · Reconstructiva', direccion: 'Colima, Col.', texto: '' },
}), now)
console.log(`listo: /${alias}  /${alias}/rostro`)
