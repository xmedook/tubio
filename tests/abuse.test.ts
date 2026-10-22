import { describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36' }

describe('abuso', () => {
  it('visitante reporta, admin recibe correo y desactiva el enlace', async () => {
    const t = await makeApp()
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    await seedUser(t)
    const ana = await loginAgent(t)
    await ana.get('/panel/links/new?kind=bio')
    await ana.postMultipart('/panel/links?kind=bio', { alias: 'sospechoso', is_enabled: '1' })
    const v = new Agent(t.app)
    expect((await v.get('/sospechoso', UA)).body).toContain('/_/report/sospechoso')
    await v.get('/_/report/sospechoso')
    const sent = await v.post('/_/report/sospechoso', { reason: 'phishing', details: 'pide contraseña del banco', email: '' })
    expect(sent.body).toContain('Gracias')
    expect(t.mailer.sent.some((m) => m.to === 'admin@example.com' && m.subject.includes('abuso'))).toBe(true)
    const adm = await loginAgent(t, 'admin@example.com')
    const list = await adm.get('/admin/reports')
    expect(list.body).toContain('pide contraseña del banco')
    const id = (t.deps.db.prepare('SELECT id FROM abuse_reports').pluck().get() as number)
    await adm.post(`/admin/reports/${id}`, { action: 'disable' })
    expect(findByAlias(t.deps.db, 'sospechoso')!.is_enabled).toBe(0)
    expect((await new Agent(t.app).get('/sospechoso', UA)).statusCode).toBe(404)
    expect(t.deps.db.prepare('SELECT status FROM abuse_reports').pluck().get()).toBe('actioned')
  })

  it('cuenta sin verificar: máximo 20 enlaces por día', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    for (let i = 0; i < 20; i++) expect((await a.postMultipart('/panel/links?kind=short', { target_url: 'https://a.mx', is_enabled: '1' })).statusCode).toBe(303)
    const over = await a.postMultipart('/panel/links?kind=short', { target_url: 'https://a.mx', is_enabled: '1' })
    expect(over.statusCode).toBe(429)
    expect(over.body).toContain('Verifica tu correo')
    t.clock.now += 86400_000 + 1
  })
})

describe('legales', () => {
  it('páginas públicas con datos del responsable y aceptación obligatoria', async () => {
    process.env.TUBIO_LEGAL_OWNER = 'Koode Pruebas'
    const t = await makeApp()
    const priv = await new Agent(t.app).get('/privacy')
    expect(priv.statusCode).toBe(200)
    expect(priv.body).toContain('Koode Pruebas')
    expect(priv.body).toContain('No guardamos direcciones IP')
    expect((await new Agent(t.app).get('/terms', { 'accept-language': 'en' })).body).toContain('Terms of use')
    expect((await new Agent(t.app).get('/acceptable-use')).body).toContain('phishing')
    const a = new Agent(t.app)
    await a.get('/register')
    const sin = await a.post('/register', { email: 'z@example.com', password: 'contrasena-segura' })
    expect(sin.statusCode).toBe(422)
    expect(sin.body).toContain('acepta los términos')
    delete process.env.TUBIO_LEGAL_OWNER
  })
})
