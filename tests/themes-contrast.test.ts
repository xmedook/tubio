import { describe, expect, it } from 'vitest'
import { THEMES } from '../src/modules/bio/design.ts'

// WCAG 2.x: luminancia relativa y razón de contraste
function lum(hex: string): number {
  const n = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number)
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

/** Color de un botón posiblemente translúcido, ya compuesto sobre el fondo */
function over(color: string, bg: string): string {
  if (color === 'transparent') return bg
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color)
  if (!m) return color
  const a = Number(m[4])
  const b = [0, 2, 4].map((i) => parseInt(bg.slice(1 + i, 3 + i), 16))
  return '#' + [1, 2, 3].map((i) => Math.round(Number(m[i]) * a + (b[i - 1] as number) * (1 - a)).toString(16).padStart(2, '0')).join('')
}

describe('temas: contraste AA', () => {
  for (const th of THEMES) {
    it(th.id, () => {
      // cada color del fondo (todos los puntos del degradado) contra el texto y contra el botón
      for (const c of th.bg.match(/#[0-9a-f]{6}/gi) ?? []) {
        expect(ratio(c, th.text), `texto sobre ${c}`).toBeGreaterThanOrEqual(4.5)
        expect(ratio(over(th.btnBg, c), th.btnText), `botón sobre ${c}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
