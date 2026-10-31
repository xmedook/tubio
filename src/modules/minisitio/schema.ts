import { z } from 'zod'

/** Topes del motor (el plan podrá acotarlos más adelante) */
export const MS_MAX_PAGES = 12
export const MS_MAX_SECTIONS = 20
export const MS_MAX_NAV = 8

const text = (max: number) => z.string().trim().max(max).default('')
const hex = z.string().regex(/^#[0-9a-f]{6}$/i)
const image = z.string().regex(/^[\w-]+\.webp$/).nullable().default(null)

/** Ancla de sección / slug de página: minúsculas, números y guiones; sin `_` (reservado para rutas internas) */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
/** Páginas que no pueden llamarse así (rutas del sitio que cuelgan de /<alias>) */
export const RESERVED_SLUGS = new Set(['propiedad', 'api', 'panel', 'admin', 'assets', 'static'])

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// ---------------------------------------------------------------- acciones (botón de cabecera, barra inferior)
export const ACTION_TYPES = ['enlace', 'whatsapp', 'llamar', 'pagina', 'ancla'] as const
export type ActionType = (typeof ACTION_TYPES)[number]

export const actionSchema = z.object({
  texto: text(24),
  tipo: z.enum(ACTION_TYPES).default('enlace'),
  /** enlace: URL https · whatsapp: número E.164 (vacío = el del sitio) · llamar: teléfono · pagina: slug · ancla: ancla */
  destino: text(2048),
  /** whatsapp: mensaje de arranque */
  mensaje: text(300),
})
export type Action = z.infer<typeof actionSchema>

// ---------------------------------------------------------------- sitio
export const siteSchema = z.object({
  /** número del negocio, E.164 sin «+»: lo usan las acciones de WhatsApp sin número propio */
  whatsapp: z.string().regex(/^\d{8,15}$/).or(z.literal('')).default(''),
  cabecera: z
    .object({
      activa: z.boolean().default(false),
      logo: image,
      nombre: text(40),
      /** auto: del ancla de cada sección con título · manual: la lista · ninguna */
      nav: z.enum(['auto', 'manual', 'ninguna']).default('auto'),
      nav_manual: z.array(z.object({ texto: text(24), tipo: z.enum(['pagina', 'ancla', 'enlace']).default('ancla'), destino: text(2048) })).max(MS_MAX_NAV).default([]),
      cta: actionSchema.default(() => actionSchema.parse({})),
    })
    .default(() => ({ activa: false, logo: null, nombre: '', nav: 'auto' as const, nav_manual: [], cta: actionSchema.parse({}) })),
  barra: z
    .object({
      activa: z.boolean().default(false),
      acciones: z.array(actionSchema).max(3).default([]),
    })
    .default(() => ({ activa: false, acciones: [] })),
  pie: z
    .object({
      activo: z.boolean().default(false),
      direccion: text(160),
      servicios: text(160),
      texto: text(200),
    })
    .default(() => ({ activo: false, direccion: '', servicios: '', texto: '' })),
})
export type SiteConfig = z.infer<typeof siteSchema>

export function readSite(raw: unknown): SiteConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const full = siteSchema.safeParse(obj)
  if (full.success) return full.data
  const base = siteSchema.parse({})
  const out: Record<string, unknown> = { ...base }
  for (const k of Object.keys(siteSchema.shape) as (keyof SiteConfig)[]) {
    const one = siteSchema.shape[k].safeParse(obj[k])
    if (one.success) out[k] = one.data
  }
  return out as SiteConfig
}

// ---------------------------------------------------------------- página
export const pageDataSchema = z.object({
  seo_title: text(70),
  seo_description: text(200),
  seo_image: image,
})
export type PageData = z.infer<typeof pageDataSchema>

export function readPageData(raw: unknown): PageData {
  const r = pageDataSchema.safeParse(raw && typeof raw === 'object' ? raw : {})
  return r.success ? r.data : pageDataSchema.parse({})
}

// ---------------------------------------------------------------- sección
export const FONDO_TIPOS = ['ninguno', 'color', 'degradado', 'imagen'] as const
export const ALTOS = ['auto', 'media', 'completa'] as const
export const ANCHOS = ['angosto', 'normal', 'ancho'] as const

export const sectionDataSchema = z.object({
  /** sección heredada de una bio: sin título, angosta, sin relleno extra (el sitio se ve idéntico) */
  classic: z.boolean().default(false),
  ancla: z.string().regex(SLUG_RE).or(z.literal('')).default(''),
  antetitulo: text(60),
  titulo: text(120),
  subtitulo: text(240),
  fondo: z.enum(FONDO_TIPOS).default('ninguno'),
  color: hex.default('#f4f1ea'),
  color2: hex.default('#d9d2c3'),
  angulo: z.coerce.number().int().min(0).max(360).default(160),
  imagen: image,
  /** oscurecer la imagen de fondo, % */
  oscurecer: z.coerce.number().int().min(0).max(80).default(35),
  alto: z.enum(ALTOS).default('auto'),
  ancho: z.enum(ANCHOS).default('normal'),
  /** columnas en escritorio (en móvil siempre 1) */
  columnas: z.coerce.number().int().min(1).max(3).default(1),
  alinear: z.enum(['izquierda', 'centro']).default('izquierda'),
  /** ninguno = sin relleno vertical (para portadas a pantalla completa) */
  relleno: z.enum(['normal', 'ninguno']).default('normal'),
})
export type SectionData = z.infer<typeof sectionDataSchema>

export function readSectionData(raw: unknown): SectionData {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const full = sectionDataSchema.safeParse(obj)
  if (full.success) return full.data
  const out: Record<string, unknown> = { ...sectionDataSchema.parse({}) }
  for (const k of Object.keys(sectionDataSchema.shape) as (keyof SectionData)[]) {
    const one = sectionDataSchema.shape[k].safeParse(obj[k])
    if (one.success) out[k] = one.data
  }
  return out as SectionData
}

export const CLASSIC_SECTION: SectionData = sectionDataSchema.parse({ classic: true, ancho: 'normal' })
