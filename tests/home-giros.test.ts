import { describe, expect, it } from 'vitest'
import { GIROS, GIRO_META } from '../src/modules/minisitio/giros.ts'
import { aliasError } from '../src/lib/alias.ts'
import { setSetting } from '../src/modules/settings/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

describe('portada nueva', () => {
  it('trae los chips de giro, los ejemplos vivos, los pasos y la alternativa «lo armamos por ti»', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    const body = (await v.get('/')).body
    expect(body).toContain('que termina en WhatsApp')
    for (const g of GIROS) {
      expect(body).toContain(`id="g-${g}"`)
      expect(body).toContain(`href="/${GIRO_META[g].example}"`)
      expect(body).toContain(`href="/${GIRO_META[g].slug}"`)
    }
    expect(body).toContain('name="giro"')
    expect(body).toContain('href="/armamos-por-ti"')
    expect(body).toContain('id="como"')
    expect(body).toContain('/_/static/js/home.js')
    expect(body).toContain('class="barra-m"')
    expect(body).toMatch(/<link rel="canonical" href="http:\/\/tubio\.test\/">/)
  })

  it('el WhatsApp de ventas sólo aparece si el admin lo configura (cabecera, cierre y barra móvil)', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    expect((await v.get('/')).body).not.toContain('wa.me/')
    setSetting(t.deps.db, 'sales_whatsapp', '5213121234567')
    const body = (await v.get('/')).body
    expect((body.match(/https:\/\/wa\.me\/5213121234567\?text=/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('el admin guarda el WhatsApp de ventas (10 dígitos → lada 52) y rechaza basura', async () => {
    const t = await makeApp()
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const admin = await loginAgent(t, 'admin@example.com')
    await admin.get('/admin/settings')
    await admin.post('/admin/settings', { site_name: 'tubio', stats_retention_days: '365', referral_percent: '20', announcement_level: 'info', sales_whatsapp: '312 123 4567' })
    expect(t.deps.db.prepare("SELECT value FROM settings WHERE key = 'sales_whatsapp'").pluck().get()).toBe('"523121234567"')
    await admin.post('/admin/settings', { site_name: 'tubio', stats_retention_days: '365', referral_percent: '20', announcement_level: 'info', sales_whatsapp: '12' })
    expect(t.deps.db.prepare("SELECT value FROM settings WHERE key = 'sales_whatsapp'").pluck().get()).toBe('"523121234567"')
  })
})

describe('páginas por giro', () => {
  for (const g of GIROS) {
    it(`/${GIRO_META[g].slug}: titular, ejemplo vivo, camino a crear el sitio y FAQ estructurado`, async () => {
      const t = await makeApp()
      const v = new Agent(t.app)
      const r = await v.get(`/${GIRO_META[g].slug}`)
      expect(r.statusCode).toBe(200)
      expect(r.body).toContain(`href="/${GIRO_META[g].example}"`)
      expect(r.body).toContain(`href="/register?giro=${g}"`)
      expect(r.body).toContain(`rel="canonical" href="http://tubio.test/${GIRO_META[g].slug}"`)
      expect(r.body).toContain('class="dg dg-' + g + ' solo"')
      const ld = /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s.exec(r.body)![1]!
      const json = JSON.parse(ld) as { '@type': string; mainEntity: unknown[] }
      expect(json['@type']).toBe('FAQPage')
      expect(json.mainEntity.length).toBe(3)
      expect(aliasError(GIRO_META[g].slug)).toBe('err.alias_reserved')
    })
  }

  it('en inglés la página del giro sale en inglés', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/lang/en')
    expect((await v.get('/salud')).body).toContain('Your practice site, ready today')
  })

  it('registro con ?giro= viaja hasta el asistente y lo preselecciona', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    const reg = (await v.get('/register?alias=mi-clinica&giro=salud')).body
    expect(reg).toContain('name="giro" value="salud"')
    const r = await v.post('/register', { email: 'dra@example.com', password: 'contrasena-segura', accept: '1', claim: 'mi-clinica', giro: 'salud' })
    expect(r.headers.location).toBe('/panel/start?alias=mi-clinica&giro=salud')
    expect((await v.get(String(r.headers.location))).body).toMatch(/value="giro:salud"[^>]* checked/)
    // un giro inventado no pasa
    const w = new Agent(t.app)
    expect((await w.get('/register?giro=hackeo')).body).not.toContain('name="giro"')
  })
})

describe('«lo armamos por ti»', () => {
  const ok = { giro: 'restaurante', business: 'Fonda Doña Lupe', name: 'Lupe', whatsapp: '312 123 4567', email: '', city: 'Colima', offer: 'Comida corrida', links: 'https://instagram.com/fondalupe' }

  it('guarda la solicitud con el WhatsApp normalizado y confirma', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    expect((await v.get('/armamos-por-ti')).statusCode).toBe(200)
    const r = await v.post('/armamos-por-ti', ok)
    expect(r.statusCode).toBe(200)
    expect(r.body).toContain('Recibimos tu solicitud')
    const row = t.deps.db.prepare('SELECT * FROM assisted_requests').get() as Record<string, unknown>
    expect(row.business).toBe('Fonda Doña Lupe')
    expect(row.whatsapp).toBe('523121234567')
    expect(row.links).toBe('https://instagram.com/fondalupe')
    expect(row.status).toBe('new')
  })

  it('sin forma de contacto, sin giro o sin nombre del negocio no guarda nada', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/armamos-por-ti')
    expect((await v.post('/armamos-por-ti', { ...ok, whatsapp: '', email: '' })).statusCode).toBe(422)
    expect((await v.post('/armamos-por-ti', { ...ok, giro: '' })).statusCode).toBe(422)
    expect((await v.post('/armamos-por-ti', { ...ok, business: '' })).statusCode).toBe(422)
    expect((await v.post('/armamos-por-ti', { ...ok, giro: 'drop table' })).statusCode).toBe(422)
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM assisted_requests').pluck().get()).toBe(0)
  })

  it('el campo trampa descarta al robot sin guardar y sin avisar', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/armamos-por-ti')
    const r = await v.post('/armamos-por-ti', { ...ok, website: 'http://spam.example' })
    expect(r.statusCode).toBe(200)
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM assisted_requests').pluck().get()).toBe(0)
  })

  it('un enlace que no es http(s) se descarta; el HTML se escapa en el admin', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/armamos-por-ti')
    await v.post('/armamos-por-ti', { ...ok, links: 'javascript:alert(1)', business: '<img src=x onerror=alert(1)>' })
    expect(t.deps.db.prepare('SELECT links FROM assisted_requests').pluck().get()).toBe('')
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const admin = await loginAgent(t, 'admin@example.com')
    const page = (await admin.get('/admin/assisted')).body
    expect(page).not.toContain('<img src=x')
    expect(page).toContain('&lt;img src=x')
  })

  it('el admin ve la cola y cambia el estado; un usuario normal no entra', async () => {
    const t = await makeApp()
    const pub = new Agent(t.app)
    await pub.get('/armamos-por-ti')
    await pub.post('/armamos-por-ti', ok)
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    await seedUser(t, 'ana@example.com')
    const ana = await loginAgent(t, 'ana@example.com')
    expect((await ana.get('/admin/assisted')).statusCode).toBe(404)
    const admin = await loginAgent(t, 'admin@example.com')
    expect((await admin.get('/admin/assisted')).body).toContain('Fonda Doña Lupe')
    const id = t.deps.db.prepare('SELECT id FROM assisted_requests').pluck().get() as number
    await admin.get('/admin/assisted')
    const r = await admin.post(`/admin/assisted/${id}`, { status: 'doing', note: 'Pedí fotos' })
    expect(r.statusCode).toBe(303)
    expect(t.deps.db.prepare('SELECT status, note FROM assisted_requests').get()).toEqual({ status: 'doing', note: 'Pedí fotos' })
    expect((await admin.post(`/admin/assisted/${id}`, { status: 'hackeado' })).statusCode).toBe(404)
  })
})
