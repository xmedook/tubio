import type { DB } from '../../db/index.ts'
import { createBlock } from '../bio/repo.ts'
import { createPage, createSection, ensureSite, loadSite, saveSiteConfig, sectionsOf, updateSection } from '../minisitio/repo.ts'
import { readSectionData, readSite, type Action } from '../minisitio/schema.ts'
import type { Plan } from './plan.ts'

// ------------------------------------------------------------------ color: la IA propone, el código garantiza que se lea
type Rgb = [number, number, number]
const toRgb = (hex: string): Rgb => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16)) as Rgb
const toHex = (c: Rgb): string => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const lum = (hex: string): number => {
  const lin = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = toRgb(hex)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
export const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number]
  return (x + 0.05) / (y + 0.05)
}
const mix = (hex: string, to: Rgb, t: number): string => {
  const c = toRgb(hex)
  return toHex([0, 1, 2].map((i) => c[i]! + (to[i]! - c[i]!) * t) as Rgb)
}
/** Oscurece (o aclara) hasta que el texto blanco (o casi negro) tenga contraste AA (4.5:1) */
export function readableOn(hex: string, ink: '#ffffff' | '#111111'): string {
  let c = hex
  const to: Rgb = ink === '#ffffff' ? [0, 0, 0] : [255, 255, 255]
  for (let i = 0; i < 20 && contrast(c, ink) < 4.5; i++) c = mix(c, to, 0.12)
  return c
}

/** Colores finales del plan: principal y secundario oscuros (texto blanco), suave claro (texto oscuro) */
export function palette(p: Plan): { c1: string; c2: string; suave: string } {
  return {
    c1: readableOn(p.estilo.color_principal, '#ffffff'),
    c2: readableOn(p.estilo.color_secundario, '#ffffff'),
    suave: readableOn(p.estilo.color_suave, '#111111'),
  }
}

// ------------------------------------------------------------------ plan → páginas, secciones y bloques
type Blk = Plan['secciones'][number]['bloque']

/** Un bloque del plan como bloque real de túbio (tipo + datos con la forma que espera su render) */
export function realBlock(b: Blk): { type: string; data: Record<string, unknown> } | null {
  switch (b.tipo) {
    case 'servicios':
      return b.items.length ? { type: 'services', data: { titulo: '', moneda: '$', items: b.items.map((i) => ({ categoria: i.categoria, nombre: i.titulo, descripcion: i.descripcion, precio: i.precio, duracion_min: null })) } } : null
    case 'menu':
      return b.items.length ? { type: 'menu', data: { titulo: '', moneda: '$', carrito: true, items: b.items.map((i) => ({ categoria: i.categoria, nombre: i.titulo, descripcion: i.descripcion, precio: i.precio, etiquetas: '', disponible: 'si' })) } } : null
    case 'preguntas':
      return b.preguntas.length ? { type: 'faq', data: { items: b.preguntas.map((q) => ({ q: q.pregunta, a: q.respuesta })) } } : null
    case 'lista':
      return b.items.length ? { type: 'list', data: { items: b.items.map((i) => (i.descripcion ? `${i.titulo}: ${i.descripcion}` : i.titulo)).join('\n'), style: 'check' } } : null
    case 'confianza':
      return b.items.length ? { type: 'trust_line', data: { items: b.items.slice(0, 6).map((i) => ({ texto: i.titulo })) } } : null
    case 'texto':
      return b.texto ? { type: 'paragraph', data: { text: b.texto } } : null
    case 'cifra':
      return b.cifra ? { type: 'stat', data: { kicker: '', value: b.cifra, title: '', text: b.texto, layout: 'side', button: '', url: '' } } : null
    case 'pasos':
      return b.items.length >= 2 ? { type: 'steps', data: { items: b.items.slice(0, 6).map((i) => ({ num: i.titulo.slice(0, 8), label: (i.descripcion || i.titulo).slice(0, 28) })), note: b.texto.slice(0, 200) } } : null
  }
}

export type BuildVals = {
  /** WhatsApp ya normalizado (E.164 sin «+»); si viene vacío se usa el que la IA encontró en la descripción */
  whatsapp: string
  logo?: string | null
}

/** Arma el minisitio del plan dentro del enlace (bio recién creada). Todo pasa por los mismos lectores que el editor. */
export function buildSite(db: DB, linkId: number, plan: Plan, v: BuildVals, now: number): { sections: number; pages: number } {
  const site = ensureSite(db, linkId, now)
  const home = site.pages[0]!
  const first = site.sections[0]!
  const { c1, c2, suave } = palette(plan)
  const wa = v.whatsapp || (plan.negocio.whatsapp.length === 10 ? `52${plan.negocio.whatsapp}` : plan.negocio.whatsapp)
  let sections = 1
  const mk = (pageId: number, d: Record<string, unknown>): number => {
    const s = createSection(db, pageId, readSectionData(d), now)
    if (typeof s === 'string') throw new Error('límite de secciones')
    sections++
    return s.id
  }
  const blk = (type: string, data: Record<string, unknown>, sectionId: number): void => {
    createBlock(db, linkId, { type, is_enabled: true, starts_at: null, ends_at: null, data, style: {} }, now, sectionId)
  }
  const fondo = (f: Plan['secciones'][number]['fondo']): Record<string, unknown> =>
    f === 'suave' ? { fondo: 'color', color: suave } : f === 'principal' ? { fondo: 'color', color: c1 } : f === 'degradado' ? { fondo: 'degradado', color: c1, color2: c2, angulo: 160 } : {}

  // portada
  updateSection(db, first.id, readSectionData({ ancla: 'portada', antetitulo: plan.portada.antetitulo, titulo: plan.portada.titulo || plan.nombre, subtitulo: plan.portada.subtitulo, fondo: 'degradado', color: c1, color2: c2, angulo: 150, alto: 'auto', ancho: 'normal' }), true, now)

  // acciones: la principal primero; «llamar» marca el mismo número
  // sin número no hay WhatsApp ni llamada: esas acciones no se pintarían, así que la principal pasa a la siguiente
  const acciones = [...plan.acciones].filter((a) => wa || (a.tipo !== 'whatsapp' && a.tipo !== 'llamar')).sort((a, b) => Number(b.principal) - Number(a.principal))
  if (acciones.length) {
    const a = mk(home.id, { ancla: 'acciones', ancho: 'angosto' })
    blk('action_panel', {
      disposicion: 'principal',
      acciones: acciones.map((x, i) => ({ etiqueta: '', titulo: x.titulo, subtitulo: x.subtitulo, tipo: x.tipo, destino: x.tipo === 'llamar' ? wa : x.destino, mensaje: x.mensaje, principal: i === 0 ? 'si' : 'no' })),
    }, a)
  }

  for (const s of plan.secciones) {
    const rb = realBlock(s.bloque)
    if (!rb) continue
    const id = mk(home.id, { ancla: s.ancla, antetitulo: s.antetitulo, titulo: s.titulo, subtitulo: s.subtitulo, ancho: rb.type === 'menu' || rb.type === 'services' ? 'normal' : 'angosto', ...fondo(s.fondo) })
    blk(rb.type, rb.data, id)
  }

  if (plan.solicitud.tipo !== 'ninguna') {
    const r = mk(home.id, { ancla: 'solicitud', antetitulo: plan.solicitud.antetitulo, titulo: plan.solicitud.titulo, ancho: 'angosto', fondo: 'color', color: suave })
    blk('wa_request', { preset: plan.solicitud.tipo, guardar_copia: true }, r)
  }

  if (plan.negocio.direccion) {
    const loc = mk(home.id, { ancla: 'ubicacion', antetitulo: plan.idioma === 'en' ? 'Visit us' : 'Visítanos', titulo: plan.idioma === 'en' ? 'Where we are' : 'Dónde estamos', ancho: 'angosto' })
    blk('location', { nombre_lugar: plan.nombre, direccion: plan.negocio.direccion, lat: null, lng: null, timezone: 'America/Mexico_City', horario: plan.negocio.horario }, loc)
  }

  let pages = 1
  for (const g of plan.paginas) {
    const rb = realBlock(g.bloque)
    if (!rb) continue
    const p = createPage(db, linkId, { slug: g.slug, title: g.titulo, is_enabled: true, data: { seo_title: `${g.titulo} · ${plan.nombre}`.slice(0, 70), seo_description: g.descripcion, seo_image: null } }, now)
    if (typeof p === 'string') continue
    const sec = sectionsOf(loadSite(db, linkId), p.id)[0]!
    updateSection(db, sec.id, readSectionData({ titulo: g.titulo, subtitulo: g.descripcion, ancho: 'normal' }), true, now)
    blk(rb.type, rb.data, sec.id)
    pages++
  }

  // cabecera, barra y pie
  const principal = acciones[0]
  const cta: Action = principal
    ? { texto: principal.titulo.slice(0, 24), tipo: principal.tipo, destino: principal.tipo === 'llamar' ? wa : principal.destino, mensaje: principal.mensaje }
    : { texto: 'WhatsApp', tipo: 'whatsapp', destino: '', mensaje: '' }
  const nav = [
    ...plan.secciones.filter((s) => s.titulo).slice(0, 3).map((s) => ({ texto: navLabel(s), tipo: 'ancla' as const, destino: s.ancla })),
    ...plan.paginas.slice(0, 1).map((g) => ({ texto: g.titulo.slice(0, 24), tipo: 'pagina' as const, destino: g.slug })),
  ]
  const barra: Action[] = [cta]
  if (wa && cta.tipo !== 'whatsapp') barra.push({ texto: 'WhatsApp', tipo: 'whatsapp', destino: '', mensaje: '' })
  if (plan.negocio.direccion) barra.push({ texto: plan.idioma === 'en' ? 'Directions' : 'Cómo llegar', tipo: 'ancla', destino: 'ubicacion', mensaje: '' })
  saveSiteConfig(db, linkId, readSite({
    whatsapp: wa,
    // el botón principal ya va en la barra fija: en la cabecera se repetiría
    cabecera: { activa: true, logo: v.logo ?? null, nombre: plan.nombre.slice(0, 40), nav: 'manual', nav_manual: nav, cta: { texto: '', tipo: 'whatsapp', destino: '', mensaje: '' } },
    barra: { activa: true, escritorio: true, acciones: barra.slice(0, 3) },
    pie: { activo: true, servicios: plan.pie, direccion: plan.negocio.direccion, texto: '' },
  }), now)
  return { sections, pages }
}

/** Etiqueta corta para el menú: el antetítulo si es breve; si no, el título hasta la última palabra que quepa */
function navLabel(s: Plan['secciones'][number]): string {
  const k = s.antetitulo.trim()
  if (k && k.length <= 18) return k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()
  const t = s.titulo.trim()
  if (t.length <= 18) return t
  return t.slice(0, 19).replace(/\s+\S*$/, '') || t.slice(0, 18)
}

/** Ajustes de diseño de la página (tema, fuentes, botones) a partir del plan */
export function planDesign(plan: Plan): Record<string, unknown> {
  const { c1, suave } = palette(plan)
  return {
    theme: plan.estilo.tema,
    // el fondo de la página sale de la paleta (un claro cercano al «suave») y el texto es oscuro: así las secciones
    // sin fondo propio siempre se leen, sea cual sea el tema que eligió la IA
    bg_type: 'color',
    bg_color: mix(suave, [255, 255, 255], 0.55),
    text_color: '#1a1a1a',
    font: plan.estilo.fuente_texto,
    font_heading: plan.estilo.fuente_titulos,
    btn_bg: c1,
    btn_text: '#ffffff',
    btn_border_color: c1,
    lang: plan.idioma === 'en' ? 'en' : 'es-MX',
  }
}
