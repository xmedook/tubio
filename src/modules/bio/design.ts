import { z } from 'zod'

/** Temas prediseñados. Cada uno fija variables CSS; el usuario puede pisar cualquiera. */
export type Theme = {
  id: string
  bg: string
  text: string
  btnBg: string
  btnText: string
  btnBorder: string
  btnBorderWidth: number
  radius: number
  shadow: 'none' | 'soft' | 'hard'
  font: FontId
}

export const FONTS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, source-sans-pro, sans-serif',
  humanist: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
  geometric: 'Avenir, Montserrat, Corbel, "URW Gothic", source-sans-pro, sans-serif',
  serif: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
  didone: 'Didot, "Bodoni MT", "Noto Serif Display", "URW Palladio L", P052, Sylfaen, serif',
  slab: 'Rockwell, "Rockwell Nova", "Roboto Slab", "DejaVu Serif", "Sitka Small", serif',
  mono: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace',
  handwritten: '"Segoe Print", "Bradley Hand", Chilanka, TSCu_Comic, casual, cursive',
  // fuentes web libres (OFL-1.1, paquetes @fontsource) servidas desde nuestro servidor
  inter: '"Inter Variable", system-ui, sans-serif',
  montserrat: '"Montserrat Variable", Avenir, sans-serif',
  poppins: 'Poppins, system-ui, sans-serif',
  space: '"Space Grotesk Variable", system-ui, sans-serif',
  playfair: '"Playfair Display Variable", Georgia, serif',
  lora: '"Lora Variable", Georgia, serif',
  caveat: '"Caveat Variable", cursive',
  jetbrains: '"JetBrains Mono Variable", ui-monospace, monospace',
  familjen: '"Familjen Grotesk Variable", system-ui, sans-serif',
  schibsted: '"Schibsted Grotesk Variable", system-ui, sans-serif',
  chivo: 'Chivo, system-ui, sans-serif',
} as const
export type FontId = keyof typeof FONTS

/** @font-face de las fuentes web: archivo en node_modules → ruta pública /_/fonts/<archivo> */
export const WEB_FONTS: Partial<Record<FontId, { family: string; faces: { file: string; pkg: string; weight: string }[] }>> = {
  inter: { family: 'Inter Variable', faces: [{ pkg: '@fontsource-variable/inter', file: 'inter-latin-wght-normal.woff2', weight: '100 900' }] },
  montserrat: { family: 'Montserrat Variable', faces: [{ pkg: '@fontsource-variable/montserrat', file: 'montserrat-latin-wght-normal.woff2', weight: '100 900' }] },
  poppins: {
    family: 'Poppins',
    faces: ['400', '600', '700'].map((w) => ({ pkg: '@fontsource/poppins', file: `poppins-latin-${w}-normal.woff2`, weight: w })),
  },
  space: { family: 'Space Grotesk Variable', faces: [{ pkg: '@fontsource-variable/space-grotesk', file: 'space-grotesk-latin-wght-normal.woff2', weight: '300 700' }] },
  playfair: { family: 'Playfair Display Variable', faces: [{ pkg: '@fontsource-variable/playfair-display', file: 'playfair-display-latin-wght-normal.woff2', weight: '400 900' }] },
  lora: { family: 'Lora Variable', faces: [{ pkg: '@fontsource-variable/lora', file: 'lora-latin-wght-normal.woff2', weight: '400 700' }] },
  caveat: { family: 'Caveat Variable', faces: [{ pkg: '@fontsource-variable/caveat', file: 'caveat-latin-wght-normal.woff2', weight: '400 700' }] },
  jetbrains: { family: 'JetBrains Mono Variable', faces: [{ pkg: '@fontsource-variable/jetbrains-mono', file: 'jetbrains-mono-latin-wght-normal.woff2', weight: '100 800' }] },
  familjen: { family: 'Familjen Grotesk Variable', faces: [{ pkg: '@fontsource-variable/familjen-grotesk', file: 'familjen-grotesk-latin-wght-normal.woff2', weight: '400 700' }] },
  schibsted: { family: 'Schibsted Grotesk Variable', faces: [{ pkg: '@fontsource-variable/schibsted-grotesk', file: 'schibsted-grotesk-latin-wght-normal.woff2', weight: '400 900' }] },
  chivo: { family: 'Chivo', faces: [{ pkg: '@fontsource/chivo', file: 'chivo-latin-900-normal.woff2', weight: '900' }] },
}

export function fontFaceCss(id: FontId): string {
  const f = WEB_FONTS[id]
  if (!f) return ''
  return f.faces.map((x) => `@font-face{font-family:"${f.family}";font-style:normal;font-display:swap;font-weight:${x.weight};src:url("/_/fonts/${x.file}") format("woff2")}`).join('')
}
export const FONT_IDS = Object.keys(FONTS) as [FontId, ...FontId[]]

export const THEMES: Theme[] = [
  { id: 'nube', bg: 'linear-gradient(160deg,#eef2ff,#fdf2f8)', text: '#1e1b4b', btnBg: '#ffffff', btnText: '#1e1b4b', btnBorder: '#e0e7ff', btnBorderWidth: 1, radius: 14, shadow: 'soft', font: 'system' },
  { id: 'tinta', bg: '#0b0b0f', text: '#f4f4f5', btnBg: '#18181b', btnText: '#fafafa', btnBorder: '#3f3f46', btnBorderWidth: 1, radius: 10, shadow: 'none', font: 'geometric' },
  { id: 'papel', bg: '#f7f3ea', text: '#2b2118', btnBg: '#2b2118', btnText: '#f7f3ea', btnBorder: '#2b2118', btnBorderWidth: 0, radius: 2, shadow: 'none', font: 'serif' },
  { id: 'menta', bg: 'linear-gradient(180deg,#d1fae5,#ecfeff)', text: '#064e3b', btnBg: '#047857', btnText: '#ffffff', btnBorder: '#065f46', btnBorderWidth: 0, radius: 999, shadow: 'soft', font: 'rounded' },
  { id: 'atardecer', bg: 'linear-gradient(200deg,#c2410c,#be185d 55%,#6d28d9)', text: '#ffffff', btnBg: 'rgba(0,0,0,.18)', btnText: '#ffffff', btnBorder: 'rgba(255,255,255,.55)', btnBorderWidth: 1, radius: 16, shadow: 'none', font: 'humanist' },
  { id: 'neon', bg: '#09090b', text: '#e4e4e7', btnBg: '#09090b', btnText: '#a3e635', btnBorder: '#a3e635', btnBorderWidth: 2, radius: 0, shadow: 'hard', font: 'mono' },
  { id: 'oceano', bg: 'linear-gradient(170deg,#0c4a6e,#0e7490)', text: '#f0f9ff', btnBg: '#f0f9ff', btnText: '#0c4a6e', btnBorder: '#f0f9ff', btnBorderWidth: 0, radius: 12, shadow: 'soft', font: 'system' },
  { id: 'terracota', bg: '#e9d8c8', text: '#5b2c1a', btnBg: '#b4532a', btnText: '#fff7ed', btnBorder: '#7c2d12', btnBorderWidth: 2, radius: 8, shadow: 'hard', font: 'slab' },
  { id: 'gala', bg: '#111111', text: '#f5f0e6', btnBg: 'transparent', btnText: '#d9c08b', btnBorder: '#d9c08b', btnBorderWidth: 1, radius: 0, shadow: 'none', font: 'didone' },
  { id: 'chicle', bg: '#ffe4f1', text: '#831843', btnBg: '#ffffff', btnText: '#be185d', btnBorder: '#831843', btnBorderWidth: 2, radius: 20, shadow: 'hard', font: 'handwritten' },
]
export const THEME_IDS = THEMES.map((t) => t.id) as [string, ...string[]]
export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? (THEMES[0] as Theme)
}

const hex = z.string().regex(/^#[0-9a-f]{6}$/i)
const optHex = hex.nullable().default(null)
const text = (max: number) => z.string().trim().max(max).default('')

export const designSchema = z.object({
  theme: z.enum(THEME_IDS).default('nube'),
  bg_type: z.enum(['theme', 'color', 'gradient', 'image']).default('theme'),
  bg_color: hex.default('#ffffff'),
  bg_color2: hex.default('#dbeafe'),
  bg_angle: z.coerce.number().int().min(0).max(360).default(160),
  bg_image: z.string().regex(/^[\w-]+\.webp$/).nullable().default(null),
  bg_blur: z.coerce.number().int().min(0).max(20).default(0),
  bg_brightness: z.coerce.number().int().min(40).max(140).default(100),
  text_color: optHex,
  font: z.enum(['theme', ...FONT_IDS]).default('theme'),
  /** fuente de títulos y de cifras; 'theme' = la misma del texto */
  font_heading: z.enum(['theme', ...FONT_IDS]).default('theme'),
  font_num: z.enum(['theme', ...FONT_IDS]).default('theme'),
  font_size: z.coerce.number().int().min(14).max(20).default(16),
  width: z.enum(['narrow', 'normal', 'wide']).default('normal'),
  spacing: z.enum(['compact', 'normal', 'relaxed']).default('normal'),
  align: z.enum(['center', 'left']).default('center'),
  animation: z.enum(['none', 'fade', 'rise', 'pop']).default('rise'),
  hover: z.enum(['none', 'lift', 'grow', 'glow']).default('lift'),
  btn_bg: optHex,
  btn_text: optHex,
  btn_border_color: optHex,
  btn_border_width: z.coerce.number().int().min(0).max(4).nullable().default(null),
  btn_border_style: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
  btn_radius: z.coerce.number().int().min(0).max(40).nullable().default(null),
  btn_shadow: z.enum(['theme', 'none', 'soft', 'hard']).default('theme'),
  announce_text: text(200),
  announce_url: text(2048),
  announce_bg: hex.default('#111827'),
  announce_color: hex.default('#ffffff'),
  announce_position: z.enum(['top', 'bottom']).default('top'),
  /** idioma de la página (SEO y textos del sistema); '' = el de la cuenta */
  lang: z.enum(['', 'es-MX', 'es', 'en', 'en-US', 'pt-BR', 'fr', 'de', 'it']).default(''),
  seo_title: text(70),
  seo_description: text(200),
  seo_keywords: text(200),
  seo_image: z.string().regex(/^[\w-]+\.webp$/).nullable().default(null),
  noindex: z.boolean().default(false),
  favicon: z.string().regex(/^[\w-]+\.webp$/).nullable().default(null),
  show_branding: z.boolean().default(true),
  brand_text: text(60),
  brand_url: text(2048),
  share_button: z.boolean().default(true),
  pwa: z.boolean().default(false),
  directory: z.boolean().default(false),
  category: z.enum(['', 'creator', 'business', 'music', 'art', 'food', 'education', 'tech', 'health', 'nonprofit', 'other']).default(''),
  leap_url: text(2048),
})
export type Design = z.infer<typeof designSchema>

/** Lee el diseño guardado; lo inválido vuelve al valor por defecto campo por campo */
export function readDesign(data: Record<string, unknown>): Design {
  const full = designSchema.safeParse(data)
  if (full.success) return full.data
  const base = designSchema.parse({})
  const out: Record<string, unknown> = { ...base }
  for (const k of Object.keys(designSchema.shape) as (keyof Design)[]) {
    const one = designSchema.shape[k].safeParse(data[k])
    if (one.success) out[k] = one.data
  }
  return out as Design
}

export function defaultBioData(title: string, _ownerName: string, theme = ''): Record<string, unknown> {
  return { ...designSchema.parse(THEME_IDS.includes(theme) ? { theme } : {}), seo_title: title.slice(0, 70) }
}
