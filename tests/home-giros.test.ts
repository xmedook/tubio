import { describe, expect, it } from 'vitest'
import { GIROS, GIRO_META } from '../src/modules/minisitio/giros.ts'
import { aliasError } from '../src/lib/alias.ts'
import { setSetting } from '../src/modules/settings/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

describe('portada nueva (diseño de design, sección C)', () => {
  it('trae el titular, la prueba de la liga, los 6 ejemplos reales con su vista, las páginas por giro, lo que incluye, los pasos, el precio como marcador y el FAQ', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    const r = await v.get('/')
    const body = r.body
    expect(r.statusCode).toBe(200)
    expect(body).toContain('Tu negocio, en <mark class="mk">una liga</mark> que da gusto abrir.')
    expect(body).toContain('id="neg"')
    expect(body).toMatch(/tubio\.test\/<b id="slug">tunegocio<\/b>/)
    for (const g of GIROS) {
      expect(body).toContain(`href="/${GIRO_META[g].example}"`) // ejemplo vivo
      expect(body).toContain(`/_/static/img/ejemplos/${g}.webp`) // su vista
      expect(body).toContain(`href="/${GIRO_META[g].slug}"`) // página por giro
    }
    expect((body.match(/class="ej"/g) ?? []).length).toBe(6)
    for (const id of ['ejemplos', 'incluye', 'como', 'precio', 'preguntas', 'cierre']) expect(body).toContain(`id="${id}"`)
    expect((body.match(/<li><svg[^>]*><path d="M5 12\.5l4\.5 4\.5L19 7\.5"\/><\/svg><div><b>/g) ?? []).length).toBe(8)
    expect((body.match(/<details>/g) ?? []).length).toBe(4)
    // el precio sigue como marcador: ninguna cifra real ni los planes del panel
    expect(body).toContain('aria-label="Precio por definir"')
    expect(body).not.toMatch(/\$\s?[1-9]\d{2,}/)
    expect(body).not.toContain('class="plan')
    expect(body).not.toContain('data-fundadores')
    // camino principal: «lo armamos por ti», con el nombre que se escribió
    expect(body).toContain('href="/armamos-por-ti" data-negocio-href="/armamos-por-ti"')
    expect(body).toMatch(/<link rel="canonical" href="http:\/\/tubio\.test\/">/)
  })

  it('estáticos versionados, fuentes propias, sin estilos ni scripts en línea y con la CSP con nonce', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    const r = await v.get('/')
    const body = r.body
    expect(body).toMatch(/\/_\/static\/css\/sitio\.css\?v=\d+/) // la portada comparte la hoja del sitio nuevo
    expect(body).toMatch(/<script type="module" src="\/_\/static\/js\/home-v3\.js\?v=\d+" nonce="[^"]+">/)
    expect(body).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/) // ningún script en línea
    expect(body).not.toMatch(/\sstyle="/) // ni atributos de estilo
    expect(body).not.toContain('fonts.googleapis.com')
    expect(body).toContain('/_/fonts/bricolage-grotesque-latin-wght-normal.woff2')
    const csp = String(r.headers['content-security-policy'])
    expect(csp).toContain("script-src 'self' 'nonce-")
    expect(csp).toContain("font-src 'self'")
    for (const f of ['bricolage-grotesque-latin-wght-normal.woff2', 'figtree-latin-wght-normal.woff2']) {
      const font = await v.get(`/_/fonts/${f}`)
      expect(font.statusCode).toBe(200)
      expect(font.headers['content-type']).toBe('font/woff2')
    }
    for (const g of GIROS) expect((await v.get(`/_/static/img/ejemplos/${g}.webp`)).statusCode).toBe(200)
    expect((await v.get('/_/static/css/sitio.css')).body).toContain('#d6f23a')
  })

  it('lleva a quien entra al panel, al idioma y al código fuente (AGPL) desde cabecera y pie', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    const body = (await v.get('/')).body
    expect(body).toContain('href="/login"')
    expect(body).toContain('href="/lang/en?next=%2F"')
    expect(body).toContain('href="/source"')
    for (const p of ['/privacy', '/terms', '/acceptable-use', '/security', '/directory', '/blog', '/help']) expect(body).toContain(`href="${p}"`)
    const en = new Agent(t.app)
    await en.get('/lang/en')
    const b = (await en.get('/')).body
    expect(b).toContain('Your business, on <mark class="mk">one link</mark> that')
    expect(b).toContain('Make it for my business')
    expect(b).toContain('Every business, its own style.')
    expect(b).not.toContain('Tu negocio, en')
  })

  it('«Hazlo para mi negocio» abre «lo armamos por ti» ya con el nombre que se escribió', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    const f = (await v.get('/armamos-por-ti?negocio=Caf%C3%A9%20La%20Ceiba&giro=salud')).body
    expect(f).toMatch(/name="business" value="Café La Ceiba"/)
    expect(f).toMatch(/<option value="salud" selected>/)
    expect((await v.get('/armamos-por-ti?negocio=' + 'x'.repeat(500))).body).toMatch(/name="business" value="x{120}"/)
  })

  it('el registro propio sale como alternativa sólo si está abierto; cerrado, queda la lista de espera', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    setSetting(t.deps.db, 'registration_open', false)
    const cerrado = (await v.get('/')).body
    expect(cerrado).not.toContain('data-negocio-param="alias"')
    expect(cerrado).toContain('action="/waitlist"')
    setSetting(t.deps.db, 'registration_open', true)
    const abierto = (await v.get('/')).body
    expect(abierto).toContain('data-negocio-param="alias"')
    expect(abierto).not.toContain('action="/waitlist"')
  })

  it('el WhatsApp de ventas sólo aparece si el admin lo configura (botón de la portada, barra fija y cierre)', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    const sin = (await v.get('/')).body
    expect(sin).not.toContain('wa.me/')
    expect(sin).not.toContain('Hablar con una persona')
    setSetting(t.deps.db, 'sales_whatsapp', '5213121234567')
    const body = (await v.get('/')).body
    expect((body.match(/https:\/\/wa\.me\/5213121234567\?text=/g) ?? []).length).toBeGreaterThanOrEqual(2) // «Hablar con una persona» y cierre (la barra fija ya no existe)
    expect(body).toContain('Hablar con una persona')
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
      expect(r.body).toContain(`/_/static/img/ejemplos/${g}.webp`) // el teléfono con el ejemplo
      expect(r.body).toContain('class="hl-') // un marcatextos en el titular
      expect(r.body.match(/class="chip chip-(verde|rosa|azul)"/g)!.length).toBeGreaterThanOrEqual(7) // chip del giro + 6 bloques
      expect(r.body).toContain('$ — — —') // el precio sigue como marcador
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
    expect((await v.get('/salud')).body).toContain('where to go')
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
  const ok = { giro: 'restaurante', business: 'Fonda Doña Lupe', name: 'Lupe', whatsapp: '312 123 4567', email: '', city: 'Colima', offer: 'Comida corrida', links: 'https://instagram.com/fondalupe', priv: '1' }

  it('guarda la solicitud con el WhatsApp normalizado y confirma', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    expect((await v.get('/armamos-por-ti')).statusCode).toBe(200)
    const r = await v.post('/armamos-por-ti', ok)
    expect(r.statusCode).toBe(200)
    expect(r.body).toContain('Solicitud recibida')
    expect(r.body).toContain('APT-0001') // el folio sale del registro guardado
    const row = t.deps.db.prepare('SELECT * FROM assisted_requests').get() as Record<string, unknown>
    expect(row.business).toBe('Fonda Doña Lupe')
    expect(row.whatsapp).toBe('523121234567')
    expect(row.links).toBe('https://instagram.com/fondalupe')
    expect(row.status).toBe('new')
  })

  it('lo que el diseño pide (bloques, horario) viaja en el texto para el equipo; @usuario se vuelve enlace de Instagram', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/armamos-por-ti')
    const r = await v.post('/armamos-por-ti', { ...ok, links: '@fondalupe', b_wa: '1', b_gal: '1', hora: 't' })
    expect(r.statusCode).toBe(200)
    const row = t.deps.db.prepare('SELECT offer, links FROM assisted_requests').get() as { offer: string; links: string }
    expect(row.links).toBe('https://instagram.com/fondalupe')
    expect(row.offer).toContain('Comida corrida')
    expect(row.offer).toContain('[Bloques que quiere] Botón de WhatsApp, Galería de fotos')
    expect(row.offer).toContain('[Prefiere que le escribamos] por la tarde (15:00 a 19:00)')
  })

  it('sin aceptar el aviso de privacidad no se guarda y el error sale con texto e ícono, no solo color', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/armamos-por-ti')
    const r = await v.post('/armamos-por-ti', { ...ok, priv: '', business: '' })
    expect(r.statusCode).toBe(422)
    expect(r.body).toContain('Revisa 2 campos.')
    expect(r.body).toMatch(/<p class="msg-e" id="e-business"><svg class="ic" aria-hidden="true"><use href="#i-alert"\/><\/svg><span>Escribe el nombre de tu negocio\./)
    expect(r.body).toContain('Acepta el aviso de privacidad')
    expect(r.body).toContain('aria-invalid="true"')
    expect(r.body).toMatch(/name="whatsapp"[^>]*value="312 123 4567"|value="312 123 4567"[^>]*name="whatsapp"/) // conserva lo escrito
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM assisted_requests').pluck().get()).toBe(0)
  })

  it('el correo «solicitud recibida» sale solo al correo escrito, con cuerpo fijo y el folio, sin repetir texto de la persona', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/armamos-por-ti')
    const r = await v.post('/armamos-por-ti', { ...ok, email: 'Lupe@Example.com', offer: 'oferta secreta 123', name: 'Nombre Raro' })
    expect(r.statusCode).toBe(200)
    expect(t.mailer.sent).toHaveLength(1)
    const m = t.mailer.sent[0]!
    expect(m.to).toBe('lupe@example.com')
    expect(m.subject).toContain('Recibimos tu solicitud')
    expect(m.text).toContain('APT-0001')
    for (const secreto of ['Fonda Doña Lupe', 'Nombre Raro', 'oferta secreta', 'Comida corrida', 'Colima']) expect(m.text + m.subject).not.toContain(secreto)
  })

  it('una solicitud solo con WhatsApp o la de un robot (campo trampa) no mandan ningún correo', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/armamos-por-ti')
    expect((await v.post('/armamos-por-ti', { ...ok, whatsapp: '312 123 4567', email: '' })).statusCode).toBe(200)
    expect((await v.post('/armamos-por-ti', { ...ok, email: 'bot@example.com', website: 'http://spam.example' })).statusCode).toBe(200)
    expect(t.mailer.sent).toHaveLength(0)
  })

  it('tope de 3 correos por dirección en 24 h: la 4.ª solicitud se guarda pero no manda correo', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/armamos-por-ti')
    for (let i = 0; i < 3; i++) expect((await v.post('/armamos-por-ti', { ...ok, email: 'mismo@example.com' })).statusCode).toBe(200)
    expect(t.mailer.sent).toHaveLength(3)
    expect((await v.post('/armamos-por-ti', { ...ok, email: 'mismo@example.com' })).statusCode).toBe(200)
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM assisted_requests').pluck().get()).toBe(4)
    expect(t.mailer.sent).toHaveLength(3)
    t.clock.now += 25 * 3600_000 // pasadas 24 h vuelve a salir
    await v.post('/armamos-por-ti', { ...ok, email: 'mismo@example.com' })
    expect(t.mailer.sent).toHaveLength(4)
  })

  it('tope de 10 correos por IP al día: con 10 ya registrados hoy, otro correo distinto se guarda pero no manda nada', async () => {
    const { sha256 } = await import('../src/lib/crypto.ts')
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/armamos-por-ti')
    const day = new Date(t.clock.now).toISOString().slice(0, 10)
    for (let i = 0; i < 10; i++) t.deps.db.prepare("INSERT INTO audit_log (action, target, meta, ts) VALUES ('assisted.mail', ?, '{}', ?)").run(`ip:${sha256(`127.0.0.1|${day}`)}`, t.clock.now)
    const r = await v.post('/armamos-por-ti', { ...ok, email: 'otro@example.com' })
    expect(r.statusCode).toBe(200)
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM assisted_requests').pluck().get()).toBe(1) // la solicitud sí se guarda
    expect(t.mailer.sent).toHaveLength(0)
    // control: otra IP u otro día sí manda (aquí, un día después)
    t.clock.now += 25 * 3600_000
    await v.post('/armamos-por-ti', { ...ok, email: 'otro@example.com' })
    expect(t.mailer.sent).toHaveLength(1)
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
