import { describe, expect, it } from 'vitest'
import { createBlock, listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { copySite, createPage, createSection, deletePage, deleteSection, ensureSite, groupBlocks, homePage, isClassic, loadSite, sectionsOf } from '../src/modules/minisitio/repo.ts'
import { actionHref } from '../src/modules/minisitio/render.ts'
import { readSectionData, readSite, slugify, SLUG_RE } from '../src/modules/minisitio/schema.ts'
import { Agent, loginAgent, makeApp, seedUser, setPlan, type TestApp } from './helpers.ts'

const norm = (h: string) => h.replace(/nonce="[^"]+"/g, 'nonce="N"').replace(/name="_csrf" value="[^"]+"/g, '')

const BLOCK = (text: string) => ({ type: 'heading', is_enabled: true, starts_at: null, ends_at: null, data: { text, size: 'h2' }, style: {} })

async function setup(): Promise<{ t: TestApp; a: Agent; id: number }> {
  const t = await makeApp()
  const u = await seedUser(t)
  setPlan(t, u.id, 'business')
  const a = await loginAgent(t)
  await a.get('/panel/links/new?kind=bio')
  const res = await a.postMultipart('/panel/links?kind=bio', { alias: 'clinica', title: 'Clínica Sol', is_enabled: '1' })
  expect(res.statusCode).toBe(303)
  const id = findByAlias(t.deps.db, 'clinica')!.id
  return { t, a, id }
}

describe('esquemas', () => {
  it('slugify y SLUG_RE', () => {
    expect(slugify('Menú del Día!')).toBe('menu-del-dia')
    expect(SLUG_RE.test('menu-1')).toBe(true)
    expect(SLUG_RE.test('_x')).toBe(false)
    expect(SLUG_RE.test('-x')).toBe(false)
    expect(SLUG_RE.test('a'.repeat(41))).toBe(false)
  })
  it('lee configuración dañada campo por campo', () => {
    const c = readSite({ whatsapp: 'abc', cabecera: { activa: true, nav: 'zzz' }, pie: 5 })
    expect(c.whatsapp).toBe('')
    expect(c.cabecera.activa).toBe(false) // cabecera inválida entera → por defecto
    expect(c.pie.activo).toBe(false)
    expect(readSectionData({ ancho: 'enorme', columnas: 9 }).ancho).toBe('normal')
  })
  it('acciones: destino por tipo', () => {
    const site = { config: readSite({ whatsapp: '5213121234567' }), pages: [{ id: 1, link_id: 1, slug: '', title: '', position: 0, is_enabled: 1, data: { seo_title: '', seo_description: '', seo_image: null } }, { id: 2, link_id: 1, slug: 'menu', title: 'Menú', position: 1, is_enabled: 1, data: { seo_title: '', seo_description: '', seo_image: null } }], sections: [], materialized: true }
    expect(actionHref({ tipo: 'whatsapp', destino: '', mensaje: 'Hola mundo' }, site, 'x')).toBe('https://wa.me/5213121234567?text=Hola%20mundo')
    expect(actionHref({ tipo: 'llamar', destino: '+52 312 000', mensaje: '' }, site, 'x')).toBe('tel:+52312000')
    expect(actionHref({ tipo: 'pagina', destino: 'menu', mensaje: '' }, site, 'x')).toBe('/x/menu')
    expect(actionHref({ tipo: 'pagina', destino: 'no-existe', mensaje: '' }, site, 'x')).toBeNull()
    expect(actionHref({ tipo: 'enlace', destino: 'javascript:alert(1)', mensaje: '' }, site, 'x')).toBeNull()
    expect(actionHref({ tipo: 'ancla', destino: '#servicios', mensaje: '' }, site, 'x')).toBe('#servicios')
  })
})

describe('bio de siempre', () => {
  it('sin filas de sitio es un sitio clásico y se ve igual', async () => {
    const { t, a, id } = await setup()
    createBlock(t.deps.db, id, BLOCK('Hola'), t.clock.now)
    const site = loadSite(t.deps.db, id)
    expect(site.materialized).toBe(false)
    expect(isClassic(site)).toBe(true)
    const res = await a.get('/clinica')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<main class="col"')
    expect(res.body).not.toContain('site.css')
    expect(res.body).toContain('Hola')
  })
  it('una subpágina en una bio clásica es 404', async () => {
    const { t, a } = await setup()
    expect((await a.get('/clinica/menu')).statusCode).toBe(404)
    expect((await t.app.inject({ method: 'GET', url: '/clinica/' })).statusCode).toBe(301)
  })
  it('activar el sitio no cambia lo que se ve: ensureSite asigna los bloques a la sección clásica', async () => {
    const { t, a, id } = await setup()
    createBlock(t.deps.db, id, BLOCK('Uno'), t.clock.now)
    createBlock(t.deps.db, id, BLOCK('Dos'), t.clock.now)
    const antes = (await a.get('/clinica')).body
    const site = ensureSite(t.deps.db, id, t.clock.now)
    expect(site.materialized).toBe(true)
    expect(isClassic(site)).toBe(true)
    expect(listBlocks(t.deps.db, id).every((b) => b.section_id === site.sections[0]!.id)).toBe(true)
    const despues = (await a.get('/clinica')).body
    expect(norm(despues)).toBe(norm(antes))
    expect(despues).toContain('<main class="col"')
  })
})

describe('páginas y secciones', () => {
  it('crea páginas con su sección y sirve /alias/pagina', async () => {
    const { t, a, id } = await setup()
    createBlock(t.deps.db, id, BLOCK('Inicio texto'), t.clock.now)
    ensureSite(t.deps.db, id, t.clock.now)
    const p = createPage(t.deps.db, id, { slug: 'menu', title: 'Menú', is_enabled: true, data: { seo_title: 'Menú del día', seo_description: 'Platillos', seo_image: null } }, t.clock.now)
    if (typeof p === 'string') throw new Error(p)
    const sec = sectionsOf(loadSite(t.deps.db, id), p.id)[0]!
    createBlock(t.deps.db, id, BLOCK('Sopa de la casa'), t.clock.now, sec.id)
    const home = await a.get('/clinica')
    const menu = await a.get('/clinica/menu')
    expect(menu.statusCode).toBe(200)
    expect(menu.body).toContain('Sopa de la casa')
    expect(menu.body).not.toContain('Inicio texto')
    expect(home.body).toContain('Inicio texto')
    expect(home.body).not.toContain('Sopa de la casa')
    expect(menu.body).toContain('<title>Menú del día</title>')
    expect(menu.body).toContain('rel="canonical" href="http://tubio.test/clinica/menu"')
    expect(menu.body).toContain('site.css')
  })
  it('slug repetido, tope y página oculta', async () => {
    const { t, a, id } = await setup()
    ensureSite(t.deps.db, id, t.clock.now)
    const mk = (slug: string, on = true) => createPage(t.deps.db, id, { slug, title: slug, is_enabled: on, data: { seo_title: '', seo_description: '', seo_image: null } }, t.clock.now)
    expect(typeof mk('a')).toBe('object')
    expect(mk('a')).toBe('taken')
    const oculta = mk('privada', false)
    expect(typeof oculta).toBe('object')
    expect((await a.get('/clinica/privada')).statusCode).toBe(404)
    for (let i = 0; i < 12; i++) mk(`p${i}`)
    expect(mk('otra')).toBe('limit')
  })
  it('borrar una página borra sus bloques; la de inicio no se borra', async () => {
    const { t, id } = await setup()
    ensureSite(t.deps.db, id, t.clock.now)
    const p = createPage(t.deps.db, id, { slug: 'x', title: 'X', is_enabled: true, data: { seo_title: '', seo_description: '', seo_image: null } }, t.clock.now) as { id: number }
    const sec = sectionsOf(loadSite(t.deps.db, id), p.id)[0]!
    createBlock(t.deps.db, id, BLOCK('adios'), t.clock.now, sec.id)
    expect(deletePage(t.deps.db, p.id)).toBe(true)
    expect(listBlocks(t.deps.db, id).some((b) => b.data.text === 'adios')).toBe(false)
    expect(deletePage(t.deps.db, homePage(loadSite(t.deps.db, id)).id)).toBe(false)
  })
  it('una página siempre conserva al menos una sección', async () => {
    const { t, id } = await setup()
    const site = ensureSite(t.deps.db, id, t.clock.now)
    const only = site.sections[0]!
    expect(deleteSection(t.deps.db, only.id)).toBe(false)
    const extra = createSection(t.deps.db, only.page_id, readSectionData({ titulo: 'Servicios', ancla: 'servicios' }), t.clock.now)
    if (typeof extra === 'string') throw new Error(extra)
    expect(deleteSection(t.deps.db, only.id)).toBe(true)
  })
  it('bloques sueltos (section_id NULL) caen en la primera sección de inicio', async () => {
    const { t, id } = await setup()
    ensureSite(t.deps.db, id, t.clock.now)
    createBlock(t.deps.db, id, BLOCK('suelto'), t.clock.now) // como lo haría la API o una plantilla
    const site = loadSite(t.deps.db, id)
    const g = groupBlocks(site, listBlocks(t.deps.db, id))
    expect(g.get(sectionsOf(site, homePage(site).id)[0]!.id)!.map((b) => b.data.text)).toContain('suelto')
  })
})

describe('cabecera, barra y pie', () => {
  it('se renderizan con navegación generada de las anclas', async () => {
    const { t, a, id } = await setup()
    await a.get(`/panel/links/${id}/site`)
    const res = await a.postMultipart(`/panel/links/${id}/site`, {
      whatsapp: '5213121234567',
      cab_activa: '1', cab_nombre: 'Clínica Sol', cab_nav: 'auto',
      cta_texto: 'Agendar', cta_tipo: 'whatsapp', cta_destino: '', cta_mensaje: 'Quiero una cita',
      bar_activa: '1', bar_0_texto: 'Agendar', bar_0_tipo: 'whatsapp', bar_1_texto: 'Cómo llegar', bar_1_tipo: 'ancla', bar_1_destino: 'ubicacion',
      pie_activo: '1', pie_servicios: 'Consulta general', pie_direccion: 'Colima, Col.',
    })
    expect(res.statusCode).toBe(303)
    const site0 = loadSite(t.deps.db, id)
    const sid = site0.materialized ? site0.sections[0]!.id : ensureSite(t.deps.db, id, t.clock.now).sections[0]!.id
    const s2 = createSection(t.deps.db, ensureSite(t.deps.db, id, t.clock.now).pages[0]!.id, readSectionData({ titulo: 'Dónde estamos', ancla: 'ubicacion', fondo: 'color', color: '#112233' }), t.clock.now)
    if (typeof s2 === 'string') throw new Error(s2)
    createBlock(t.deps.db, id, BLOCK('Av. Siempre Viva'), t.clock.now, s2.id)
    void sid
    const html = (await a.get('/clinica')).body
    expect(html).toContain('class="ms-bar"')
    expect(html).toContain('href="https://wa.me/5213121234567?text=Quiero%20una%20cita"')
    expect(html).toContain('<a href="#ubicacion">Dónde estamos</a>')
    expect(html).toContain('id="ubicacion"')
    expect(html).toContain('class="ms-dock n2"')
    expect(html).toContain('Consulta general')
    expect(html).toContain('#s' + s2.id + '{background:#112233;color:#ffffff')
    expect(html).toContain('<h1 class="ms-h">Dónde estamos</h1>')
    expect(html).toContain('body class="bio')
    expect(html).toMatch(/class="bio [^"]*ms has-bar has-dock"/)
  })
  it('rechaza destinos inválidos', async () => {
    const { a, id } = await setup()
    await a.get(`/panel/links/${id}/site`)
    const res = await a.postMultipart(`/panel/links/${id}/site`, { cta_texto: 'X', cta_tipo: 'enlace', cta_destino: 'javascript:alert(1)' })
    expect(res.statusCode).toBe(422)
    const res2 = await a.postMultipart(`/panel/links/${id}/site`, { whatsapp: '12' })
    expect(res2.statusCode).toBe(422)
  })
})

describe('editor', () => {
  it('añade página, sección y bloque en esa sección desde el panel', async () => {
    const { t, a, id } = await setup()
    expect((await a.get(`/panel/links/${id}/site`)).statusCode).toBe(200)
    const add = await a.post(`/panel/links/${id}/site/pages`, { title: 'Menú del día', slug: '' })
    expect(add.statusCode).toBe(303)
    const site = loadSite(t.deps.db, id)
    const page = site.pages.find((p) => p.slug === 'menu-del-dia')!
    expect(page.title).toBe('Menú del día')
    expect((await a.get(`/panel/ms/pages/${page.id}`)).statusCode).toBe(200)
    const sec = sectionsOf(site, page.id)[0]!
    expect((await a.get(`/panel/ms/sections/${sec.id}`)).statusCode).toBe(200)
    const save = await a.postMultipart(`/panel/ms/sections/${sec.id}`, { titulo: 'Entradas', ancla: 'Entradas', fondo: 'degradado', color: '#aa0000', color2: '#0000aa', angulo: '90', alto: 'media', ancho: 'ancho', columnas: '2', alinear: 'centro', is_enabled: '1' })
    expect(save.statusCode).toBe(303)
    const d = sectionsOf(loadSite(t.deps.db, id), page.id)[0]!.data
    expect(d).toMatchObject({ titulo: 'Entradas', ancla: 'entradas', fondo: 'degradado', alto: 'media', ancho: 'ancho', columnas: 2, alinear: 'centro', classic: false })
    // selector de bloque y alta en la sección
    expect((await a.get(`/panel/links/${id}/blocks/pick?s=${sec.id}`)).body).toContain(`blocks/new?type=heading&amp;s=${sec.id}`)
    const form = await a.get(`/panel/links/${id}/blocks/new?type=heading&s=${sec.id}`)
    expect(form.body).toContain(`<option value="${sec.id}" selected>`)
    const created = await a.postMultipart(`/panel/links/${id}/blocks?type=heading`, { text: 'Ceviche', size: 'h2', is_enabled: '1', section_id: String(sec.id) })
    expect(created.statusCode).toBe(303)
    expect(created.headers.location).toBe(`/panel/links/${id}/blocks?p=${page.id}#s${sec.id}`)
    expect(listBlocks(t.deps.db, id).find((b) => b.data.text === 'Ceviche')?.section_id).toBe(sec.id)
    const ed = await a.get(`/panel/links/${id}/blocks?p=${page.id}`)
    expect(ed.body).toContain('Ceviche')
    expect(ed.body).toContain('ms-seccard')
    expect((await a.get('/clinica/menu-del-dia')).body).toContain('Ceviche')
  })
  it('no deja tocar sitios ajenos', async () => {
    const { t, a, id } = await setup()
    ensureSite(t.deps.db, id, t.clock.now)
    const page = loadSite(t.deps.db, id).pages[0]!
    await seedUser(t, 'otro@example.com')
    const b = await loginAgent(t, 'otro@example.com')
    expect((await b.get(`/panel/ms/pages/${page.id}`)).statusCode).toBe(404)
    expect((await b.get(`/panel/links/${id}/site`)).statusCode).toBe(404)
    expect((await b.post(`/panel/ms/pages/${page.id}/delete`)).statusCode).toBe(404)
  })
  it('mover un bloque no cruza a otra sección', async () => {
    const { t, a, id } = await setup()
    const site = ensureSite(t.deps.db, id, t.clock.now)
    const s2 = createSection(t.deps.db, site.pages[0]!.id, readSectionData({ titulo: 'B' }), t.clock.now) as { id: number }
    const b1 = createBlock(t.deps.db, id, BLOCK('a1'), t.clock.now, site.sections[0]!.id)
    createBlock(t.deps.db, id, BLOCK('b1'), t.clock.now, s2.id)
    const b2 = createBlock(t.deps.db, id, BLOCK('a2'), t.clock.now, site.sections[0]!.id)
    await a.get(`/panel/links/${id}/blocks`)
    await a.post(`/panel/blocks/${b2.id}/move`, { dir: 'up' })
    const order = listBlocks(t.deps.db, id).map((b) => b.data.text)
    expect(order.indexOf('a2')).toBeLessThan(order.indexOf('a1'))
    // b1 vive en otra sección: su lugar y el de sus vecinos de sección no se mezclan
    const sec = (txt: string) => listBlocks(t.deps.db, id).find((b) => b.data.text === txt)!.section_id
    expect(sec('a1')).toBe(site.sections[0]!.id)
    expect(sec('a2')).toBe(site.sections[0]!.id)
    expect(sec('b1')).toBe(s2.id)
    void b1
  })
})

describe('duplicar', () => {
  it('copia páginas, secciones y reubica los bloques', async () => {
    const { t, a, id } = await setup()
    const site = ensureSite(t.deps.db, id, t.clock.now)
    createBlock(t.deps.db, id, BLOCK('home'), t.clock.now, site.sections[0]!.id)
    const p = createPage(t.deps.db, id, { slug: 'menu', title: 'Menú', is_enabled: true, data: { seo_title: '', seo_description: '', seo_image: null } }, t.clock.now) as { id: number }
    createBlock(t.deps.db, id, BLOCK('plato'), t.clock.now, sectionsOf(loadSite(t.deps.db, id), p.id)[0]!.id)
    const res = await a.post(`/panel/links/${id}/duplicate`)
    expect(res.statusCode).toBe(303)
    const copy = findByAlias(t.deps.db, 'clinica-copia')!
    const s2 = loadSite(t.deps.db, copy.id)
    expect(s2.pages.map((x) => x.slug)).toEqual(['', 'menu'])
    const blocks = listBlocks(t.deps.db, copy.id)
    expect(blocks).toHaveLength(listBlocks(t.deps.db, id).length)
    expect(blocks.every((b) => s2.sections.some((s) => s.id === b.section_id))).toBe(true)
    expect(blocks.find((b) => b.data.text === 'plato')!.section_id).toBe(sectionsOf(s2, s2.pages[1]!.id)[0]!.id)
    expect((await a.get('/clinica-copia/menu')).body).toContain('plato')
    expect(copySite(t.deps.db, 99999, copy.id, t.clock.now)).toBe(false)
  })
})
