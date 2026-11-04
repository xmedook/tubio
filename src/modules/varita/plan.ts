import { z } from 'zod'
import { THEME_IDS } from '../bio/design.ts'
import { WA_PRESETS } from '../bio/wa-request.ts'
import { GIROS } from '../minisitio/giros.ts'

/**
 * El «plan» de un minisitio: lo único que la IA puede producir. No escribe HTML ni URLs libres: sólo textos, colores y
 * elecciones entre opciones fijas, que `build.ts` convierte en páginas, secciones y bloques reales de túbio.
 * Este esquema va tal cual como formato de salida estructurada; los límites (largos, cantidades, hex) se aplican
 * después en `normalizePlan`, porque los esquemas de salida estructurada no admiten todas las restricciones.
 */

/** Fuentes que la IA puede elegir: las que se ven bien en un sitio de negocio (sin monoespaciadas ni manuscritas) */
export const PLAN_FONTS = ['system', 'serif', 'rounded', 'inter', 'montserrat', 'poppins', 'space', 'playfair', 'lora', 'familjen', 'schibsted', 'figtree', 'bigshoulders', 'instrument'] as const
export const BLOCK_KINDS = ['servicios', 'menu', 'preguntas', 'lista', 'confianza', 'texto', 'cifra', 'pasos'] as const
export const SECTION_BGS = ['claro', 'suave', 'principal', 'degradado'] as const
export const ACTION_KINDS = ['whatsapp', 'llamar', 'ancla', 'pagina'] as const
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const item = z.object({
  titulo: z.string().describe('Nombre del servicio, platillo o punto'),
  descripcion: z.string().describe('Una línea. Vacío si no aporta'),
  precio: z.string().describe('Sólo si viene en la descripción del negocio, tal cual. Si no, vacío'),
  categoria: z.string().describe('Agrupa platillos o servicios (p. ej. «Tacos», «Bebidas»). Vacío si no aplica'),
})

const block = z.object({
  tipo: z.enum(BLOCK_KINDS),
  texto: z.string().describe('Para «texto»: un párrafo breve. Para «cifra»: la nota bajo la cifra. Si no, vacío'),
  items: z.array(item).describe('Para servicios, menu, lista, confianza y pasos (en pasos: titulo = número o día corto, descripcion = qué pasa en 3 palabras como máximo)'),
  preguntas: z.array(z.object({ pregunta: z.string(), respuesta: z.string() })).describe('Sólo para «preguntas»'),
  cifra: z.string().describe('Sólo para «cifra»: un dato real del negocio dado en la descripción (años, sucursales…). Si no hay, no uses «cifra»'),
})

const section = z.object({
  ancla: z.string().describe('identificador corto en minúsculas sin acentos, p. ej. «servicios»'),
  antetitulo: z.string(),
  titulo: z.string(),
  subtitulo: z.string(),
  fondo: z.enum(SECTION_BGS),
  bloque: block,
})

export const planSchema = z.object({
  nombre: z.string().describe('Nombre del negocio'),
  giro: z.enum([...GIROS, 'otro']),
  idioma: z.enum(['es', 'en']).describe('El idioma en que escribió la persona'),
  estilo: z.object({
    tema: z.enum(THEME_IDS),
    fuente_texto: z.enum(PLAN_FONTS),
    fuente_titulos: z.enum(PLAN_FONTS),
    color_principal: z.string().describe('hex #rrggbb oscuro y con carácter, de la marca o del giro'),
    color_secundario: z.string().describe('hex #rrggbb para degradados junto al principal'),
    color_suave: z.string().describe('hex #rrggbb muy claro para fondos de sección'),
  }),
  portada: z.object({ antetitulo: z.string(), titulo: z.string(), subtitulo: z.string() }),
  acciones: z.array(z.object({
    titulo: z.string(),
    subtitulo: z.string(),
    tipo: z.enum(ACTION_KINDS),
    destino: z.string().describe('ancla: el ancla de una sección; pagina: el slug de una página; whatsapp y llamar: vacío'),
    mensaje: z.string().describe('whatsapp: el mensaje que se envía. Si no, vacío'),
    principal: z.boolean(),
  })),
  solicitud: z.object({
    tipo: z.enum([...WA_PRESETS, 'ninguna']).describe('formulario que llega por WhatsApp: cita, reservacion, pedido, cotizacion…'),
    antetitulo: z.string(),
    titulo: z.string(),
  }),
  secciones: z.array(section),
  paginas: z.array(z.object({ slug: z.string(), titulo: z.string(), descripcion: z.string(), bloque: block })).describe('Páginas extra, casi siempre ninguna o una (p. ej. «menu»)'),
  negocio: z.object({
    whatsapp: z.string().describe('Sólo dígitos, tal como venga en la descripción. Vacío si no viene'),
    direccion: z.string().describe('Tal como venga. Vacío si no viene'),
    horario: z.array(z.object({ day: z.enum(DAYS), open: z.string().describe('HH:MM'), close: z.string().describe('HH:MM') })),
  }),
  pie: z.string().describe('Servicios principales separados por « · »'),
})
export type Plan = z.infer<typeof planSchema>

// ------------------------------------------------------------------ límites y limpieza
const MAX = { secciones: 6, paginas: 2, acciones: 4, items: 24, preguntas: 8 }
const HEX = /^#[0-9a-f]{6}$/i
const ctrl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const cut = (s: unknown, n: number): string => (typeof s === 'string' ? s.replace(ctrl, '').trim().slice(0, n) : '')
export const slugify = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)

/** Recorta largos y cantidades, corrige anclas, colores y horas; nunca falla */
export function normalizePlan(p: Plan): Plan {
  const hex = (v: string, d: string) => (HEX.test(v) ? v.toLowerCase() : d)
  const cleanBlock = (b: Plan['secciones'][number]['bloque']) => ({
    tipo: b.tipo,
    texto: cut(b.texto, 600),
    items: b.items.slice(0, MAX.items).map((i) => ({ titulo: cut(i.titulo, 80), descripcion: cut(i.descripcion, 200), precio: cut(i.precio, 30), categoria: cut(i.categoria, 40) })).filter((i) => i.titulo),
    preguntas: b.preguntas.slice(0, MAX.preguntas).map((q) => ({ pregunta: cut(q.pregunta, 200), respuesta: cut(q.respuesta, 600) })).filter((q) => q.pregunta && q.respuesta),
    cifra: cut(b.cifra, 12),
  })
  const usadas = new Set(['inicio', 'acciones', 'solicitud', 'ubicacion'])
  const secciones = p.secciones.slice(0, MAX.secciones).map((s, i) => {
    let ancla = slugify(s.ancla) || `seccion-${i + 1}`
    while (usadas.has(ancla)) ancla = `${ancla}-${i + 1}`
    usadas.add(ancla)
    return { ancla, antetitulo: cut(s.antetitulo, 60), titulo: cut(s.titulo, 120), subtitulo: cut(s.subtitulo, 240), fondo: s.fondo, bloque: cleanBlock(s.bloque) }
  })
  const reservadas = new Set(['', 'panel', 'admin', 'api'])
  const paginas = p.paginas.slice(0, MAX.paginas).map((g) => ({ slug: slugify(g.slug) || slugify(g.titulo), titulo: cut(g.titulo, 60), descripcion: cut(g.descripcion, 160), bloque: cleanBlock(g.bloque) }))
    .filter((g, i, all) => g.slug && !reservadas.has(g.slug) && all.findIndex((x) => x.slug === g.slug) === i)
  const anclas = new Set(secciones.map((s) => s.ancla))
  const slugs = new Set(paginas.map((g) => g.slug))
  const acciones = p.acciones.slice(0, MAX.acciones).map((a) => ({
    titulo: cut(a.titulo, 40), subtitulo: cut(a.subtitulo, 80), tipo: a.tipo,
    destino: a.tipo === 'ancla' ? slugify(a.destino) : a.tipo === 'pagina' ? slugify(a.destino) : '',
    mensaje: a.tipo === 'whatsapp' ? cut(a.mensaje, 300) : '', principal: !!a.principal,
  })).filter((a) => a.titulo && (a.tipo !== 'ancla' || anclas.has(a.destino) || a.destino === 'solicitud' || a.destino === 'ubicacion') && (a.tipo !== 'pagina' || slugs.has(a.destino)))
  const hhmm = (v: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '')
  return {
    nombre: cut(p.nombre, 60) || 'Mi negocio',
    giro: p.giro,
    idioma: p.idioma,
    estilo: {
      tema: p.estilo.tema,
      fuente_texto: p.estilo.fuente_texto,
      fuente_titulos: p.estilo.fuente_titulos,
      color_principal: hex(p.estilo.color_principal, '#1f2937'),
      color_secundario: hex(p.estilo.color_secundario, '#4b5563'),
      color_suave: hex(p.estilo.color_suave, '#f4f1ea'),
    },
    portada: { antetitulo: cut(p.portada.antetitulo, 60), titulo: cut(p.portada.titulo, 120), subtitulo: cut(p.portada.subtitulo, 240) },
    acciones,
    solicitud: { tipo: p.solicitud.tipo, antetitulo: cut(p.solicitud.antetitulo, 60), titulo: cut(p.solicitud.titulo, 120) },
    secciones,
    paginas,
    negocio: {
      whatsapp: p.negocio.whatsapp.replace(/\D/g, '').slice(0, 15),
      direccion: cut(p.negocio.direccion, 160),
      horario: p.negocio.horario.slice(0, 14).map((h) => ({ day: h.day, open: hhmm(h.open), close: hhmm(h.close) })).filter((h) => h.open && h.close),
    },
    pie: cut(p.pie, 160),
  }
}
