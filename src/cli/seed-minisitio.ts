// npm run seed-ms [alias] — minisitio de ejemplo (clínica ficticia) en la cuenta demo; sólo desarrollo
import { loadConfig } from '../config.ts'
import { migrate, openDb } from '../db/index.ts'
import { defaultBioData } from '../modules/bio/design.ts'
import { createBlock } from '../modules/bio/repo.ts'
import { createLink, findByAlias } from '../modules/links/repo.ts'
import { createPage, createSection, ensureSite, loadSite, saveSiteConfig, sectionsOf, updateSection } from '../modules/minisitio/repo.ts'
import { readSectionData, readSite } from '../modules/minisitio/schema.ts'
import { findUserByEmail } from '../modules/users/repo.ts'

const config = loadConfig()
if (config.env === 'production') throw new Error('seed-ms no corre en producción')
const db = openDb(config.dbPath)
migrate(db)
const user = findUserByEmail(db, 'demo@tubio.local')
if (!user) throw new Error('falta la cuenta demo: corre npm run seed-demo')
const alias = process.argv[2] ?? 'demo-ms'
if (findByAlias(db, alias)) {
  console.log(`ya existe /${alias}`)
  process.exit(0)
}
const now = Date.now()
const link = createLink(db, user.id, {
  project_id: null, alias, kind: 'bio', title: 'Clínica Sol', target_url: null, redirect_code: 302,
  data: { ...defaultBioData('Clínica Sol · medicina familiar', '', 'papel'), seo_description: 'Medicina familiar en Colima (ejemplo)' },
  is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false,
}, now)
const blk = (type: string, data: Record<string, unknown>, sectionId: number) => createBlock(db, link.id, { type, is_enabled: true, starts_at: null, ends_at: null, data, style: {} }, now, sectionId)

const site = ensureSite(db, link.id, now)
const home = site.pages[0]!
const s1 = site.sections[0]!
updateSection(db, s1.id, readSectionData({ ancla: 'inicio', antetitulo: 'Medicina familiar · Colima', titulo: 'Cuidamos de ti y de tu familia', subtitulo: 'Consulta general, pediatría y seguimiento. Agenda en minutos por WhatsApp.', fondo: 'degradado', color: '#14434f', color2: '#2c6e7b', angulo: 160, alto: 'media', ancho: 'normal' }), true, now)
blk('link', { label: 'Agendar mi cita', url: 'https://wa.me/5213121234567', subtitle: 'Respondemos en horario de consulta' }, s1.id)

const s2 = createSection(db, home.id, readSectionData({ ancla: 'servicios', antetitulo: 'Qué hacemos', titulo: 'Servicios', ancho: 'normal', columnas: 2 }), now)
const s3 = createSection(db, home.id, readSectionData({ ancla: 'ubicacion', antetitulo: 'Visítanos', titulo: 'Dónde estamos', fondo: 'color', color: '#e3ebe9', ancho: 'angosto' }), now)
if (typeof s2 === 'string' || typeof s3 === 'string') throw new Error('límite')
for (const [t, d] of [['Consulta general', 'Revisión completa y plan de seguimiento.'], ['Pediatría', 'Control del niño sano y vacunación.'], ['Laboratorio', 'Estudios básicos con resultados en el día.'], ['Nutrición', 'Plan alimenticio a tu medida.']] as const) {
  blk('heading', { text: t, level: 'h3' }, s2.id)
  blk('paragraph', { text: d }, s2.id)
}
blk('paragraph', { text: 'Av. de los Ejemplos 123, Col. Centro, Colima.\nLunes a viernes 9:00–19:00 · Sábado 9:00–14:00' }, s3.id)

const pg = createPage(db, link.id, { slug: 'servicios', title: 'Servicios', is_enabled: true, data: { seo_title: 'Servicios · Clínica Sol', seo_description: 'Consulta general, pediatría, laboratorio y nutrición.', seo_image: null } }, now)
if (typeof pg === 'string') throw new Error(pg)
const ps = sectionsOf(loadSite(db, link.id), pg.id)[0]!
updateSection(db, ps.id, readSectionData({ ancla: 'lista', titulo: 'Todos los servicios', ancho: 'normal' }), true, now)
blk('paragraph', { text: 'Página de ejemplo dentro del mismo sitio.' }, ps.id)

saveSiteConfig(
  db,
  link.id,
  readSite({
    whatsapp: '5213121234567',
    cabecera: { activa: true, nombre: 'Clínica Sol', nav: 'auto', cta: { texto: 'Agendar', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero agendar una cita' } },
    barra: { activa: true, acciones: [{ texto: 'Agendar cita', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero agendar una cita' }, { texto: 'Cómo llegar', tipo: 'ancla', destino: 'ubicacion', mensaje: '' }] },
    pie: { activo: true, servicios: 'Medicina familiar · Pediatría · Nutrición', direccion: 'Av. de los Ejemplos 123, Colima', texto: '' },
  }),
  now,
)
console.log(`listo: /${alias}  /${alias}/servicios`)
