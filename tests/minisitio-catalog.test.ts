import { describe, expect, it } from 'vitest'
import { parsePrice } from '../src/modules/bio/blocks-catalog.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { saveSiteConfig } from '../src/modules/minisitio/repo.ts'
import { readSite } from '../src/modules/minisitio/schema.ts'
import { Agent, loginAgent, makeApp, seedUser, setPlan, type TestApp } from './helpers.ts'

async function setup(): Promise<{ t: TestApp; a: Agent; id: number }> {
  const t = await makeApp()
  const u = await seedUser(t)
  setPlan(t, u.id, 'business')
  const a = await loginAgent(t)
  await a.get('/panel/links/new?kind=bio')
  expect((await a.postMultipart('/panel/links?kind=bio', { alias: 'cafe', title: 'Café Tal', is_enabled: '1' })).statusCode).toBe(303)
  const id = findByAlias(t.deps.db, 'cafe')!.id
  saveSiteConfig(t.deps.db, id, readSite({ whatsapp: '5213121234567' }), t.clock.now)
  return { t, a, id }
}

type Row = Record<string, string>
const rows = (name: string, list: Row[]) => {
  const f: Record<string, string> = {}
  list.forEach((r, i) => Object.entries(r).forEach(([k, v]) => (f[`${name}__${i}__${k}`] = v)))
  return f
}
const add = async (a: Agent, id: number, type: string, fields: Record<string, string>, files: { field: string; filename: string; content: Buffer; type?: string }[] = []) => {
  await a.get(`/panel/links/${id}/blocks/new?type=${type}`)
  return a.postMultipart(`/panel/links/${id}/blocks?type=${type}`, { is_enabled: '1', ...fields }, files)
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')

describe('parsePrice', () => {
  it('lee el primer número de un precio escrito a mano', () => {
    expect(parsePrice('$180')).toBe(180)
    expect(parsePrice('desde $1,250.50')).toBe(1250.5)
    expect(parsePrice('90 MXN')).toBe(90)
    expect(parsePrice('Consultar')).toBeNull()
  })
})

describe('Menú', () => {
  const platos: Row[] = [
    { categoria: 'Bebidas', nombre: 'Espresso', descripcion: 'Doble', precio: '$40', etiquetas: 'favorito', disponible: 'si' },
    { categoria: 'Bebidas', nombre: 'Chai', precio: '$55', disponible: 'si' },
    { categoria: 'Comida', nombre: 'Hamburguesa clásica', descripcion: 'Carne, queso', precio: '$90', etiquetas: 'picante, sin gluten', disponible: 'si' },
    { categoria: 'Comida', nombre: 'Pozole', precio: '$120', disponible: 'no' },
  ]
  it('agrupa por categoría, traduce etiquetas, marca agotados y arma el carrito sólo si se pide', async () => {
    const { t, a, id } = await setup()
    expect((await add(a, id, 'menu', { titulo: 'Carta', carrito: '1', ...rows('items', platos) })).statusCode).toBe(303)
    const page = (await a.get('/cafe')).body
    expect(page).toContain('<h3 class="mnu-c">Bebidas</h3>')
    expect(page).toContain('<h3 class="mnu-c">Comida</h3>')
    expect(page).toContain('class="mnu-cats"')
    expect(page).toContain('<span class="mnu-tag">Favorito</span>')
    expect(page).toContain('<span class="mnu-tag">Sin gluten</span>')
    expect(page).toContain('data-price="90"')
    expect(page).toMatch(/Pozole[\s\S]*Agotado/)
    expect(page).toContain('data-cart')
    expect(page).toContain('data-cart-sheet')
    expect(page).toContain('aria-label="Añadir Espresso"')
    expect(page).not.toContain('aria-label="Añadir Pozole"') // agotado: sin botón
    expect(page).toContain('/_/static/js/catalog.js')
    // sin «carrito» no hay controles de pedido
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'menu')!
    await a.get(`/panel/blocks/${b.id}`)
    await a.postMultipart(`/panel/blocks/${b.id}`, { is_enabled: '1', titulo: 'Carta', ...rows('items', platos) })
    const sin = (await a.get('/cafe')).body
    expect(sin).not.toContain('data-cart')
    expect(sin).not.toContain('mnu-add')
  })
  it('con más de 8 platillos ofrece buscador', async () => {
    const { a, id } = await setup()
    const muchos = Array.from({ length: 9 }, (_, i) => ({ categoria: 'Todo', nombre: `Plato ${i + 1}`, precio: '$10', disponible: 'si' }))
    await add(a, id, 'menu', rows('items', muchos))
    expect((await a.get('/cafe')).body).toContain('data-mnu-q')
  })
  it('exige al menos un platillo con nombre', async () => {
    const { a, id } = await setup()
    expect((await add(a, id, 'menu', {})).statusCode).toBe(422)
  })
})

describe('Carta de servicios', () => {
  const servicios: Row[] = [
    { categoria: 'Faciales', nombre: 'Limpieza profunda', descripcion: 'Con vapor', precio: '$650', duracion_min: '60' },
    { categoria: 'Faciales', nombre: 'Hidratante', precio: 'desde $450', duracion_min: '45' },
  ]
  it('muestra duración y, si hay solicitud de WhatsApp, «Agendar» por servicio y la lista precargada', async () => {
    const { a, id } = await setup()
    await add(a, id, 'services', { titulo: 'Servicios', ...rows('items', servicios) })
    const antes = (await a.get('/cafe')).body
    expect(antes).toContain('60 min')
    expect(antes).toContain('45 min')
    expect(antes).not.toContain('data-wa-book') // aún no hay solicitud de WhatsApp en la página
    await add(a, id, 'wa_request', { preset: 'cita', guardar_copia: '1' })
    const page = (await a.get('/cafe')).body
    expect(page).toContain('data-wa-book="Limpieza profunda"')
    expect(page).toContain('<select id="wa')
    expect(page).toContain('<option value="Hidratante">')
    expect(page).toContain('data-preset="cita"')
  })
})

describe('Menú en PDF', () => {
  it('sube el PDF, muestra la tarjeta y lo sirve dentro de la página / como descarga', async () => {
    const { t, a, id } = await setup()
    expect((await add(a, id, 'menu_pdf', { titulo: 'Menú de la casa' }, [{ field: 'file', filename: 'menu.pdf', content: PDF, type: 'application/pdf' }])).statusCode).toBe(303)
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'menu_pdf')!
    const page = await a.get('/cafe')
    expect(page.body).toContain('Menú de la casa')
    expect(page.body).toContain(`data-src="/_/pdf/${b.id}"`)
    expect(page.headers['content-security-policy']).toContain("frame-src 'self'")
    const dl = await a.get(`/_/pdf/${b.id}?download=1`)
    expect(dl.statusCode).toBe(200)
    expect(dl.headers['content-type']).toBe('application/pdf')
    expect(dl.headers['content-disposition']).toContain('attachment')
    const inline = await a.get(`/_/pdf/${b.id}`, { 'sec-fetch-dest': 'iframe' })
    expect(inline.headers['content-disposition']).toContain('inline')
  })
  it('rechaza un archivo que no es PDF', async () => {
    const { a, id } = await setup()
    expect((await add(a, id, 'menu_pdf', {}, [{ field: 'file', filename: 'x.pdf', content: Buffer.from('hola'), type: 'application/pdf' }])).statusCode).toBe(422)
  })
})
