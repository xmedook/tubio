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
    const t = await makeApp({ dnsResolver: { txt: async () => [], cname: async () => cname } })
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
})
