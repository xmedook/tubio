import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ivaBreakdown } from '../src/modules/plans/billing.ts'
import { planOf } from '../src/modules/plans/limits.ts'
import { findUserById } from '../src/modules/users/repo.ts'
import { loginAgent, makeApp, seedUser } from './helpers.ts'

beforeAll(() => {
  process.env.TUBIO_BANK_CLABE = '012345678901234567'
  process.env.TUBIO_BANK_NAME = 'Banco Prueba'
})
afterAll(() => {
  delete process.env.TUBIO_BANK_CLABE
  delete process.env.TUBIO_BANK_NAME
})

describe('cobro', () => {
  it('IVA incluido', () => {
    expect(ivaBreakdown(7900)).toEqual({ subtotal: 6810, iva: 1090 })
  })

  it('transferencia: comprobante → admin aprueba → plan activo → recibo PDF', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    t.deps.db.prepare("INSERT INTO coupons (code, percent_off, max_uses, plans, created_at) VALUES ('BIENVENIDA', 50, 1, '[\"pro\"]', 0)").run()
    const a = await loginAgent(t)
    const chk = await a.get('/panel/checkout?plan=pro&period=year&coupon=bienvenida')
    expect(chk.body).toContain('$495')
    expect(chk.body).toContain('Pruébalo gratis 14 días')
    const res = await a.post('/panel/checkout?plan=pro&period=year', { coupon: 'BIENVENIDA', billing_name: 'Ana SA' })
    expect(res.statusCode).toBe(303)
    const payPage = await a.get(String(res.headers.location))
    expect(payPage.body).toContain('012345678901234567')
    const ref = /TB[A-Z2-9]{8}/.exec(payPage.body)![0]
    const id = Number(/\/panel\/payments\/(\d+)/.exec(String(res.headers.location))![1])
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).png().toBuffer()
    expect((await a.postMultipart(`/panel/payments/${id}/proof`, {}, [{ field: 'proof', filename: 'comprobante.png', content: png, type: 'image/png' }])).statusCode).toBe(303)
    expect(t.mailer.sent.some((m) => m.to === 'admin@example.com' && m.subject.includes(ref))).toBe(true)
    // otro usuario no ve el pago
    await seedUser(t, 'beto@example.com')
    const b = await loginAgent(t, 'beto@example.com')
    expect((await b.get(`/panel/payments/${id}`)).statusCode).toBe(404)
    const adm = await loginAgent(t, 'admin@example.com')
    expect((await adm.get('/admin/payments')).body).toContain(ref)
    expect((await adm.get(`/admin/payments/${id}/proof`)).headers['content-type']).toBe('image/png')
    await adm.post(`/admin/payments/${id}/approve`)
    const user = findUserById(t.deps.db, u.id)!
    expect(planOf(t.deps.db, user, t.clock.now).slug).toBe('pro')
    expect(user.plan_expires_at).toBe(Date.UTC(2027, 9, 22, 18))
    expect(t.mailer.sent.at(-1)!.subject).toContain('Pro')
    expect(t.deps.db.prepare("SELECT used FROM coupons WHERE code = 'BIENVENIDA'").pluck().get()).toBe(1)
    const pdf = await a.get(`/panel/payments/${id}/receipt.pdf`)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF')
    // el cupón ya no sirve
    expect((await a.get('/panel/checkout?plan=pro&period=month&coupon=BIENVENIDA')).body).toContain('ya se agotó')
  })

  it('prueba gratis una sola vez; rechazo avisa al cliente', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const a = await loginAgent(t)
    await a.get('/panel/checkout?plan=business')
    await a.post('/panel/trial?plan=business')
    expect(findUserById(t.deps.db, u.id)!.plan_id).toBeNull() // sin correo verificado no hay prueba
    t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(u.id)
    await a.post('/panel/trial?plan=business')
    expect(planOf(t.deps.db, findUserById(t.deps.db, u.id)!, t.clock.now).slug).toBe('business')
    t.clock.now += 15 * 86400_000
    expect(planOf(t.deps.db, findUserById(t.deps.db, u.id)!, t.clock.now).slug).toBe('free')
    const a2 = await loginAgent(t)
    await a2.get('/panel/checkout?plan=pro')
    await a2.post('/panel/trial?plan=pro')
    expect(planOf(t.deps.db, findUserById(t.deps.db, u.id)!, t.clock.now).slug).toBe('free')
    const res = await a2.post('/panel/checkout?plan=pro&period=month', { billing_name: '' })
    const id = Number(/\/panel\/payments\/(\d+)/.exec(String(res.headers.location))![1])
    const adm = await loginAgent(t, 'admin@example.com')
    await adm.get('/admin/payments')
    await adm.post(`/admin/payments/${id}/reject`, { notes: 'No vimos el depósito' })
    expect(t.mailer.sent.at(-1)!.text).toContain('No vimos el depósito')
  })
})

describe('recordatorios y bloques de cobro propio', () => {
  it('avisa 7 y 1 día antes de vencer, una sola vez cada uno', async () => {
    const { remindExpiring } = await import('../src/jobs.ts')
    const { setPlan } = await import('./helpers.ts')
    const t = await makeApp()
    const u = await seedUser(t)
    setPlan(t, u.id, 'pro', t.clock.now + 6 * 86400_000)
    expect(await remindExpiring(t.deps)).toBe(1)
    expect(await remindExpiring(t.deps)).toBe(0)
    t.clock.now += 5.5 * 86400_000
    expect(await remindExpiring(t.deps)).toBe(1)
    expect(t.mailer.sent.at(-1)!.subject).toContain('vence en 1')
  })

  it('donación sólo con enlaces de pago reconocidos; PayPal arma el enlace', async () => {
    const { findByAlias } = await import('../src/modules/links/repo.ts')
    const { listBlocks } = await import('../src/modules/bio/repo.ts')
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'apoyo', is_enabled: '1' })
    const id = findByAlias(t.deps.db, 'apoyo')!.id
    await a.get(`/panel/links/${id}/blocks`)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=donation`, { url: 'https://phishing.com/pay', is_enabled: '1' })).statusCode).toBe(422)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=donation`, { url: 'https://buy.stripe.com/test_123', is_enabled: '1' })).statusCode).toBe(303)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=paypal`, { user: '@ana_mx', amount: '150', currency: 'MXN', is_enabled: '1' })).statusCode).toBe(303)
    const pp = listBlocks(t.deps.db, id).find((b) => b.type === 'paypal')!
    expect(pp.data.url).toBe('https://paypal.me/ana_mx/150MXN')
  })
})
