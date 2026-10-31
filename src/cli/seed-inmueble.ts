// npm run seed-inmueble — dos sitios de ejemplo: inmobiliaria (/demo-inmob) y gimnasio (/demo-gym); sólo desarrollo
import sharp from 'sharp'
import { loadConfig } from '../config.ts'
import { migrate, openDb } from '../db/index.ts'
import { noGeo } from '../lib/geo.ts'
import { FileMailer } from '../lib/mail.ts'
import { storeImage } from '../lib/uploads.ts'
import { defaultBioData } from '../modules/bio/design.ts'
import { createBlock } from '../modules/bio/repo.ts'
import { createLink, findByAlias } from '../modules/links/repo.ts'
import { createSection, ensureSite, saveSiteConfig, updateSection } from '../modules/minisitio/repo.ts'
import { readSectionData, readSite } from '../modules/minisitio/schema.ts'
import { findUserByEmail } from '../modules/users/repo.ts'

const config = loadConfig()
if (config.env === 'production') throw new Error('seed-inmueble no corre en producción')
const db = openDb(config.dbPath)
migrate(db)
const deps = { config, db, mailer: new FileMailer('/dev/null', ''), geo: noGeo, now: () => Date.now() }
const user = findUserByEmail(db, 'demo@tubio.local')
if (!user) throw new Error('falta la cuenta demo: corre npm run seed-demo')
const now = Date.now()
const img = async (c1: string, c2: string, w = 1200, h = 900) =>
  (await storeImage(deps, user.id, await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="${w * 0.2}" y="${h * 0.35}" width="${w * 0.6}" height="${h * 0.45}" fill="#fff" opacity=".16"/><rect x="${w * 0.4}" y="${h * 0.55}" width="${w * 0.14}" height="${h * 0.25}" fill="#000" opacity=".22"/></svg>`)).png().toBuffer(), 'x.png', { maxDim: 1400 })).key

async function site(alias: string, title: string, theme: string, build: (sid: number, mk: (d: Record<string, unknown>) => number, blk: (t: string, d: Record<string, unknown>, sid: number) => void) => Promise<void>) {
  if (findByAlias(db, alias)) return console.log(`ya existe /${alias}`)
  const link = createLink(db, user!.id, {
    project_id: null, alias, kind: 'bio', title, target_url: null, redirect_code: 302,
    data: { ...defaultBioData(title, '', theme) },
    is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false,
  }, now)
  const st = ensureSite(db, link.id, now)
  const s1 = st.sections[0]!
  updateSection(db, s1.id, readSectionData({ ancla: 'inicio', antetitulo: title, titulo: alias === 'demo-gym' ? 'Entrena a tu ritmo' : 'Encuentra tu próximo hogar', ancho: 'normal' }), true, now)
  const mk = (d: Record<string, unknown>) => (createSection(db, st.pages[0]!.id, readSectionData(d), now) as { id: number }).id
  const blk = (type: string, data: Record<string, unknown>, sid: number) => void createBlock(db, link.id, { type, is_enabled: true, starts_at: null, ends_at: null, data, style: {} }, now, sid)
  await build(s1.id, mk, blk)
  saveSiteConfig(db, link.id, readSite({ whatsapp: '5213121234567', cabecera: { activa: true, nombre: title, nav: 'auto', cta: { texto: 'WhatsApp', tipo: 'whatsapp', destino: '', mensaje: '' } }, barra: { activa: true, acciones: [{ texto: alias === 'demo-gym' ? 'Clase muestra' : 'Pedir visita', tipo: 'ancla', destino: 'lista', mensaje: '' }] }, pie: { activo: true, servicios: title, direccion: 'Colima, Col.', texto: '' } }), now)
  console.log(`listo: /${alias}`)
}

await site('demo-inmob', 'Inmobiliaria Sol', 'papel', async (s1, mk, blk) => {
  const sid = mk({ ancla: 'lista', antetitulo: 'Disponibles', titulo: 'Propiedades', ancho: 'ancho' })
  blk('listings', { titulo: '', items: [
    { titulo: 'Casa en Villa Real', operacion: 'venta', tipo: 'casa', precio: '$3,500,000', recamaras: 3, banos: 2, m2: 180, colonia: 'Villa Real', estado: 'disponible', descripcion: 'Jardín, cochera para 2 autos y cocina integral.', foto: await img('#8a5a35', '#d9a066'), foto2: await img('#2c6e7b', '#9ec7cf'), foto3: await img('#6d3b4a', '#d99aa8') },
    { titulo: 'Depto en el centro', operacion: 'renta', tipo: 'departamento', precio: '$12,000/mes', recamaras: 2, banos: 1, m2: 75, colonia: 'Centro', estado: 'apartada', descripcion: 'A dos cuadras del jardín principal.', foto: await img('#13313a', '#4c616a') },
    { titulo: 'Casa con alberca', operacion: 'venta', tipo: 'casa', precio: '$5,200,000', recamaras: 4, banos: 3, m2: 260, colonia: 'Las Palmas', estado: 'disponible', foto: await img('#14434f', '#5b8a96') },
    { titulo: 'Terreno campestre', operacion: 'venta', tipo: 'terreno', precio: '$900,000', m2: 1000, colonia: 'Los Olivos', estado: 'vendida', foto: await img('#5b6b3a', '#b7c58a') },
  ] }, sid)
  blk('wa_request', { preset: 'visita', boton: 'Solicitar visita', guardar_copia: true }, sid)
})
await site('demo-gym', 'Estudio Pulso', 'tinta', async (s1, mk, blk) => {
  const sp = mk({ ancla: 'programas', antetitulo: 'Elige tu camino', titulo: 'Programas', ancho: 'ancho' })
  blk('programs', { titulo: '', items: [
    { nombre: 'Fuerza 12 semanas', descripcion: 'Rutina progresiva con acompañamiento.', nivel: 'principiante', duracion: '12 semanas', precio: '$1,200/mes', foto: await img('#13313a', '#2c6e7b', 960, 640) },
    { nombre: 'HIIT express', descripcion: '30 minutos de alta intensidad.', nivel: 'intermedio', duracion: '30 min', precio: '$900/mes', foto: await img('#6d3b4a', '#d99aa8', 960, 640) },
  ] }, sp)
  const sh = mk({ ancla: 'lista', antetitulo: 'Esta semana', titulo: 'Horario de clases', ancho: 'ancho' })
  const c = (nombre: string, dia: string, inicio: string, fin: string, instructor = '', cupo: number | null = null) => ({ nombre, dia, inicio, fin, instructor, cupo })
  blk('class_schedule', { titulo: '', items: [c('Spinning', 'mon', '07:00', '07:45', 'Luis', 15), c('Yoga', 'mon', '18:00', '19:00', 'Ana', 12), c('HIIT', 'tue', '07:00', '07:30'), c('Fuerza', 'wed', '19:00', '20:00', 'Luis', 10), c('Yoga', 'thu', '18:00', '19:00', 'Ana', 12), c('Box', 'fri', '19:00', '20:00'), c('Movilidad', 'sat', '09:00', '10:00', 'Ana', 20)] }, sh)
  blk('wa_request', { preset: 'clase', boton: 'Reservar clase muestra', guardar_copia: true }, sh)
})
