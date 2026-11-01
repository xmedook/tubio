import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Proporción (ancho/alto) del wordmark vigente, leída del viewBox del SVG: si design cambia el logo, las medidas se ajustan solas. */
const svg = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'img', 'brand', 'tubio-logotipo-papel.svg'), 'utf8')
const vb = /viewBox="([-\d.\s]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number) ?? []
export const WORDMARK_RATIO = vb.length === 4 && vb[2]! > 0 && vb[3]! > 0 ? vb[2]! / vb[3]! : 2.71
