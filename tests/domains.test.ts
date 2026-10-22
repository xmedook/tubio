import { describe, expect, it } from 'vitest'
import { normalizeHost } from '../src/modules/domains/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { loginAgent, makeApp, seedUser, setPlan } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 Chrome/130' }

describe('dominios propios', () => {
  it('normaliza hosts', () => {
    expect(normalizeHost('https://Links.MiMarca.com/x')).toBe('links.mimarca.com')
    expect(normalizeHost('localhost')).toBeNull()
    expect(normalizeHost('192.168.0.1')).toBeNull()
  })

  it('alta, verificación por CNAME, enlaces en el dominio y ask de Caddy', async () => {
    let cname: string[] = []
    let txt: string[][] = []
    const t = await makeApp({ dnsResolver: { txt: async () => txt, cname: async () => cname } })
    const u = await seedUser(t)
    setPlan(t, u.id, 'pro')
    const a = await loginAgent(t)
    await a.get('/panel/domains')
    expect((await a.post('/panel/domains', { host: 'tubio.test' })).statusCode).toBe(422)
    expect((await a.post('/panel/domains', { host: 'links.mimarca.com' })).statusCode).toBe(303)
    expect((await a.post('/panel/domains', { host: 'otro.mimarca.com' })).headers.location).toBe('/panel/plan') // Pro = 1 dominio
    const d = t.deps.db.prepare('SELECT * FROM domains').get() as { id: number; verify_token: string }
    await a.post(`/panel/domains/${d.id}/verify`)
    expect(t.deps.db.prepare('SELECT status FROM domains').pluck().get()).toBe('pending')
    cname = ['custom.tubio.link.']
    await a.post(`/panel/domains/${d.id}/verify`)
    expect(t.deps.db.prepare('SELECT status FROM domains').pluck().get()).toBe('pending') // el CNAME no prueba propiedad
    txt = [[`tubio-verify=${d.verify_token}`]]
    await a.post(`/panel/domains/${d.id}/verify`)
    expect(t.deps.db.prepare('SELECT status FROM domains').pluck().get()).toBe('active')
    // enlace en el dominio propio (mismo alias que uno del principal: no chocan)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'promo', target_url: 'https://principal.mx', is_enabled: '1' })
    await a.postMultipart('/panel/links?kind=short', { alias: 'promo', target_url: 'https://propio.mx', is_enabled: '1', domain_id: String(d.id) })
    const viaCustom = await t.app.inject({ method: 'GET', url: '/promo', headers: { host: 'links.mimarca.com', ...UA } })
    expect(viaCustom.headers.location).toBe('https://propio.mx/')
    const viaMain = await t.app.inject({ method: 'GET', url: '/promo', headers: UA })
    expect(viaMain.headers.location).toBe('https://principal.mx/')
    // el panel no se sirve en el dominio propio
    const panel = await t.app.inject({ method: 'GET', url: '/panel', headers: { host: 'links.mimarca.com' } })
    expect(panel.headers.location).toBe('http://tubio.test/panel')
    // URL pública del enlace usa el dominio
    expect((await a.get('/panel')).body).toContain('links.mimarca.com/promo')
    // Caddy
    expect((await t.app.inject({ method: 'GET', url: '/_/caddy/ask?domain=links.mimarca.com', remoteAddress: '127.0.0.1' })).statusCode).toBe(200)
    expect((await t.app.inject({ method: 'GET', url: '/_/caddy/ask?domain=evil.com', remoteAddress: '127.0.0.1' })).statusCode).toBe(404)
    expect((await t.app.inject({ method: 'GET', url: '/_/caddy/ask?domain=links.mimarca.com', remoteAddress: '8.8.8.8' })).statusCode).toBe(403)
    // página de inicio del dominio
    await a.postMultipart('/panel/links?kind=bio', { alias: 'portada', is_enabled: '1', domain_id: String(d.id) })
    const bio = findByAlias(t.deps.db, 'portada', d.id)!
    await a.post(`/panel/domains/${d.id}/home`, { home_link_id: String(bio.id) })
    expect((await t.app.inject({ method: 'GET', url: '/', headers: { host: 'links.mimarca.com' } })).headers.location).toBe('/portada')
  })

  it('plan gratis no tiene dominios', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    expect((await a.get('/panel/domains')).body).toContain('vienen con los planes Pro')
  })

  it('un pendiente no aparta el host y un TXT ajeno no sirve', async () => {
    const tokens: Record<string, string> = {}
    const t = await makeApp({ dnsResolver: { txt: async () => Object.values(tokens).map((v) => [v]), cname: async () => ['custom.tubio.link'] } })
    const squat = await seedUser(t, 'squat@example.com')
    const real = await seedUser(t, 'marca@example.com')
    setPlan(t, squat.id, 'pro')
    setPlan(t, real.id, 'pro')
    const s = await loginAgent(t, 'squat@example.com')
    await s.get('/panel/domains')
    expect((await s.post('/panel/domains', { host: 'links.marca.com' })).statusCode).toBe(303)
    const r = await loginAgent(t, 'marca@example.com')
    await r.get('/panel/domains')
    expect((await r.post('/panel/domains', { host: 'links.marca.com' })).statusCode).toBe(303) // no lo aparta el pendiente
    const rows = t.deps.db.prepare('SELECT id, user_id, verify_token FROM domains ORDER BY id').all() as { id: number; user_id: number; verify_token: string }[]
    const [sq, mine] = rows as [typeof rows[0], typeof rows[0]]
    expect(sq.verify_token).not.toBe(mine.verify_token)
    // la marca publica SU TXT: el squatter no puede activarlo con eso
    tokens.real = `tubio-verify=${mine.verify_token}`
    await s.post(`/panel/domains/${sq.id}/verify`)
    expect(t.deps.db.prepare('SELECT status FROM domains WHERE id = ?').pluck().get(sq.id)).toBe('pending')
    await r.post(`/panel/domains/${mine.id}/verify`)
    expect(t.deps.db.prepare('SELECT status FROM domains WHERE id = ?').pluck().get(mine.id)).toBe('active')
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM domains').pluck().get()).toBe(1) // el intento ajeno se borró
    expect((await s.post('/panel/domains', { host: 'links.marca.com' })).statusCode).toBe(422)
  })
})
