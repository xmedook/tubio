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
