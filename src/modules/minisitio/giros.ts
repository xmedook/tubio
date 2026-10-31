import type { DB } from '../../db/index.ts'
import { createBlock } from '../bio/repo.ts'
import { createPage, createSection, ensureSite, loadSite, saveSiteConfig, sectionsOf, updateSection } from './repo.ts'
import { readSectionData, readSite, type Action, type SiteConfig } from './schema.ts'

/**
 * Plantillas de minisitio por giro (PLAN-HELLOLINK §3). Cada una arma un sitio completo —páginas, secciones y bloques—
 * con contenido de ejemplo propio y ficticio (sin fotos: fondos de color; el dueño sube las suyas). Lo que la persona
 * escribe en el asistente (nombre, WhatsApp, dirección, logo) reemplaza lo de ejemplo.
 */
export const GIROS = ['restaurante', 'belleza', 'salud', 'inmobiliaria', 'fitness', 'servicios'] as const
export type Giro = (typeof GIROS)[number]
export const isGiro = (v: unknown): v is Giro => typeof v === 'string' && (GIROS as readonly string[]).includes(v)

/** Datos fijos por giro: tema, categoría del directorio, ruta de su página pública y ejemplo vivo */
export const GIRO_META: Record<Giro, { theme: string; category: string; slug: string; example: string; exampleName: string; c1: string; c2: string }> = {
  restaurante: { theme: 'papel', category: 'food', slug: 'restaurantes', example: 'ejemplo-restaurante', exampleName: 'Fonda La Ceiba', c1: '#3b2418', c2: '#8a5a35' },
  belleza: { theme: 'chicle', category: 'business', slug: 'belleza', example: 'ejemplo-belleza', exampleName: 'Studio Lumbre', c1: '#5a2a3c', c2: '#b4637f' },
  salud: { theme: 'menta', category: 'health', slug: 'salud', example: 'ejemplo-salud', exampleName: 'Dra. Elena Ruvalcaba', c1: '#14434f', c2: '#2c6e7b' },
  inmobiliaria: { theme: 'papel', category: 'business', slug: 'inmobiliarias', example: 'ejemplo-inmobiliaria', exampleName: 'Inmobiliaria Sol', c1: '#1d3b2f', c2: '#4a7a5e' },
  fitness: { theme: 'tinta', category: 'business', slug: 'fitness', example: 'ejemplo-fitness', exampleName: 'Estudio Pulso', c1: '#161b2e', c2: '#3a4a8a' },
  servicios: { theme: 'terracota', category: 'business', slug: 'servicios-profesionales', example: 'ejemplo-servicios', exampleName: 'Plomería Mendoza', c1: '#4a2a14', c2: '#b4532a' },
}
export const giroBySlug = (slug: string): Giro | undefined => GIROS.find((g) => GIRO_META[g].slug === slug)

export type GiroVals = {
  name: string
  /** E.164 sin «+» (ya normalizado) o '' */
  whatsapp: string
  address: string
  logo?: string | null
  /** textos de la ficha de ejemplo: el ejemplo vivo usa esto para no llevar la dirección del dueño real */
  example?: boolean
}

const week = (open: string, close: string, sat?: [string, string], sun?: [string, string]) => [
  ...['mon', 'tue', 'wed', 'thu', 'fri'].map((day) => ({ day, open, close })),
  ...(sat ? [{ day: 'sat', open: sat[0], close: sat[1] }] : []),
  ...(sun ? [{ day: 'sun', open: sun[0], close: sun[1] }] : []),
]

type Ctx = {
  db: DB
  linkId: number
  now: number
  v: GiroVals
  meta: (typeof GIRO_META)[Giro]
  mk: (pageId: number, d: Record<string, unknown>) => number
  blk: (type: string, data: Record<string, unknown>, sectionId: number) => void
  page: (slug: string, title: string, desc: string) => number
}

/** Portada: sección con degradado, titular del negocio y el botón principal */
function portada(c: Ctx, sectionId: number, antetitulo: string, subtitulo: string): void {
  updateSection(c.db, sectionId, readSectionData({ ancla: 'inicio', antetitulo, titulo: c.v.name, subtitulo, fondo: 'degradado', color: c.meta.c1, color2: c.meta.c2, angulo: 160, alto: 'media', ancho: 'normal' }), true, c.now)
}

const BUILDERS: Record<Giro, (c: Ctx, home: number, first: number) => { nav: SiteConfig['cabecera']['nav_manual']; barra: Action[]; cta: Action; servicios: string }> = {
  restaurante(c, home, first) {
    portada(c, first, 'Cocina de casa', 'Pide por WhatsApp o reserva tu mesa. Sin vueltas.')
    const a = c.mk(home, { ancla: 'acciones', ancho: 'angosto' })
    c.blk('action_panel', {
      disposicion: 'principal',
      acciones: [
        { etiqueta: 'Pedido por WhatsApp', titulo: 'Pedir ahora', subtitulo: 'Recoge en el local o a domicilio', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero hacer un pedido', principal: 'si' },
        { etiqueta: 'Carta', titulo: 'Ver menú', subtitulo: 'Platillos, bebidas y postres', tipo: 'pagina', destino: 'menu', mensaje: '', principal: 'no' },
        ...(c.v.whatsapp ? [{ etiqueta: 'Teléfono', titulo: 'Llamar', subtitulo: 'Atendemos en horario de servicio', tipo: 'llamar', destino: c.v.whatsapp, mensaje: '', principal: 'no' }] : []),
      ],
    }, a)
    const r = c.mk(home, { ancla: 'reservar', antetitulo: 'Para ir a comer', titulo: 'Reserva tu mesa', ancho: 'angosto', fondo: 'color', color: '#f1e7da' })
    c.blk('wa_request', { preset: 'reservacion', guardar_copia: true }, r)
    const m = c.page('menu', 'Menú', 'Platillos, bebidas y postres')
    c.blk('menu', {
      titulo: '', moneda: '$', carrito: true,
      items: [
        { categoria: 'Para empezar', nombre: 'Sopa de la casa', descripcion: 'Cambia cada día', precio: '$70', etiquetas: '', disponible: 'si' },
        { categoria: 'Para empezar', nombre: 'Guacamole con totopos', descripcion: 'Hecho al momento', precio: '$95', etiquetas: 'vegano', disponible: 'si' },
        { categoria: 'Platos fuertes', nombre: 'Enchiladas verdes', descripcion: 'Pollo deshebrado, crema y queso', precio: '$140', etiquetas: 'favorito', disponible: 'si' },
        { categoria: 'Platos fuertes', nombre: 'Costilla en salsa roja', descripcion: 'Con arroz y frijoles', precio: '$185', etiquetas: '', disponible: 'si' },
        { categoria: 'Platos fuertes', nombre: 'Chiles rellenos', descripcion: 'De queso, capeados', precio: '$150', etiquetas: 'picante', disponible: 'si' },
        { categoria: 'Bebidas', nombre: 'Agua fresca del día', descripcion: 'Jarra o vaso', precio: '$40', etiquetas: 'vegano', disponible: 'si' },
        { categoria: 'Bebidas', nombre: 'Café de olla', descripcion: '', precio: '$45', etiquetas: '', disponible: 'si' },
        { categoria: 'Postres', nombre: 'Flan casero', descripcion: '', precio: '$60', etiquetas: 'nuevo', disponible: 'si' },
      ],
    }, m)
    c.blk('wa_request', { preset: 'pedido', guardar_copia: true }, m)
    const n = c.page('nosotros', 'Nosotros', 'Nuestra historia y horario')
    c.blk('paragraph', { text: 'Somos un negocio familiar. Cocinamos con ingredientes del día y recetas que se heredan. Cuéntale a tus clientes quién eres: cuándo empezaron, qué los hace distintos, qué platillo no se pueden perder.' }, n)
    return {
      nav: [{ texto: 'Pedir', tipo: 'ancla', destino: 'acciones' }, { texto: 'Menú', tipo: 'pagina', destino: 'menu' }, { texto: 'Reservar', tipo: 'ancla', destino: 'reservar' }, { texto: 'Nosotros', tipo: 'pagina', destino: 'nosotros' }],
      barra: [{ texto: 'Pedir', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero hacer un pedido' }, { texto: 'Menú', tipo: 'pagina', destino: 'menu', mensaje: '' }],
      cta: { texto: 'Pedir', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero hacer un pedido' },
      servicios: 'Comida · Bebidas · Pedidos a domicilio',
    }
  },

  belleza(c, home, first) {
    portada(c, first, 'Belleza · cuidado personal', 'Agenda tu cita por WhatsApp. Te confirmamos el horario.')
    const cta = c.mk(home, { ancho: 'angosto' })
    c.blk('wa_request', { preset: 'cita', boton: 'Agendar mi cita', guardar_copia: true }, cta)
    const s = c.mk(home, { ancla: 'servicios', antetitulo: 'Lo que hacemos', titulo: 'Servicios y precios', ancho: 'normal' })
    c.blk('services', {
      titulo: '', moneda: '$',
      items: [
        { categoria: 'Uñas', nombre: 'Manicure con gel', descripcion: 'Incluye limpieza y esmaltado', precio: '$280', duracion_min: 60 },
        { categoria: 'Uñas', nombre: 'Uñas acrílicas', descripcion: 'Set completo con diseño sencillo', precio: '$450', duracion_min: 120 },
        { categoria: 'Uñas', nombre: 'Pedicure spa', descripcion: '', precio: '$350', duracion_min: 75 },
        { categoria: 'Cabello', nombre: 'Corte y peinado', descripcion: '', precio: '$300', duracion_min: 60 },
        { categoria: 'Cabello', nombre: 'Tinte completo', descripcion: 'El precio varía según el largo', precio: 'desde $700', duracion_min: 150 },
        { categoria: 'Rostro', nombre: 'Limpieza facial', descripcion: 'Con mascarilla', precio: '$420', duracion_min: 60 },
      ],
    }, s)
    const e = c.mk(home, { ancla: 'equipo', antetitulo: 'Quiénes somos', titulo: 'Nuestro equipo', fondo: 'color', color: '#f6e9ee', ancho: 'angosto' })
    c.blk('paragraph', { text: 'Presenta a tu equipo: nombres, especialidad y años de experiencia. Las clientas confían más cuando saben con quién se van a sentar.' }, e)
    return {
      nav: [{ texto: 'Servicios', tipo: 'ancla', destino: 'servicios' }, { texto: 'Equipo', tipo: 'ancla', destino: 'equipo' }, { texto: 'Ubicación', tipo: 'ancla', destino: 'ubicacion' }],
      barra: [{ texto: 'Agendar cita', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero agendar una cita' }, { texto: 'Servicios', tipo: 'ancla', destino: 'servicios', mensaje: '' }],
      cta: { texto: 'Agendar', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero agendar una cita' },
      servicios: 'Uñas · Cabello · Rostro',
    }
  },

  salud(c, home, first) {
    portada(c, first, 'Consulta médica', 'Valoración personalizada y acompañamiento en cada paso.')
    const t = c.mk(home, { ancho: 'normal' })
    c.blk('wa_request', { preset: 'cita', boton: 'Agendar valoración', guardar_copia: true }, t)
    c.blk('trust_line', { items: [{ texto: 'Cédula profesional verificable' }, { texto: 'Valoración sin compromiso' }, { texto: 'Atención con cita' }] }, t)
    const cat = c.mk(home, { ancla: 'opciones', antetitulo: 'Qué atendemos', titulo: 'Conoce tus opciones', ancho: 'ancho' })
    c.blk('category_grid', {
      titulo: '',
      items: [
        { titulo: 'Primera consulta', sub_items: 'Revisión general, historia clínica y plan', enlace: 'consulta', texto_enlace: 'Ver detalles' },
        { titulo: 'Seguimiento', sub_items: 'Control de tratamiento y resultados', enlace: '#contacto', texto_enlace: 'Agendar' },
        { titulo: 'Procedimientos', sub_items: 'Explica aquí tus procedimientos principales', enlace: '#contacto', texto_enlace: 'Agendar' },
      ],
    }, cat)
    const p = c.mk(home, { ancla: 'doctor', antetitulo: 'Quién te atiende', fondo: 'color', color: '#e3ebe9', ancho: 'normal' })
    c.blk('profile', {
      nombre: c.v.name, especialidad: 'Tu especialidad médica',
      bio: 'Cuenta en dos o tres líneas tu trayectoria: dónde estudiaste, cuántos años de práctica tienes y cómo atiendes a tus pacientes.',
      credenciales: [{ etiqueta: 'Formación', valor: 'Universidad y año' }, { etiqueta: 'Especialidad', valor: 'Institución' }, { etiqueta: 'Cédula', valor: 'Número de cédula profesional' }],
      enlace_verificacion: 'https://cedulaprofesional.sep.gob.mx/', texto_verificacion: 'Verificar cédula en la SEP',
    }, p)
    const k = c.mk(home, { ancla: 'contacto', antetitulo: 'Hablemos', titulo: 'Agenda tu valoración', ancho: 'angosto' })
    c.blk('wa_request', { preset: 'cita', boton: 'Agendar por WhatsApp', guardar_copia: true }, k)
    const pg = c.page('consulta', 'Primera consulta', 'Qué incluye tu primera consulta')
    c.blk('heading', { text: 'Qué incluye tu primera consulta', level: 'h2' }, pg)
    c.blk('paragraph', { text: 'Revisión general, historia clínica, explicación del plan y resolución de dudas. Duración aproximada: 45 minutos.' }, pg)
    c.blk('heading', { text: 'Preguntas frecuentes', level: 'h2' }, pg)
    c.blk('paragraph', { text: '¿Debo llevar estudios previos? Sí, si los tienes.\n¿Cuánto cuesta? Pregúntanos por WhatsApp y te damos el costo vigente.' }, pg)
    c.blk('wa_request', { preset: 'cita', boton: 'Agendar cita', guardar_copia: true }, pg)
    return {
      nav: [{ texto: 'Opciones', tipo: 'ancla', destino: 'opciones' }, { texto: 'Quién te atiende', tipo: 'ancla', destino: 'doctor' }, { texto: 'Contacto', tipo: 'ancla', destino: 'contacto' }],
      barra: [{ texto: 'Agendar valoración', tipo: 'ancla', destino: 'contacto', mensaje: '' }, { texto: 'WhatsApp', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quisiera una valoración' }],
      cta: { texto: 'Agendar', tipo: 'ancla', destino: 'contacto', mensaje: '' },
      servicios: 'Consulta · Seguimiento · Procedimientos',
    }
  },

  inmobiliaria(c, home, first) {
    portada(c, first, 'Bienes raíces', 'Compra, vende o renta con acompañamiento de principio a fin.')
    const l = c.mk(home, { ancla: 'propiedades', antetitulo: 'Disponibles', titulo: 'Propiedades', ancho: 'ancho' })
    c.blk('listings', {
      titulo: '',
      items: [
        { titulo: 'Casa en zona residencial', operacion: 'venta', tipo: 'casa', precio: '$3,500,000', recamaras: 3, banos: 2, m2: 180, colonia: 'Colonia ejemplo', estado: 'disponible', descripcion: 'Jardín, cochera para 2 autos y cocina integral. Cambia este texto por los datos de tu propiedad.' },
        { titulo: 'Departamento céntrico', operacion: 'renta', tipo: 'departamento', precio: '$12,000/mes', recamaras: 2, banos: 1, m2: 75, colonia: 'Centro', estado: 'disponible', descripcion: 'A pasos de comercios y transporte.' },
        { titulo: 'Terreno campestre', operacion: 'venta', tipo: 'terreno', precio: '$900,000', m2: 1000, colonia: 'Zona campestre', estado: 'disponible' },
      ],
    }, l)
    c.blk('wa_request', { preset: 'visita', boton: 'Solicitar visita', guardar_copia: true }, l)
    const a = c.mk(home, { ancla: 'asesor', antetitulo: 'Tu asesor', fondo: 'color', color: '#e7efe9', ancho: 'normal' })
    c.blk('profile', {
      nombre: c.v.name, especialidad: 'Asesor inmobiliario',
      bio: 'Cuéntale a tus clientes cuánto tiempo llevas en el mercado, en qué zonas trabajas y cómo cuidas cada operación.',
      credenciales: [{ etiqueta: 'Zonas', valor: 'Tu ciudad y colonias' }, { etiqueta: 'Experiencia', valor: 'Años en el mercado' }],
    }, a)
    return {
      nav: [{ texto: 'Propiedades', tipo: 'ancla', destino: 'propiedades' }, { texto: 'Asesor', tipo: 'ancla', destino: 'asesor' }, { texto: 'Ubicación', tipo: 'ancla', destino: 'ubicacion' }],
      barra: [{ texto: 'Pedir visita', tipo: 'ancla', destino: 'propiedades', mensaje: '' }, { texto: 'WhatsApp', tipo: 'whatsapp', destino: '', mensaje: 'Hola, me interesa una propiedad' }],
      cta: { texto: 'WhatsApp', tipo: 'whatsapp', destino: '', mensaje: 'Hola, me interesa una propiedad' },
      servicios: 'Venta · Renta · Asesoría',
    }
  },

  fitness(c, home, first) {
    portada(c, first, 'Entrenamiento', 'Clases para todos los niveles. Tu primera clase es de prueba.')
    const p = c.mk(home, { ancla: 'programas', antetitulo: 'Elige tu camino', titulo: 'Programas', ancho: 'ancho' })
    c.blk('programs', {
      titulo: '',
      items: [
        { nombre: 'Fuerza 12 semanas', descripcion: 'Rutina progresiva con acompañamiento.', nivel: 'principiante', duracion: '12 semanas', precio: '$1,200/mes' },
        { nombre: 'HIIT express', descripcion: '30 minutos de alta intensidad.', nivel: 'intermedio', duracion: '30 min', precio: '$900/mes' },
        { nombre: 'Yoga y movilidad', descripcion: 'Flexibilidad y recuperación.', nivel: 'todos', duracion: '60 min', precio: '$800/mes' },
      ],
    }, p)
    const h = c.mk(home, { ancla: 'clases', antetitulo: 'Esta semana', titulo: 'Horario de clases', ancho: 'ancho' })
    const cl = (nombre: string, dia: string, inicio: string, fin: string, instructor = '', cupo: number | null = null) => ({ nombre, dia, inicio, fin, instructor, cupo })
    c.blk('class_schedule', {
      titulo: '',
      items: [cl('Spinning', 'mon', '07:00', '07:45', 'Instructor', 15), cl('Yoga', 'mon', '18:00', '19:00', 'Instructora', 12), cl('HIIT', 'tue', '07:00', '07:30'), cl('Fuerza', 'wed', '19:00', '20:00', 'Instructor', 10), cl('Yoga', 'thu', '18:00', '19:00', 'Instructora', 12), cl('Movilidad', 'sat', '09:00', '10:00', 'Instructora', 20)],
    }, h)
    c.blk('wa_request', { preset: 'clase', boton: 'Reservar clase muestra', guardar_copia: true }, h)
    return {
      nav: [{ texto: 'Programas', tipo: 'ancla', destino: 'programas' }, { texto: 'Clases', tipo: 'ancla', destino: 'clases' }, { texto: 'Ubicación', tipo: 'ancla', destino: 'ubicacion' }],
      barra: [{ texto: 'Clase muestra', tipo: 'ancla', destino: 'clases', mensaje: '' }, { texto: 'WhatsApp', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quiero información de las clases' }],
      cta: { texto: 'Clase muestra', tipo: 'ancla', destino: 'clases', mensaje: '' },
      servicios: 'Fuerza · HIIT · Yoga',
    }
  },

  servicios(c, home, first) {
    portada(c, first, 'Servicios profesionales', 'Cuéntanos qué necesitas y te cotizamos sin compromiso.')
    const q = c.mk(home, { ancho: 'angosto' })
    c.blk('wa_request', { preset: 'cotizacion', boton: 'Pedir cotización', guardar_copia: true }, q)
    const s = c.mk(home, { ancla: 'servicios', antetitulo: 'Qué hacemos', titulo: 'Servicios', ancho: 'normal' })
    c.blk('services', {
      titulo: '', moneda: '$',
      items: [
        { categoria: '', nombre: 'Servicio principal', descripcion: 'Describe en una línea qué incluye y para quién es.', precio: 'desde $500', duracion_min: null },
        { categoria: '', nombre: 'Servicio de emergencia', descripcion: 'Atención el mismo día en tu zona.', precio: 'cotiza', duracion_min: null },
        { categoria: '', nombre: 'Mantenimiento', descripcion: 'Revisión periódica para evitar fallas.', precio: 'desde $350', duracion_min: null },
      ],
    }, s)
    const z = c.mk(home, { ancla: 'cobertura', antetitulo: 'Dónde trabajamos', titulo: 'Zona de cobertura', fondo: 'color', color: '#f3e6dc', ancho: 'angosto' })
    c.blk('paragraph', { text: 'Menciona las colonias o ciudades donde das servicio y el tiempo de respuesta habitual.' }, z)
    const r = c.mk(home, { ancla: 'resenas', antetitulo: 'Clientes', titulo: 'Lo que dicen de nosotros', ancho: 'angosto' })
    c.blk('trust_line', { items: [{ texto: 'Servicio garantizado' }, { texto: 'Presupuesto sin costo' }, { texto: 'Atención por WhatsApp' }] }, r)
    return {
      nav: [{ texto: 'Servicios', tipo: 'ancla', destino: 'servicios' }, { texto: 'Cobertura', tipo: 'ancla', destino: 'cobertura' }],
      barra: [{ texto: 'Cotizar', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quisiera una cotización' }],
      cta: { texto: 'Cotizar', tipo: 'whatsapp', destino: '', mensaje: 'Hola, quisiera una cotización' },
      servicios: 'Servicios · Mantenimiento · Cotización sin costo',
    }
  },
}

/** Arma el minisitio de `giro` dentro del link (bio recién creada, sin bloques). Devuelve las rutas de las páginas creadas. */
export function applyGiro(db: DB, linkId: number, giro: Giro, v: GiroVals, now: number): void {
  const site = ensureSite(db, linkId, now)
  const home = site.pages[0]!
  const first = site.sections[0]!
  const meta = GIRO_META[giro]
  const mk = (pageId: number, d: Record<string, unknown>): number => {
    const s = createSection(db, pageId, readSectionData(d), now)
    if (typeof s === 'string') throw new Error('límite de secciones')
    return s.id
  }
  const blk = (type: string, data: Record<string, unknown>, sectionId: number): void => {
    createBlock(db, linkId, { type, is_enabled: true, starts_at: null, ends_at: null, data, style: {} }, now, sectionId)
  }
  // las páginas nuevas nacen con una sección: se usa esa para los bloques
  const page = (slug: string, title: string, desc: string): number => {
    const p = createPage(db, linkId, { slug, title, is_enabled: true, data: { seo_title: `${title} · ${v.name}`.slice(0, 70), seo_description: desc, seo_image: null } }, now)
    if (typeof p === 'string') throw new Error(`página ${slug}: ${p}`)
    const sec = sectionsOf(loadSite(db, linkId), p.id)[0]!
    updateSection(db, sec.id, readSectionData({ titulo: title, ancho: 'normal' }), true, now)
    return sec.id
  }
  const c: Ctx = { db, linkId, now, v, meta, mk, blk, page }
  const out = BUILDERS[giro](c, home.id, first.id)
  // los bloques de la portada van en su sección: el botón principal ya está en cada giro; aquí la ubicación
  const barra = [...out.barra]
  if (v.address) {
    const loc = mk(home.id, { ancla: 'ubicacion', antetitulo: 'Visítanos', titulo: 'Dónde estamos', fondo: 'color', color: '#ece7dc', ancho: 'angosto' })
    blk('location', { nombre_lugar: v.name, direccion: v.address, lat: null, lng: null, timezone: 'America/Mexico_City', horario: giro === 'restaurante' ? week('08:00', '20:00', ['09:00', '21:00']) : giro === 'fitness' ? week('06:00', '21:00', ['08:00', '13:00']) : week('10:00', '19:00', ['10:00', '14:00']) }, loc)
    if (barra.length < 3) barra.push({ texto: 'Cómo llegar', tipo: 'ancla', destino: 'ubicacion', mensaje: '' })
  }
  const nav = out.nav.filter((n) => v.address || n.destino !== 'ubicacion')
  const config = readSite({
    whatsapp: v.whatsapp,
    cabecera: { activa: true, logo: v.logo ?? null, nombre: v.name.slice(0, 40), nav: 'manual', nav_manual: nav, cta: out.cta },
    barra: { activa: true, acciones: barra.slice(0, 3) },
    pie: { activo: true, servicios: out.servicios, direccion: v.address.slice(0, 160), texto: v.example ? 'Sitio de ejemplo hecho con tubio · crea el tuyo en tubio.link' : '' },
  })
  saveSiteConfig(db, linkId, config, now)
}
