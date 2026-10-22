import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { findUserByEmail } from '../src/modules/users/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

beforeAll(() => {
  process.env.TUBIO_BANK_CLABE = '012345678901234567'
})
afterAll(() => {
  delete process.env.TUBIO_BANK_CLABE
})

describe('directorio', () => {
  it('sólo lista páginas con opt-in, correo verificado y 3+ bloques; admin puede ocultar', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'anafoto', title: 'Ana Fotografía', is_enabled: '1' })
    const link = findByAlias(t.deps.db, 'anafoto')!
    const db = t.deps.db
    for (let i = 0; i < 3; i++) db.prepare("INSERT INTO bio_blocks (link_id, type, position, data, created_at, updated_at) VALUES (?, 'heading', ?, '{\"text\":\"x\"}', 0, 0)").run(link.id, i)
    const pub = new Agent(t.app)
    expect((await pub.get('/directory')).body).not.toContain('Ana Fotografía')
    // opt-in desde Diseño
    await a.get(`/panel/links/${link.id}/design`)
    const r = await a.postMultipart(`/panel/links/${link.id}/design`, { theme: 'tinta', directory: '1', category: 'art' })
    expect(r.statusCode, r.body.slice(0, 300)).toBe(303)
    expect((await pub.get('/directory')).body).not.toContain('Ana Fotografía') // correo sin verificar
    db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(u.id)
    const list = await pub.get('/directory?cat=art')
    expect(list.body).toContain('Ana Fotografía')
    expect(list.body).toContain('href="http://tubio.test/anafoto"')
    expect((await pub.get('/directory?cat=music')).body).not.toContain('Ana Fotografía')
    expect((await pub.get('/directory?q=fotog')).body).toContain('Ana Fotografía')
    expect((await pub.get('/directory?q=%25')).body).not.toContain('Ana Fotografía')
    const adm = await loginAgent(t, 'admin@example.com')
    await adm.get('/admin/links')
    await adm.post(`/admin/links/${link.id}/dir-hide`)
    expect((await pub.get('/directory')).body).not.toContain('Ana Fotografía')
  })
})

describe('afiliados', () => {
  it('?ref deja cookie → registro queda referido → pago aprobado da comisión → admin la paga', async () => {
    const t = await makeApp()
    const aff = await seedUser(t)
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const a = await loginAgent(t)
    const page = await a.get('/panel/referrals')
    const code = /\?ref=([a-z0-9]{7})/.exec(page.body)![1]
    expect((await a.get('/panel/referrals')).body).toContain(`?ref=${code}`) // estable

    const v = new Agent(t.app)
    await v.get(`/?ref=${code}`)
    await v.get('/register')
    expect((await v.post('/register', { email: 'nuevo@example.com', password: 'contrasena-segura', accept: '1' })).statusCode).toBe(303)
    const nuevo = findUserByEmail(t.deps.db, 'nuevo@example.com')!
    expect(nuevo.referred_by).toBe(aff.id)

    // cookie falsificada no cuenta
    const f = new Agent(t.app)
    await f.get('/register')
    f.cookies.set('tb_ref', code as string)
    await f.post('/register', { email: 'falso@example.com', password: 'contrasena-segura', accept: '1' })
    expect(findUserByEmail(t.deps.db, 'falso@example.com')!.referred_by).toBeNull()

    const b = await loginAgent(t, 'nuevo@example.com')
    const res = await b.post('/panel/checkout?plan=pro&period=month', { billing_name: 'Nuevo' })
    const pid = Number(/\/panel\/payments\/(\d+)/.exec(String(res.headers.location))![1])
    const adm = await loginAgent(t, 'admin@example.com')
    await adm.get('/admin/payments')
    await adm.post(`/admin/payments/${pid}/approve`)
    const amount = t.deps.db.prepare('SELECT amount - discount FROM payments WHERE id = ?').pluck().get(pid) as number
    const e = t.deps.db.prepare('SELECT * FROM referral_earnings').get() as { id: number; amount: number; status: string }
    expect(e.amount).toBe(Math.round(amount * 0.2))
    expect(e.status).toBe('pending')
    expect((await adm.get('/admin/referrals')).body).toContain('ana@example.com')
    await adm.post(`/admin/referrals/${e.id}/paid`)
    expect(t.deps.db.prepare('SELECT status FROM referral_earnings').pluck().get()).toBe('paid')
    // el referido no puede marcar nada
    expect((await b.post(`/admin/referrals/${e.id}/void`)).statusCode).not.toBe(303)
  })
})
