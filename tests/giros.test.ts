import { describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { GIROS, GIRO_META } from '../src/modules/minisitio/giros.ts'
import { loadSite } from '../src/modules/minisitio/repo.ts'
import { Agent, makeApp, type TestApp } from './helpers.ts'

async function signup(t: TestApp): Promise<Agent> {
  const v = new Agent(t.app)
  await v.get('/register')
  await v.post('/register', { email: 'dueno@example.com', password: 'contrasena-segura', accept: '1' })
  return v
}

/** Una marca por giro que sólo existe si se armó su bloque característico */
const MARK: Record<(typeof GIROS)[number], { page: string; marks: string[]; sub?: string }> = {
  restaurante: { page: '/rest', marks: ['Pedir ahora', 'Reserva tu mesa'], sub: 'menu' },
  belleza: { page: '/rest', marks: ['Servicios y precios', 'Manicure con gel', 'Agendar mi cita'] },
  salud: { page: '/rest', marks: ['Conoce tus opciones', 'Verificar cédula en la SEP', 'Agendar valoración'], sub: 'consulta' },
  inmobiliaria: { page: '/rest', marks: ['Propiedades', 'data-prl-f', 'Solicitar visita'] },
  fitness: { page: '/rest', marks: ['Horario de clases', 'Fuerza 12 semanas', 'Reservar clase muestra'] },
  servicios: { page: '/rest', marks: ['Pedir cotización', 'Zona de cobertura'] },
}

describe('plantillas por giro (asistente «giro primero»)', () => {
  for (const g of GIROS) {
    it(`${g}: se arma completo, publica y todas sus páginas responden`, async () => {
      const t = await makeApp()
      const v = await signup(t)
      await v.get('/panel/start')
      const r = await v.postMultipart('/panel/start', { tpl: `giro:${g}`, alias: 'rest', name: 'Mi Negocio', whatsapp: '55 1234 5678', address: 'Calle Falsa 123, Colima' })
      const link = findByAlias(t.deps.db, 'rest')!
      expect(r.headers.location).toBe(`/panel/start/done?id=${link.id}&site=1`)
      const m = MARK[g]
      const home = await v.get('/rest')
      expect(home.statusCode).toBe(200)
      expect(home.body).toContain('Mi Negocio')
      for (const mark of m.marks) expect(home.body, mark).toContain(mark)
      expect(home.body).toContain('Calle Falsa 123, Colima')
      expect(home.body).toContain('wa.me/525512345678')
      expect(home.body).not.toContain('Nombre de tu negocio') // nada de huecos sin llenar
      if (m.sub) expect((await v.get(`/rest/${m.sub}`)).statusCode).toBe(200)
      for (const p of loadSite(t.deps.db, link.id).pages.filter((x) => x.slug)) expect((await v.get(`/rest/${p.slug}`)).statusCode, p.slug).toBe(200)
      expect(GIRO_META[g].slug).toMatch(/^[a-z-]+$/)
    })
  }

  it('sin dirección no hay mapa ni «Cómo llegar»; con WhatsApp vacío no hay botón roto', async () => {
    const t = await makeApp()
    const v = await signup(t)
    await v.get('/panel/start')
    await v.postMultipart('/panel/start', { tpl: 'giro:restaurante', alias: 'sin-dir', name: 'Sin Dirección' })
    const body = (await v.get('/sin-dir')).body
    expect(body).not.toContain('Dónde estamos')
    expect(body).not.toContain('Cómo llegar')
    expect(body).not.toContain('wa.me/52')
  })

  it('asistente: el giro viene primero, los links en bio siguen disponibles, ?giro= preselecciona', async () => {
    const t = await makeApp()
    const v = await signup(t)
    const page = (await v.get('/panel/start?giro=salud')).body
    expect(page.indexOf('value="giro:restaurante"')).toBeGreaterThan(0)
    expect(page.indexOf('value="giro:restaurante"')).toBeLessThan(page.indexOf('name="tpl" value=""'))
    expect(page).toMatch(/value="giro:salud"[^>]* checked/)
    expect(page).toContain('name="address"')
  })

  it('el IG del asistente queda en la portada del sitio', async () => {
    const t = await makeApp()
    const v = await signup(t)
    await v.get('/panel/start')
    await v.postMultipart('/panel/start', { tpl: 'giro:belleza', alias: 'studiox', name: 'Studio X', instagram: '@studiox' })
    expect((await v.get('/studiox')).body).toContain('soc-instagram')
  })
})

describe('etiquetas con marcatextos (bloque 7)', () => {
  it('el sitio de ejemplo las lleva (rosa, verde o azul) y el de una persona no: serían promociones inventadas', async () => {
    const t = await makeApp()
    const v = await signup(t)
    await v.get('/panel/start')
    await v.postMultipart('/panel/start', { tpl: 'giro:restaurante', alias: 'rest', name: 'Mi Negocio', whatsapp: '55 1234 5678', address: 'Calle Falsa 123' })
    const propio = (await v.get('/rest')).body
    expect(propio).not.toContain('class="tgs"')
    expect(propio).not.toContain('Nuevo: costillas BBQ')
    const { createLink } = await import('../src/modules/links/repo.ts')
    const { defaultBioData } = await import('../src/modules/bio/design.ts')
    const { applyGiro } = await import('../src/modules/minisitio/giros.ts')
    const owner = t.deps.db.prepare('SELECT id FROM users LIMIT 1').pluck().get() as number
    const l = createLink(t.deps.db, owner, { project_id: null, alias: 'ejem', kind: 'bio', title: 'Fonda La Ceiba', target_url: null, redirect_code: 302, data: { ...defaultBioData('Fonda La Ceiba', '', 'papel'), noindex: true }, is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false }, Date.now())
    applyGiro(t.deps.db, l.id, 'restaurante', { name: 'Fonda La Ceiba', whatsapp: '', address: 'Calle de los Ejemplos 123', example: true }, Date.now())
    const ejemplo = (await v.get('/ejem')).body
    expect(ejemplo).toContain('class="tgs"')
    expect(ejemplo).toContain('<span class="tg tg-rosa">Nuevo: costillas BBQ</span>')
    expect(ejemplo).toContain('<span class="tg tg-verde">Abierto ahora</span>')
  })
})

describe('fotos de los ejemplos (bloque 7)', () => {
  it('con fotos, la portada, la galería y las propiedades las usan; sin fotos (sitio de una persona) el sitio sale igual que antes', async () => {
    const t = await makeApp()
    const v = await signup(t)
    const { createLink } = await import('../src/modules/links/repo.ts')
    const { defaultBioData } = await import('../src/modules/bio/design.ts')
    const { applyGiro } = await import('../src/modules/minisitio/giros.ts')
    const owner = t.deps.db.prepare('SELECT id FROM users LIMIT 1').pluck().get() as number
    const mk = (alias: string) => createLink(t.deps.db, owner, { project_id: null, alias, kind: 'bio', title: 'X', target_url: null, redirect_code: 302, data: { ...defaultBioData('X', '', 'papel'), noindex: true }, is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false }, Date.now())
    const F = (k: string) => ({ key: `llave${k}.webp`, alt: `alt ${k}` })
    const fotos = Object.fromEntries(['inmobiliaria/hero-bahia.webp', 'inmobiliaria/prop-casa.webp', 'inmobiliaria/prop-terreno.webp', 'inmobiliaria/galeria-cocina.webp', 'inmobiliaria/galeria-recamara.webp'].map((n, i) => [n, F(String(i))]))
    applyGiro(t.deps.db, mk('con').id, 'inmobiliaria', { name: 'Inmobiliaria Sol', whatsapp: '', address: 'Calle 1', example: true, fotos }, Date.now())
    const con = (await v.get('/con')).body
    expect(con).toContain('/_/u/llave0') // portada con la foto de fondo
    expect(con).toContain('/_/u/llave1') // la casa
    expect(con).toContain('/_/u/llave3') // galería «Por dentro»
    expect(con).toContain('Así son por dentro')
    applyGiro(t.deps.db, mk('sin').id, 'inmobiliaria', { name: 'Inmobiliaria Sol', whatsapp: '', address: 'Calle 1' }, Date.now())
    const sin = (await v.get('/sin')).body
    expect(sin).not.toContain('/_/u/')
    expect(sin).not.toContain('Así son por dentro')
  })
})

describe('pie de los ejemplos (IA)', () => {
  it('los sitios de ejemplo avisan que el demo es generado con IA (es y en); el sitio de una persona no', async () => {
    const t = await makeApp()
    const v = await signup(t)
    const { createLink } = await import('../src/modules/links/repo.ts')
    const { defaultBioData } = await import('../src/modules/bio/design.ts')
    const { applyGiro } = await import('../src/modules/minisitio/giros.ts')
    const owner = t.deps.db.prepare('SELECT id FROM users LIMIT 1').pluck().get() as number
    const mk = (alias: string) => createLink(t.deps.db, owner, { project_id: null, alias, kind: 'bio', title: 'X', target_url: null, redirect_code: 302, data: { ...defaultBioData('X', '', 'papel'), noindex: true }, is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false }, Date.now())
    applyGiro(t.deps.db, mk('demo').id, 'servicios', { name: 'Arce Contadores', whatsapp: '', address: 'Calle 1', example: true }, Date.now())
    const demo = (await v.get('/demo')).body
    expect(demo).toContain('Demo con datos y fotos generados con IA')
    expect(demo).toContain('Demo with AI-generated data and photos')
    applyGiro(t.deps.db, mk('real').id, 'servicios', { name: 'Mi despacho', whatsapp: '', address: 'Calle 1' }, Date.now())
    expect((await v.get('/real')).body).not.toContain('generados con IA')
  })
})
