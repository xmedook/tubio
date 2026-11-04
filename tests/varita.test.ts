import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aiConfig } from '../src/lib/ai.ts'
import { contrast, palette, realBlock } from '../src/modules/varita/build.ts'
import { mockPlan } from '../src/modules/varita/mock.ts'
import { normalizePlan } from '../src/modules/varita/plan.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { loadSite } from '../src/modules/minisitio/repo.ts'
import { Agent, loginAgent, makeApp, seedUser, setPlan } from './helpers.ts'

const DESC = 'Taquería Los Compadres, en Zapopan. Tacos al pastor y gringas. WhatsApp 3312345678.'
const lines = (body: string) => body.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>)

describe('varita: sitio con IA desde una descripción', () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.TUBIO_AI_PROVIDER = 'mock'
    process.env.TUBIO_AI_DAILY = '2'
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it('configuración: sin llave queda apagada; «mock» no la necesita', () => {
    expect(aiConfig({}).provider).toBe('off')
    expect(aiConfig({ TUBIO_AI_PROVIDER: 'anthropic' }).provider).toBe('off')
    expect(aiConfig({ TUBIO_AI_KEY: 'k' }).provider).toBe('anthropic')
    expect(aiConfig({ TUBIO_AI_PROVIDER: 'mock' }).provider).toBe('mock')
    expect(aiConfig({ TUBIO_AI_KEY: 'k' }).model).toBe('claude-opus-5-5')
  })

  it('arma el sitio, informa el avance en líneas y lleva a la página de listo', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    setPlan(t, u.id, 'business')
    const a = await loginAgent(t)
    const page = await a.get('/panel/varita')
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('data-varita-form')
    const r = await a.postJson('/panel/varita', { description: DESC, whatsapp: '33 1234 5678' })
    expect(r.statusCode).toBe(200)
    const out = lines(r.body)
    expect(out.map((o) => o.s).filter(Boolean)).toEqual(expect.arrayContaining(['reading', 'style', 'cover', 'section', 'done']))
    // lo que se pinta en vivo: nombre y colores, titular y cada sección
    const peeks = out.map((o) => o.peek as Record<string, string> | undefined).filter(Boolean)
    expect(peeks.some((p) => p!.nombre && /^#[0-9a-f]{6}$/.test(p!.c1!))).toBe(true)
    expect(peeks.some((p) => p!.titulo)).toBe(true)
    expect(peeks.filter((p) => p!.seccion).length).toBeGreaterThanOrEqual(2)
    const last = out.at(-1)!
    expect(last.ok).toBe(true)
    const link = findByAlias(t.deps.db, 'taqueria-los-compadres')!
    expect(link).toBeTruthy()
    expect(last.go).toBe(`/panel/varita/listo/${link.id}`)
    const site = loadSite(t.deps.db, link.id)
    expect(site.sections.length).toBeGreaterThanOrEqual(4)
    expect(site.config.whatsapp).toBe('523312345678')
    const pub = await new Agent(t.app).get('/taqueria-los-compadres')
    expect(pub.statusCode).toBe(200)
    expect(pub.body).toContain('Taquería Los Compadres')
    expect((await a.get(String(last.go))).statusCode).toBe(200)
    // el editor dice qué falta: logo y foto (la IA no los pone); el WhatsApp ya está
    const ed = (await a.get(`/panel/links/${link.id}/site`)).body
    expect(ed).toContain('class="todos"')
    expect(ed).toContain('Sube tu logo')
    expect(ed).toMatch(/<li class="done">[^]*?Agrega tu WhatsApp/)
    // el mismo nombre otra vez: otra dirección, no choca
    const r2 = lines((await a.postJson('/panel/varita', { description: DESC })).body).at(-1)!
    expect(r2.ok).toBe(true)
    expect(findByAlias(t.deps.db, 'taqueria-los-compadres-2')).toBeTruthy()
  })

  it('tope diario por persona, descripción muy corta, IA apagada y CSRF', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    setPlan(t, u.id, 'business')
    const a = await loginAgent(t)
    await a.get('/panel/varita')
    expect((await a.postJson('/panel/varita', { description: 'tacos' })).statusCode).toBe(422)
    for (let i = 0; i < 2; i++) expect(lines((await a.postJson('/panel/varita', { description: DESC })).body).at(-1)!.ok).toBe(true)
    const q = await a.postJson('/panel/varita', { description: DESC })
    expect(q.statusCode).toBe(429)
    expect(lines(q.body)[0]!.error).toBe('varita.err_quota')
    process.env.TUBIO_AI_PROVIDER = 'off'
    expect((await a.postJson('/panel/varita', { description: DESC })).statusCode).toBe(503)
    process.env.TUBIO_AI_PROVIDER = 'mock'
    const sin = await t.app.inject({ method: 'POST', url: '/panel/varita', payload: { description: DESC }, headers: { cookie: a.cookieHeader() } })
    expect(sin.statusCode).toBe(403)
  })

  it('colores: lo que proponga la IA se ajusta hasta tener contraste AA', () => {
    const p = normalizePlan({ ...mockPlan(DESC), estilo: { ...mockPlan(DESC).estilo, color_principal: '#ffff00', color_secundario: '#eeeeee', color_suave: '#333333' } })
    const c = palette(p)
    expect(contrast(c.c1, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c.c2, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c.suave, '#111111')).toBeGreaterThanOrEqual(4.5)
  })

  it('limpieza: hex inválidos, anclas repetidas o reservadas y acciones a destinos que no existen', () => {
    const base = mockPlan(DESC)
    const p = normalizePlan({
      ...base,
      estilo: { ...base.estilo, color_principal: 'rojo' },
      secciones: [base.secciones[0]!, { ...base.secciones[0]!, ancla: 'Ubicación' }, { ...base.secciones[1]!, ancla: 'oferta' }],
      acciones: [...base.acciones, { titulo: 'Fantasma', subtitulo: '', tipo: 'ancla', destino: 'no-existe', mensaje: '', principal: false }, { titulo: 'Página', subtitulo: '', tipo: 'pagina', destino: 'menu', mensaje: '', principal: false }],
      paginas: [{ slug: 'panel', titulo: 'Panel', descripcion: '', bloque: base.secciones[0]!.bloque }],
    })
    expect(p.estilo.color_principal).toBe('#1f2937')
    const anclas = p.secciones.map((s) => s.ancla)
    expect(new Set(anclas).size).toBe(anclas.length)
    expect(anclas).not.toContain('ubicacion')
    expect(p.paginas).toHaveLength(0)
    expect(p.acciones.map((x) => x.titulo)).not.toContain('Fantasma')
    expect(p.acciones.map((x) => x.titulo)).not.toContain('Página')
  })

  it('cada tipo de bloque del plan se vuelve un bloque real; los vacíos no se crean', () => {
    const item = { titulo: '1', descripcion: 'Escribes', precio: '', categoria: '' }
    const b = { texto: 'x', items: [item, item], preguntas: [{ pregunta: '¿?', respuesta: 'sí' }], cifra: '12' }
    expect(realBlock({ ...b, tipo: 'servicios' })?.type).toBe('services')
    expect(realBlock({ ...b, tipo: 'menu' })?.type).toBe('menu')
    expect(realBlock({ ...b, tipo: 'preguntas' })?.type).toBe('faq')
    expect(realBlock({ ...b, tipo: 'lista' })?.type).toBe('list')
    expect(realBlock({ ...b, tipo: 'confianza' })?.type).toBe('trust_line')
    expect(realBlock({ ...b, tipo: 'texto' })?.type).toBe('paragraph')
    expect(realBlock({ ...b, tipo: 'cifra' })?.type).toBe('stat')
    expect(realBlock({ ...b, tipo: 'pasos' })?.type).toBe('steps')
    expect(realBlock({ ...b, tipo: 'cifra', cifra: '' })).toBeNull()
    expect(realBlock({ ...b, tipo: 'menu', items: [] })).toBeNull()
  })
})
