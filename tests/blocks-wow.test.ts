import { describe, expect, it } from 'vitest'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { highlight } from '../src/modules/bio/blocks.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

describe('bloques de cifra, fichas y pasos; marco, giro y fuentes de títulos', () => {
  it('se crean desde el panel y se pintan; cada ficha redirige a su propio enlace', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'wow', title: 'W', is_enabled: '1' })
    const id = findByAlias(t.deps.db, 'wow')!.id
    await a.get(`/panel/links/${id}/blocks/new?type=stat`)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=stat`, { kicker: 'Fundadores', value: '10', title: 'lugares', button: 'Quiero', url: 'https://ejemplo.mx/f', layout: 'stack', style_frame: 'hard', style_tilt: '-1', is_enabled: '1' })).statusCode).toBe(303)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=chips`, { items__0__label: 'Dental', items__0__url: 'https://ejemplo.mx/dental', items__1__label: 'Taller', items__1__url: 'https://ejemplo.mx/taller', is_enabled: '1' })).statusCode).toBe(303)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=steps`, { items__0__num: '1', items__0__label: 'materiales', items__1__num: '7', items__1__label: 'en línea', is_enabled: '1' })).statusCode).toBe(303)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=chips`, { items__0__label: 'x', items__0__url: 'javascript:alert(1)', is_enabled: '1' })).statusCode).toBe(422)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=heading`, { text: 'Tu página, ==en 7 días== hábiles', level: 'h1', is_enabled: '1' })).statusCode).toBe(303)

    const all = listBlocks(t.deps.db, id)
    const stat = all.find((b) => b.type === 'stat')
    const chips = all.find((b) => b.type === 'chips')
    expect(stat!.style).toMatchObject({ frame: 'hard', tilt: -1 })
    const page = (await new Agent(t.app).get('/wow')).body
    expect(page).toContain('fr-hard tilt-n1')
    expect(page).toContain('class="stat-v">10<')
    expect(page).toContain(`href="/_/c/${chips!.id}?to=1"`)
    expect(page).toContain('<mark class="hl">en 7 días</mark>')
    expect(page).toContain('materiales')

    const r = await new Agent(t.app).get(`/_/c/${chips!.id}?to=1`)
    expect(r.statusCode).toBe(302)
    expect(r.headers.location).toBe('https://ejemplo.mx/taller')
    expect((await new Agent(t.app).get(`/_/c/${chips!.id}?to=9`)).statusCode).toBe(404)
  })

  it('el resaltador escapa el HTML', () => {
    expect(highlight('a ==<b>x</b>== c').value).toBe('a <mark class="hl">&lt;b&gt;x&lt;/b&gt;</mark> c')
  })

  it('fuentes de títulos y cifras sólo cargan lo que usa la página', async () => {
    const { pageCss } = await import('../src/modules/bio/render.ts')
    const { readDesign } = await import('../src/modules/bio/design.ts')
    const css = pageCss(readDesign({ font: 'schibsted', font_heading: 'familjen', font_num: 'chivo' }), [])
    expect(css).toContain('familjen-grotesk-latin-wght-normal.woff2')
    expect(css).toContain('chivo-latin-900-normal.woff2')
    expect(css).not.toContain('inter-latin')
    expect((await (await makeApp()).app.inject({ url: '/_/fonts/chivo-latin-900-normal.woff2' })).statusCode).toBe(200)
  })
})
