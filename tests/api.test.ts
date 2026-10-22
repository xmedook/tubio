import { describe, expect, it } from 'vitest'
import { loginAgent, makeApp, seedUser, setPlan, type TestApp } from './helpers.ts'

async function keyFor(t: TestApp, plan = 'business') {
  const u = await seedUser(t)
  setPlan(t, u.id, plan)
  t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(u.id)
  const a = await loginAgent(t)
  await a.get('/panel/api')
  const res = await a.post('/panel/api', { name: 'pruebas' })
  expect(res.statusCode).toBe(303)
  const page = await a.get('/panel/api')
  const key = /tb_[a-z0-9]{8}_[A-Za-z0-9_-]{32,64}/.exec(page.body)?.[0]
  return { a, key: key as string, u }
}

const call = (t: TestApp, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, key: string, body?: unknown) =>
  t.app.inject({ method, url, headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { payload: JSON.stringify(body) } : {}) })

describe('API v1', () => {
  it('la llave se muestra una vez y sólo con plan Negocio', async () => {
    const t = await makeApp()
    const { a, key } = await keyFor(t)
    expect(key).toBeTruthy()
    expect((await a.get('/panel/api')).body).not.toContain(key)
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(401)
    expect((await call(t, 'GET', '/api/v1/me', key)).json().email).toBe('ana@example.com')
    expect((await call(t, 'GET', '/api/v1/me', key.slice(0, -2) + 'xx')).statusCode).toBe(401)
    t.deps.db.prepare('UPDATE users SET plan_id = NULL').run()
    expect((await call(t, 'GET', '/api/v1/me', key)).statusCode).toBe(402)
  })

  it('enlaces: crear, listar, editar, estadísticas y borrar', async () => {
    const t = await makeApp()
    const { key } = await keyFor(t)
    const bad = await call(t, 'POST', '/api/v1/links', key, { target_url: 'javascript:alert(1)' })
    expect(bad.statusCode).toBe(422)
    expect(bad.json().error.details.target_url).toBe('err.url_scheme')
    const c = await call(t, 'POST', '/api/v1/links', key, { alias: 'desde-api', target_url: 'ejemplo.mx', utm: { utm_source: 'api' }, ends_at: '2026-12-31T23:00:00Z' })
    expect(c.statusCode).toBe(201)
    const link = c.json()
    expect(link.url).toBe('http://tubio.test/desde-api')
    expect(link.ends_at).toBe('2026-12-31T23:00:00.000Z')
    expect((await call(t, 'GET', '/api/v1/links?kind=short', key)).json().total).toBe(1)
    const p = await call(t, 'PATCH', `/api/v1/links/${link.id}`, key, { title: 'Nuevo título', is_enabled: false })
    expect(p.json()).toMatchObject({ title: 'Nuevo título', is_enabled: false, target_url: 'https://ejemplo.mx/' })
    expect((await call(t, 'GET', `/api/v1/links/${link.id}/stats`, key)).json().totals).toEqual({ views: 0, visitors: 0, clicks: 0 })
    expect((await call(t, 'DELETE', `/api/v1/links/${link.id}`, key)).statusCode).toBe(204)
    expect((await call(t, 'GET', `/api/v1/links/${link.id}`, key)).statusCode).toBe(404)
  })

  it('bloques por API y aislamiento entre cuentas', async () => {
    const t = await makeApp()
    const { key } = await keyFor(t)
    const page = (await call(t, 'POST', '/api/v1/links', key, { kind: 'bio', alias: 'pagina-api', title: 'Página' })).json()
    const b = await call(t, 'POST', `/api/v1/links/${page.id}/blocks`, key, { type: 'link', data: { label: 'Tienda', url: 'https://tienda.mx' } })
    expect(b.statusCode).toBe(201)
    const faq = await call(t, 'POST', `/api/v1/links/${page.id}/blocks`, key, { type: 'faq', data: { items: [{ q: '¿Envíos?', a: 'Sí' }] } })
    expect(faq.statusCode).toBe(201)
    expect((await call(t, 'POST', `/api/v1/links/${page.id}/blocks`, key, { type: 'avatar', data: {} })).json().error.code).toBe('type_needs_upload')
    expect((await call(t, 'GET', `/api/v1/links/${page.id}/blocks`, key)).json().items.length).toBe(2)
    // otra cuenta no ve nada
    const u2 = await seedUser(t, 'beto@example.com')
    setPlan(t, u2.id, 'business')
    t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(u2.id)
    const b2 = await loginAgent(t, 'beto@example.com')
    await b2.get('/panel/api')
    await b2.post('/panel/api', { name: 'x' })
    const key2 = /tb_[a-z0-9]{8}_[A-Za-z0-9_-]{32,64}/.exec((await b2.get('/panel/api')).body)![0]
    expect((await call(t, 'GET', `/api/v1/links/${page.id}`, key2)).statusCode).toBe(404)
    expect((await call(t, 'DELETE', `/api/v1/blocks/${b.json().id}`, key2)).statusCode).toBe(404)
  })

  it('QR al vuelo', async () => {
    const t = await makeApp()
    const { key } = await keyFor(t)
    const svg = await call(t, 'POST', '/api/v1/qr/render', key, { kind: 'url', data: { url: 'tubio.link' }, style: { modules: 'dot' } })
    expect(svg.headers['content-type']).toContain('image/svg+xml')
    const png = await call(t, 'POST', '/api/v1/qr/render', key, { kind: 'text', data: { text: 'hola' }, format: 'png' })
    expect(png.rawPayload.subarray(1, 4).toString()).toBe('PNG')
  })
})
