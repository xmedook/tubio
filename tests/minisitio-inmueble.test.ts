import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { findProperty } from '../src/modules/bio/blocks-inmueble.ts'
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
  expect((await a.postMultipart('/panel/links?kind=bio', { alias: 'inmob', title: 'Inmobiliaria Sol', is_enabled: '1' })).statusCode).toBe(303)
  const id = findByAlias(t.deps.db, 'inmob')!.id
  saveSiteConfig(t.deps.db, id, readSite({ whatsapp: '5213121234567' }), t.clock.now)
  return { t, a, id }
}
type Row = Record<string, string>
const rows = (name: string, list: Row[]) => {
  const f: Record<string, string> = {}
  list.forEach((r, i) => Object.entries(r).forEach(([k, v]) => (f[`${name}__${i}__${k}`] = v)))
  return f
}
const png = () => sharp({ create: { width: 80, height: 60, channels: 3, background: '#774433' } }).png().toBuffer()
const add = async (a: Agent, id: number, type: string, fields: Record<string, string>, files: { field: string; filename: string; content: Buffer; type?: string }[] = []) => {
  await a.get(`/panel/links/${id}/blocks/new?type=${type}`)
  return a.postMultipart(`/panel/links/${id}/blocks?type=${type}`, { is_enabled: '1', ...fields }, files)
}

const PROPS: Row[] = [
  { titulo: 'Casa en Villa Real', operacion: 'venta', tipo: 'casa', precio: '$3,500,000', recamaras: '3', banos: '2', m2: '180', colonia: 'Villa Real', estado: 'disponible', descripcion: 'Jardín y cochera para 2 autos.' },
  { titulo: 'Depto en el centro', operacion: 'renta', tipo: 'departamento', precio: '$12,000/mes', recamaras: '2', banos: '1', m2: '75', colonia: 'Centro', estado: 'apartada' },
  { titulo: 'Terreno campestre', operacion: 'venta', tipo: 'terreno', precio: '$900,000', m2: '1000', colonia: 'Los Olivos', estado: 'vendida' },
]

describe('Propiedades y ficha automática', () => {
  it('lista con filtros y ficha propia /alias/propiedad/n', async () => {
    const { t, a, id } = await setup()
    expect((await add(a, id, 'listings', { titulo: 'Propiedades', ...rows('items', PROPS) }, [{ field: 'items__0__foto', filename: 'a.png', content: await png(), type: 'image/png' }, { field: 'items__0__foto2', filename: 'b.png', content: await png(), type: 'image/png' }])).statusCode).toBe(303)
    const page = (await a.get('/inmob')).body
    expect(page).toContain('href="/inmob/propiedad/1"')
    expect(page).toContain('href="/inmob/propiedad/3"')
    expect(page).toContain('data-op="renta" data-tipo="departamento" data-rec="2"')
    expect(page).toContain('data-prl-f') // más de 2 propiedades → filtros
    expect(page).toContain('Apartada')
    const ficha = await a.get('/inmob/propiedad/1')
    expect(ficha.statusCode).toBe(200)
    expect(ficha.body).toContain('<h1 class="prd-t">Casa en Villa Real</h1>')
    expect(ficha.body).toContain('$3,500,000')
    expect(ficha.body).toContain('Jardín y cochera para 2 autos.')
    expect(ficha.body).toContain('<title>Casa en Villa Real · Inmobiliaria Sol</title>')
    expect(ficha.body).toContain('rel="canonical" href="http://tubio.test/inmob/propiedad/1"')
    expect(ficha.body).toContain('href="https://wa.me/5213121234567?text=')
    expect((ficha.body.match(/class="prd-gal"/g) ?? []).length).toBe(1)
    expect((ficha.body.match(/<img src="\/_\/u\//g) ?? []).length).toBe(2) // las 2 fotos
    // vendida: sin botón de visita
    const vendida = (await a.get('/inmob/propiedad/3')).body
    expect(vendida).not.toContain('wa.me')
    expect(findProperty(t.deps.db, id, 2)?.prop.titulo).toBe('Depto en el centro')
    // fuera de rango o con formato raro → 404
    expect((await a.get('/inmob/propiedad/9')).statusCode).toBe(404)
    expect((await a.get('/inmob/propiedad/x')).statusCode).toBe(404)
    expect((await a.get('/inmob/propiedad/1/extra')).statusCode).toBe(404)
  })
  it('sin bloque de propiedades no hay ficha; una propiedad oculta (bloque deshabilitado) tampoco', async () => {
    const { t, a, id } = await setup()
    expect((await a.get('/inmob/propiedad/1')).statusCode).toBe(404)
    await add(a, id, 'listings', rows('items', PROPS))
    expect((await a.get('/inmob/propiedad/1')).statusCode).toBe(200)
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'listings')!
    await a.post(`/panel/blocks/${b.id}/toggle`)
    expect((await a.get('/inmob/propiedad/1')).statusCode).toBe(404)
  })
  it('«listing_detail» es interno: no aparece en el selector y no se puede crear a mano', async () => {
    const { a, id } = await setup()
    const pick = await a.get(`/panel/links/${id}/blocks`)
    expect(pick.body).not.toContain('type=listing_detail')
    expect(pick.body).toContain('type=listings')
  })
})

describe('Horario de clases y programas', () => {
  it('agrupa por día, ordena por hora y ofrece «Clase muestra» cuando hay solicitud de WhatsApp', async () => {
    const { a, id } = await setup()
    await add(a, id, 'class_schedule', { titulo: 'Horario', ...rows('items', [
      { nombre: 'Yoga', dia: 'mon', inicio: '18:00', fin: '19:00', instructor: 'Ana', cupo: '12' },
      { nombre: 'Spinning', dia: 'mon', inicio: '07:00', fin: '07:45' },
      { nombre: 'Box', dia: 'wed', inicio: '19:00', fin: '20:00' },
    ]) })
    const antes = (await a.get('/inmob')).body
    expect(antes.indexOf('Spinning')).toBeLessThan(antes.indexOf('Yoga')) // 07:00 antes que 18:00
    expect(antes).toContain('data-day="0"')
    expect(antes).toContain('data-day="2"')
    expect(antes).not.toContain('data-wa-book')
    await add(a, id, 'wa_request', { preset: 'clase', guardar_copia: '1' })
    const page = (await a.get('/inmob')).body
    expect(page).toContain('data-wa-book="Yoga" data-wa-pref="clase"')
    expect(page).toContain('Cupo: 12')
  })
  it('programas con nivel, duración y precio', async () => {
    const { a, id } = await setup()
    await add(a, id, 'programs', { titulo: 'Programas', ...rows('items', [{ nombre: 'Fuerza 12 semanas', descripcion: 'Rutina completa', nivel: 'principiante', duracion: '12 semanas', precio: '$1,200/mes' }]) })
    const page = (await a.get('/inmob')).body
    expect(page).toContain('<h3 class="prg-t">Fuerza 12 semanas</h3>')
    expect(page).toContain('Principiante · 12 semanas · $1,200/mes')
  })
})
