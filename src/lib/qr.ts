import QRCode from 'qrcode'
import sharp from 'sharp'
import { z } from 'zod'
import { esc } from './html.ts'

/** Estilo de un QR. Todo opcional: lo que falte toma el valor por defecto. */
export const qrStyleSchema = z.object({
  fg: z.string().regex(/^#[0-9a-f]{6}$/i).default('#111111'),
  gradient: z.enum(['none', 'linear', 'radial']).default('none'),
  fg2: z.string().regex(/^#[0-9a-f]{6}$/i).default('#1d4ed8'),
  gradientAngle: z.coerce.number().min(0).max(360).default(45),
  bg: z.string().regex(/^#[0-9a-f]{6}$/i).default('#ffffff'),
  bgTransparent: z.boolean().default(false),
  modules: z.enum(['square', 'rounded', 'dot', 'diamond', 'vertical', 'horizontal']).default('square'),
  eyeOuter: z.enum(['square', 'rounded', 'circle', 'leaf']).default('square'),
  eyeInner: z.enum(['square', 'rounded', 'circle', 'diamond']).default('square'),
  eyeColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().default(null),
  ecc: z.enum(['L', 'M', 'Q', 'H']).default('M'),
  margin: z.coerce.number().int().min(0).max(10).default(2),
  size: z.coerce.number().int().min(128).max(2048).default(512),
  logoSize: z.coerce.number().min(10).max(30).default(22),
  frame: z.enum(['none', 'label']).default('none'),
  frameText: z.string().max(40).default(''),
  frameColor: z.string().regex(/^#[0-9a-f]{6}$/i).default('#111111'),
})
export type QrStyle = z.infer<typeof qrStyleSchema>

export function parseQrStyle(input: unknown): QrStyle {
  const r = qrStyleSchema.safeParse(input ?? {})
  return r.success ? r.data : qrStyleSchema.parse({})
}

export type QrMatrix = { size: number; get(row: number, col: number): boolean }

export function qrMatrix(text: string, ecc: QrStyle['ecc']): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: ecc })
  const { size, data } = qr.modules
  return { size, get: (r, c) => r >= 0 && c >= 0 && r < size && c < size && data[r * size + c] === 1 }
}

function inFinder(n: number, r: number, c: number): boolean {
  return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)
}

const f = (x: number) => Number(x.toFixed(3)).toString()

function rect(x: number, y: number, w: number, h: number, rx = 0): string {
  if (rx <= 0) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`
  const r = Math.min(rx, w / 2, h / 2)
  return (
    `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}` +
    `a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}` +
    `v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}z`
  )
}

function circle(cx: number, cy: number, r: number): string {
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`
}

/** Hoja: esquinas redondeadas sólo en dos vértices opuestos */
function leaf(x: number, y: number, s: number, r: number): string {
  return `M${f(x + r)} ${f(y)}h${f(s - r)}v${f(s - r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(s - r))}v${f(-(s - r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}z`
}

function diamond(cx: number, cy: number, r: number): string {
  return `M${f(cx)} ${f(cy - r)}L${f(cx + r)} ${f(cy)}L${f(cx)} ${f(cy + r)}L${f(cx - r)} ${f(cy)}z`
}

/** Marco exterior de un ojo (7×7 con hueco de 5×5), en coordenadas de módulos */
function eyeOuterPath(x: number, y: number, shape: QrStyle['eyeOuter']): string {
  switch (shape) {
    case 'circle':
      return circle(x + 3.5, y + 3.5, 3.5) + circle(x + 3.5, y + 3.5, 2.5)
    case 'rounded':
      return rect(x, y, 7, 7, 2) + rect(x + 1, y + 1, 5, 5, 1.3)
    case 'leaf':
      return leaf(x, y, 7, 2.5) + leaf(x + 1, y + 1, 5, 1.6)
    default:
      return rect(x, y, 7, 7) + rect(x + 1, y + 1, 5, 5)
  }
}

function eyeInnerPath(x: number, y: number, shape: QrStyle['eyeInner']): string {
  switch (shape) {
    case 'circle':
      return circle(x + 3.5, y + 3.5, 1.5)
    case 'rounded':
      return rect(x + 2, y + 2, 3, 3, 0.9)
    case 'diamond':
      return diamond(x + 3.5, y + 3.5, 1.9)
    default:
      return rect(x + 2, y + 2, 3, 3)
  }
}

export type QrRenderOptions = {
  /** data: URI de una imagen ya re-codificada por nosotros (png/webp/jpeg) */
  logoDataUri?: string | null
}

/** SVG del QR con el estilo dado. Determinista: mismo texto y estilo → mismo SVG. */
export function renderQrSvg(text: string, style: QrStyle, opts: QrRenderOptions = {}): string {
  const hasLogo = !!opts.logoDataUri
  // con logo hace falta más corrección de errores
  const ecc = hasLogo && (style.ecc === 'L' || style.ecc === 'M') ? 'Q' : style.ecc
  const m = qrMatrix(text, ecc)
  const n = m.size
  const pad = style.margin
  const total = n + pad * 2
  const frameH = style.frame === 'label' ? Math.max(5, Math.round(total * 0.18)) : 0
  const height = total + frameH

  // hueco del logo, en módulos, centrado y alineado a la cuadrícula
  let hole = { x0: -1, y0: -1, x1: -1, y1: -1 }
  if (hasLogo) {
    const side = Math.ceil((n * style.logoSize) / 100) | 1
    const start = Math.floor((n - side) / 2)
    hole = { x0: start, y0: start, x1: start + side - 1, y1: start + side - 1 }
  }
  const inHole = (r: number, c: number) => r >= hole.y0 && r <= hole.y1 && c >= hole.x0 && c <= hole.x1

  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!m.get(r, c) || inFinder(n, r, c) || inHole(r, c)) continue
      const x = c + pad
      const y = r + pad
      switch (style.modules) {
        case 'dot':
          d += circle(x + 0.5, y + 0.5, 0.45)
          break
        case 'rounded':
          d += rect(x + 0.05, y + 0.05, 0.9, 0.9, 0.35)
          break
        case 'diamond':
          d += diamond(x + 0.5, y + 0.5, 0.55)
          break
        case 'vertical': {
          if (m.get(r - 1, c) && !inFinder(n, r - 1, c) && !inHole(r - 1, c)) break
          let len = 1
          while (m.get(r + len, c) && !inFinder(n, r + len, c) && !inHole(r + len, c)) len++
          d += rect(x + 0.1, y + 0.05, 0.8, len - 0.1, 0.4)
          break
        }
        case 'horizontal': {
          if (m.get(r, c - 1) && !inFinder(n, r, c - 1) && !inHole(r, c - 1)) break
          let len = 1
          while (m.get(r, c + len) && !inFinder(n, r, c + len) && !inHole(r, c + len)) len++
          d += rect(x + 0.05, y + 0.1, len - 0.1, 0.8, 0.4)
          break
        }
        default: {
          // corridas horizontales: menos nodos en el path
          if (m.get(r, c - 1) && !inFinder(n, r, c - 1) && !inHole(r, c - 1)) break
          let len = 1
          while (m.get(r, c + len) && !inFinder(n, r, c + len) && !inHole(r, c + len)) len++
          d += rect(x, y, len, 1)
        }
      }
    }
  }

  let eyesOuter = ''
  let eyesInner = ''
  for (const [ex, ey] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as const) {
    eyesOuter += eyeOuterPath(ex + pad, ey + pad, style.eyeOuter)
    eyesInner += eyeInnerPath(ex + pad, ey + pad, style.eyeInner)
  }

  let defs = ''
  let fill = style.fg
  if (style.gradient !== 'none') {
    if (style.gradient === 'linear') {
      const a = (style.gradientAngle * Math.PI) / 180
      const x1 = 0.5 - Math.cos(a) / 2
      const y1 = 0.5 - Math.sin(a) / 2
      // gradientUnits por defecto (objectBoundingBox): el degradado cubre el área del QR, no cada módulo
      defs += `<linearGradient id="g" x1="${f(x1)}" y1="${f(y1)}" x2="${f(1 - x1)}" y2="${f(1 - y1)}"><stop offset="0" stop-color="${style.fg}"/><stop offset="1" stop-color="${style.fg2}"/></linearGradient>`
    } else {
      defs += `<radialGradient id="g" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="${style.fg}"/><stop offset="1" stop-color="${style.fg2}"/></radialGradient>`
    }
    fill = 'url(#g)'
  }
  const eyeFill = style.eyeColor ?? fill

  const bg = style.bgTransparent ? '' : `<rect width="${total}" height="${height}" fill="${style.bg}"/>`
  let logo = ''
  if (hasLogo) {
    const lx = hole.x0 + pad
    const ly = hole.y0 + pad
    const side = hole.x1 - hole.x0 + 1
    logo =
      (style.bgTransparent ? '' : `<rect x="${lx}" y="${ly}" width="${side}" height="${side}" fill="${style.bg}"/>`) +
      `<image x="${f(lx + 0.4)}" y="${f(ly + 0.4)}" width="${f(side - 0.8)}" height="${f(side - 0.8)}" href="${esc(opts.logoDataUri)}" preserveAspectRatio="xMidYMid meet"/>`
  }
  let frame = ''
  if (frameH > 0) {
    const fy = total
    frame =
      `<rect x="${f(pad * 0.5)}" y="${f(fy - pad * 0.25)}" width="${f(total - pad)}" height="${f(frameH)}" rx="${f(frameH * 0.25)}" fill="${style.frameColor}"/>` +
      `<text x="${f(total / 2)}" y="${f(fy - pad * 0.25 + frameH * 0.66)}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="${f(frameH * 0.5)}" fill="${contrastInk(style.frameColor)}">${esc(style.frameText)}</text>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" width="${style.size}" height="${Math.round((style.size * height) / total)}" shape-rendering="${style.modules === 'square' ? 'crispEdges' : 'geometricPrecision'}">` +
    (defs ? `<defs>${defs}</defs>` : '') +
    bg +
    `<path fill="${fill}" d="${d}"/>` +
    `<path fill="${eyeFill}" fill-rule="evenodd" d="${eyesOuter}"/>` +
    `<path fill="${eyeFill}" d="${eyesInner}"/>` +
    logo +
    frame +
    `</svg>`
  )
}

/** Blanco o negro según la luminancia del fondo */
export function contrastInk(hex: string): string {
  const v = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [number, number, number]
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.45 ? '#111111' : '#ffffff'
}

export type RasterFormat = 'png' | 'jpg' | 'webp'

export async function rasterizeSvg(svg: string, format: RasterFormat, width: number, bg = '#ffffff'): Promise<Buffer> {
  const img = sharp(Buffer.from(svg), { density: 300 }).resize({ width })
  if (format === 'png') return img.png().toBuffer()
  if (format === 'webp') return img.webp({ quality: 92 }).toBuffer()
  return img.flatten({ background: bg }).jpeg({ quality: 92 }).toBuffer()
}
