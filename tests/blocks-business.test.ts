import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { openNow } from '../src/modules/bio/blocks-business.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36' }
const png = (c: string) => sharp({ create: { width: 120, height: 90, channels: 3, background: c } }).png().toBuffer()

async function page() {
  const t = await makeApp()
  await seedUser(t)
  const a = await loginAgent(t)
  await a.get('/panel/links/new?kind=bio')
  await a.postMultipart('/panel/links?kind=bio', { alias: 'negocio', title: 'Mi negocio', is_enabled: '1' })
  const id = findByAlias(t.deps.db, 'negocio')!.id
  await a.get(`/panel/links/${id}/blocks`)
  return { t, a, id }
}

describe('horario', () => {
  it('abierto ahora, también pasando medianoche', () => {
    // jueves 22-oct-2026 12:00 en CDMX = 18:00 UTC
    const noon = Date.UTC(2026, 9, 22, 18)
    expect(openNow([{ day: 'thu', open: '09:00', close: '18:00' }], 'America/Mexico_City', noon)).toBe(true)
    expect(openNow([{ day: 'thu', open: '13:00', close: '18:00' }], 'America/Mexico_City', noon)).toBe(false)
    // viernes 01:30 CDMX, abierto jue 20:00–02:00
    expect(openNow([{ day: 'thu', open: '20:00', close: '02:00' }], 'America/Mexico_City', Date.UTC(2026, 9, 23, 7, 30))).toBe(true)
  })
})

describe('bloques de negocio', () => {
  it('se crean desde el formulario y se pintan', async () => {
    const { t, a, id } = await page()
    const cases: [string, Record<string, string>, { field: string; filename: string; content: Buffer; type: string }[]?][] = [
      ['faq', { items__0__q: '¿Envían?', items__0__a: '**Sí**, a todo México', items__1__q: '¿Factura?', items__1__a: 'Claro' }],
      ['hours', { title: 'Tienda', timezone: 'America/Mexico_City', items__0__day: 'wed', items__0__open: '09:00', items__0__close: '18:00' }],
      ['reviews', { items__0__name: 'Luis', items__0__text: 'Excelente', items__0__rating: '4' }],
      ['timeline', { items__0__date: '2020', items__0__title: 'Abrimos' }],
      ['counter', { value: '1500', prefix: '+', suffix: ' clientes', label: 'felices' }],
      ['countdown', { target: '2026-10-25T12:00', label: 'Lanzamiento' }],
      ['coupon', { code: 'OTONO15', title: '15% de descuento' }],
      ['product', { name: 'Taza', price: '199.5', currency: 'MXN', url: 'https://tienda.mx/taza' }, [{ field: 'image', filename: 'a.png', content: await png('#f00'), type: 'image/png' }]],
      ['gallery', { columns: '3' }, [{ field: 'images', filename: 'a.png', content: await png('#0f0'), type: 'image/png' }, { field: 'images', filename: 'b.png', content: await png('#00f'), type: 'image/png' }]],
      ['carousel', {}, [{ field: 'images', filename: 'c.png', content: await png('#ff0'), type: 'image/png' }]],
      ['before_after', { before_label: 'Antes', after_label: 'Ahora' }, [{ field: 'before', filename: 'a.png', content: await png('#111'), type: 'image/png' }, { field: 'after', filename: 'b.png', content: await png('#eee'), type: 'image/png' }]],
      ['modal', { label: 'Política de envíos', text: 'Enviamos en 24 h' }],
      ['vcard_button', { first_name: 'Ana', email: 'ana@ana.mx', url: 'ana.mx' }],
      ['file_button', { label: 'Descargar menú' }, [{ field: 'file', filename: 'menú.pdf', content: Buffer.from('%PDF-1.4 hola'), type: 'application/pdf' }]],
    ]
    for (const [type, fields, files] of cases) {
      const r = await a.postMultipart(`/panel/links/${id}/blocks?type=${type}`, { ...fields, is_enabled: '1' }, files ?? [])
      expect(r.statusCode, `${type}: ${(r.body.match(/role="alert">[^<]*/g) ?? []).join('|')}`).toBe(303)
    }
    const html = (await new Agent(t.app).get('/negocio', UA)).body
    expect(html).toContain('<summary>¿Envían?</summary>')
    expect(html).toContain('<strong>Sí</strong>')
    expect(html).toMatch(/Abierto ahora|Cerrado ahora/)
    expect(html).toContain('+1,500 clientes')
    expect(html).toContain('data-countdown=')
    expect(html).toContain('data-copy="OTONO15"')
    expect(html).toContain('$199.50')
    expect((html.match(/class="gallery cols-3"/g) ?? []).length).toBe(1)
    expect(html).toContain('data-ba')
    const blocks = listBlocks(t.deps.db, id)
    const vc = blocks.find((b) => b.type === 'vcard_button')!
    const vcf = await new Agent(t.app).get(`/_/vcf/${vc.id}`, UA)
    expect(vcf.headers['content-type']).toContain('text/vcard')
    expect(vcf.body).toContain('EMAIL;TYPE=INTERNET:ana@ana.mx')
    const fb = blocks.find((b) => b.type === 'file_button')!
    const dl = await new Agent(t.app).get(`/_/dl/${fb.id}`, UA)
    expect(dl.headers['content-disposition']).toContain('attachment')
    expect(dl.body).toBe('%PDF-1.4 hola')
    expect(listBlocks(t.deps.db, id).find((b) => b.type === 'file_button')!.clicks).toBe(1)
    // la vista previa de bloques ajenos por /_/dl con otro tipo no funciona
    expect((await new Agent(t.app).get(`/_/dl/${vc.id}`, UA)).statusCode).toBe(404)
  })

  it('galería: quitar y agregar imágenes; no se pueden adoptar imágenes ajenas', async () => {
    const { t, a, id } = await page()
    await a.postMultipart(`/panel/links/${id}/blocks?type=gallery`, { is_enabled: '1', columns: '2' }, [
      { field: 'images', filename: 'a.png', content: await png('#0f0'), type: 'image/png' },
      { field: 'images', filename: 'b.png', content: await png('#00f'), type: 'image/png' },
    ])
    const g = listBlocks(t.deps.db, id).find((b) => b.type === 'gallery')!
    const [k1, k2] = g.data.images as string[]
    await a.get(`/panel/blocks/${g.id}`)
    await a.postMultipart(`/panel/blocks/${g.id}`, { is_enabled: '1', columns: '2', images__keep: `${k1},${k2},ajena.webp`, [`images__remove__${k1}`]: '1' })
    expect(listBlocks(t.deps.db, id).find((b) => b.id === g.id)!.data.images).toEqual([k2])
  })

  it('filas: campos obligatorios y mínimo una', async () => {
    const { a, id } = await page()
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=faq`, { is_enabled: '1' })).statusCode).toBe(422)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=faq`, { is_enabled: '1', items__0__q: 'Sin respuesta' })).statusCode).toBe(422)
  })
})
