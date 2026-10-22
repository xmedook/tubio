import { readBarcodes } from 'zxing-wasm/reader'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { parseQrStyle, qrMatrix, rasterizeSvg, renderQrSvg } from '../src/lib/qr.ts'

async function decode(svg: string): Promise<string | null> {
  const png = await rasterizeSvg(svg, 'png', 600)
  const r = await readBarcodes(new Blob([new Uint8Array(png)]), { formats: ['QRCode'] })
  return r[0]?.text ?? null
}

// logo de prueba: cuadrado rojo 64×64
async function logo(): Promise<string> {
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#e11d48' } }).png().toBuffer()
  return 'data:image/png;base64,' + png.toString('base64')
}

describe('QR', () => {
  it('matriz con tamaño correcto', () => {
    expect(qrMatrix('hola', 'M').size).toBe(21)
  })

  it('estilo por defecto cuando la entrada es inválida', () => {
    expect(parseQrStyle({ fg: 'red' }).fg).toBe('#111111')
    expect(parseQrStyle({ modules: 'dot' }).modules).toBe('dot')
  })

  const cases: [string, Record<string, unknown>][] = [
    ['cuadrado', {}],
    ['puntos + ojos circulares', { modules: 'dot', eyeOuter: 'circle', eyeInner: 'circle' }],
    ['redondeado + degradado lineal', { modules: 'rounded', eyeOuter: 'rounded', eyeInner: 'rounded', gradient: 'linear', fg: '#1d4ed8', fg2: '#9333ea' }],
    ['vertical + hoja + radial', { modules: 'vertical', eyeOuter: 'leaf', eyeInner: 'diamond', gradient: 'radial' }],
    ['horizontal + marco', { modules: 'horizontal', frame: 'label', frameText: 'Escanéame' }],
    ['rombos, ECC H', { modules: 'diamond', ecc: 'H' }],
  ]
  for (const [name, s] of cases) {
    it(`se puede leer: ${name}`, async () => {
      const text = 'https://tubio.link/prueba-123'
      expect(await decode(renderQrSvg(text, parseQrStyle(s)))).toBe(text)
    })
  }

  it('se puede leer con logo al centro', async () => {
    const text = 'https://tubio.link/con-logo'
    const svg = renderQrSvg(text, parseQrStyle({ modules: 'rounded', logoSize: 22 }), { logoDataUri: await logo() })
    expect(svg).toContain('<image')
    expect(await decode(svg)).toBe(text)
  })

  it('escapa el texto del marco', () => {
    const svg = renderQrSvg('x', parseQrStyle({ frame: 'label', frameText: '<b>&' }))
    expect(svg).toContain('&lt;b&gt;&amp;')
  })

  it('exporta jpg y webp', async () => {
    const svg = renderQrSvg('x', parseQrStyle({}))
    const jpg = await rasterizeSvg(svg, 'jpg', 256)
    const webp = await rasterizeSvg(svg, 'webp', 256)
    expect(jpg.subarray(0, 2).toString('hex')).toBe('ffd8')
    expect(webp.subarray(8, 12).toString()).toBe('WEBP')
  })
})
