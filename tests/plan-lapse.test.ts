import { describe, expect, it } from 'vitest'
import { deliver } from '../src/modules/capture/notify.ts'
import { refreshDomainCache } from '../src/modules/domains/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { loginAgent, makeApp, seedUser, setPlan, type TestApp } from './helpers.ts'

const call = (t: TestApp, method: 'GET' | 'POST', url: string, key: string, body?: unknown) =>
  t.app.inject({ method, url, headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { payload: JSON.stringify(body) } : {}) })
const verify = (t: TestApp, id: number, at: number | null = 1) => t.deps.db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(at, id)

describe('cuentas sin verificar', () => {
  it('no estrenan prueba gratis ni sacan llave API', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/plan')
    await a.post('/panel/trial?plan=business')
    expect(t.deps.db.prepare('SELECT plan_id FROM users WHERE id = ?').pluck().get(u.id)).toBeNull()
    setPlan(t, u.id, 'business')
    await a.get('/panel/api')
    await a.post('/panel/api', { name: 'x' })
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM api_keys').pluck().get()).toBe(0)
    verify(t, u.id)
    await a.post('/panel/api', { name: 'x' })
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM api_keys').pluck().get()).toBe(1)
  })
})

describe('API respeta topes del panel', () => {
  it('tope diario de enlaces y bloques de plan', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    setPlan(t, u.id, 'business')
    verify(t, u.id)
    const a = await loginAgent(t)
    await a.get('/panel/api')
    await a.post('/panel/api', { name: 'x' })
    const key = /tb_[a-z0-9]{8}_[A-Za-z0-9_-]{32,64}/.exec((await a.get('/panel/api')).body)![0]
    verify(t, u.id, null)
    for (let i = 0; i < 20; i++) expect((await call(t, 'POST', '/api/v1/links', key, { alias: `api-${i}`, target_url: 'https://a.mx' })).statusCode).toBe(201)
    expect((await call(t, 'POST', '/api/v1/links', key, { alias: 'api-21', target_url: 'https://a.mx' })).statusCode).toBe(429)
    t.deps.db.prepare("UPDATE plans SET limits = json_set(limits, '$.custom_code', json('false'), '$.blocks_per_page', 2) WHERE slug = 'business'").run()
    verify(t, u.id)
    t.clock.now += 2 * 86400_000
    const bio = (await call(t, 'POST', '/api/v1/links', key, { kind: 'bio', alias: 'pagina-api', title: 'P' })).json()
    expect((await call(t, 'POST', `/api/v1/links/${bio.id}/blocks`, key, { type: 'html', data: { code: '<b>x</b>' } })).statusCode).toBe(402)
    for (let i = 0; i < 2; i++) expect((await call(t, 'POST', `/api/v1/links/${bio.id}/blocks`, key, { type: 'heading', data: { text: `h${i}` } })).statusCode).toBe(201)
    expect((await call(t, 'POST', `/api/v1/links/${bio.id}/blocks`, key, { type: 'heading', data: { text: 'h3' } })).statusCode).toBe(402)
  })
})

describe('al vencer el plan', () => {
  it('se apagan bloques de código, dominios propios, equipo y avisos de pago', async () => {
    const t = await makeApp()
    const owner = await seedUser(t)
    setPlan(t, owner.id, 'business', t.clock.now + 86400_000)
    verify(t, owner.id)
    const db = t.deps.db
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'negocio', title: 'Negocio', is_enabled: '1' })
    const link = findByAlias(db, 'negocio')!
    const bid = Number(db.prepare("INSERT INTO bio_blocks (link_id, type, position, data, created_at, updated_at) VALUES (?, 'html', 0, '{\"code\":\"<p>CODIGO-PROPIO</p>\",\"height\":100}', 0, 0)").run(link.id).lastInsertRowid)
    const did = db.prepare("INSERT INTO domains (user_id, host, status, verify_token, created_at) VALUES (?, 'links.mimarca.com', 'active', 'tok', 0)").run(owner.id).lastInsertRowid
    db.prepare('UPDATE links SET domain_id = ? WHERE id = ?').run(did, link.id)
    refreshDomainCache(db)
    const member = await seedUser(t, 'beto@example.com')
    db.prepare('INSERT INTO team_members (owner_id, user_id, email, role, token_hash, invited_at, accepted_at) VALUES (?, ?, ?, ?, ?, 0, 1)').run(owner.id, member.id, 'beto@example.com', 'editor', 'x')
    const b = await loginAgent(t, 'beto@example.com')
    await b.get('/panel/team')
    await b.post(`/panel/workspace/${owner.id}`)
    const target = { id: 1, user_id: owner.id, kind: 'webhook' as const, config: { url: 'https://hook.example.com/x' }, is_enabled: 1 }

    const page = () => t.app.inject({ method: 'GET', url: '/negocio', headers: { host: 'links.mimarca.com' } })
    expect((await page()).body).toContain(`/_/h/${bid}`)
    expect((await t.app.inject({ method: 'GET', url: `/_/h/${bid}`, headers: { 'sec-fetch-dest': 'iframe' } })).statusCode).toBe(200)
    expect((await t.app.inject({ method: 'GET', url: '/_/caddy/ask?domain=links.mimarca.com', remoteAddress: '127.0.0.1' })).statusCode).toBe(200)
    expect((await b.get('/panel')).body).toContain('Trabajas en el espacio de')

    t.clock.now += 2 * 86400_000
    expect((await page()).statusCode).toBe(404)
    db.prepare('UPDATE links SET domain_id = 0 WHERE id = ?').run(link.id)
    expect((await a.get('/negocio')).body).not.toContain(`/_/h/${bid}`)
    expect((await t.app.inject({ method: 'GET', url: `/_/h/${bid}`, headers: { 'sec-fetch-dest': 'iframe' } })).statusCode).toBe(404)
    expect((await t.app.inject({ method: 'GET', url: '/_/caddy/ask?domain=links.mimarca.com', remoteAddress: '127.0.0.1' })).statusCode).toBe(404)
    expect((await b.get('/panel')).body).not.toContain('Trabajas en el espacio de')
    await expect(deliver(t.deps, target as never, { title: 'x', lines: [], url: '', at: 0, payload: {} })).rejects.toThrow('plan_lapsed')
  })
})

describe('avisos y Caddy', () => {
  it('escapa texto del visitante para Slack y Discord', async () => {
    const { slackEsc, discordEsc } = await import('../src/modules/capture/notify.ts')
    expect(slackEsc('<https://evil.mx|Tu banco>')).toBe('&lt;https://evil.mx|Tu banco&gt;')
    expect(discordEsc('[Banco](https://evil.mx) **x**')).toBe('\\[Banco\\]\\(https://evil.mx\\) \\*\\*x\\*\\*')
  })
  it('ask de Caddy no responde a lo que llega por el proxy público', async () => {
    const t = await makeApp()
    const r = await t.app.inject({ method: 'GET', url: '/_/caddy/ask?domain=x.com', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': '8.8.8.8' } })
    expect(r.statusCode).toBe(403)
  })
})

describe('cupones', () => {
  it('pendientes ajenos apartan usos; una vez por persona; no se baja de plan vigente', async () => {
    process.env.TUBIO_BANK_CLABE = '012345678901234567'
    const t = await makeApp()
    const a1 = await seedUser(t)
    const a2 = await seedUser(t, 'beto@example.com')
    t.deps.db.prepare("INSERT INTO coupons (code, percent_off, max_uses, plans, created_at) VALUES ('UNO', 50, 1, '[]', 0)").run()
    const a = await loginAgent(t)
    await a.get('/panel/checkout?plan=pro&period=month')
    expect((await a.post('/panel/checkout?plan=pro&period=month', { coupon: 'UNO' })).statusCode).toBe(303)
    const b = await loginAgent(t, 'beto@example.com')
    await b.get('/panel/checkout?plan=pro&period=month')
    expect((await b.post('/panel/checkout?plan=pro&period=month', { coupon: 'UNO' })).statusCode).toBe(422)
    // mismo usuario puede rehacer su pago pendiente sin comprobante
    expect((await a.post('/panel/checkout?plan=pro&period=month', { coupon: 'UNO' })).statusCode).toBe(303)
    setPlan(t, a2.id, 'business', t.clock.now + 300 * 86400_000)
    const down = await b.post('/panel/checkout?plan=pro&period=month', {})
    expect(down.headers.location).toBe('/panel/plan')
    void a1
    delete process.env.TUBIO_BANK_CLABE
  })
})
