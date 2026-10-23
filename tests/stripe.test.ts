import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { planOf } from '../src/modules/plans/limits.ts'
import { verifyStripeSignature } from '../src/modules/plans/stripe.ts'
import { findUserById } from '../src/modules/users/repo.ts'
import { loginAgent, makeApp, seedUser, type TestApp } from './helpers.ts'

const SECRET = 'whsec_prueba'
beforeAll(() => {
  process.env.TUBIO_STRIPE_SECRET_KEY = 'sk_test_x'
  process.env.TUBIO_STRIPE_WEBHOOK_SECRET = SECRET
})
afterAll(() => {
  delete process.env.TUBIO_STRIPE_SECRET_KEY
  delete process.env.TUBIO_STRIPE_WEBHOOK_SECRET
})

function hook(t: TestApp, ev: unknown, secret = SECRET) {
  const raw = JSON.stringify(ev)
  const ts = Math.floor(t.clock.now / 1000)
  const sig = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')
  return t.app.inject({ method: 'POST', url: '/_/stripe/webhook', payload: raw, headers: { 'content-type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` } })
}

describe('Stripe', () => {
  it('firma: válida, alterada, vieja', () => {
    const raw = '{"a":1}'
    const now = 1_800_000_000_000
    const ts = now / 1000
    const v = createHmac('sha256', 's').update(`${ts}.${raw}`).digest('hex')
    expect(verifyStripeSignature(raw, `t=${ts},v1=${v}`, 's', now)).toBe(true)
    expect(verifyStripeSignature(raw + ' ', `t=${ts},v1=${v}`, 's', now)).toBe(false)
    expect(verifyStripeSignature(raw, `t=${ts},v1=${v}`, 's', now + 10 * 60_000)).toBe(false)
  })

  it('tarjeta: abre Checkout con metadata tubio; el webhook firmado activa el plan una sola vez', async () => {
    const sent: { url: string; body: string; headers: Record<string, string> }[] = []
    const t = await makeApp({ fetch: (async (url: string, init: RequestInit) => {
      sent.push({ url, body: String(init.body), headers: init.headers as Record<string, string> })
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 })
    }) as unknown as typeof fetch })
    const u = await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/checkout?plan=pro&period=year')
    const res = await a.post('/panel/checkout?plan=pro&period=year', {})
    const pid = Number(/\/panel\/payments\/(\d+)/.exec(String(res.headers.location))![1])
    const page = await a.get(`/panel/payments/${pid}`)
    expect(page.body).toContain('Pagar con tarjeta')
    expect(page.body).not.toContain('CLABE') // sin datos bancarios configurados
    const go = await a.post(`/panel/payments/${pid}/stripe`)
    expect(go.headers.location).toBe('https://checkout.stripe.com/c/pay/cs_test_1')
    const body = new URLSearchParams(sent[0]!.body)
    expect(sent[0]!.url).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(body.get('metadata[app]')).toBe('tubio')
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('99000')
    expect(body.get('line_items[0][price_data][currency]')).toBe('mxn')
    // otro sistema de la misma cuenta: se ignora
    expect((await hook(t, { type: 'checkout.session.completed', data: { object: { metadata: { app: 'cotizador' }, payment_status: 'paid' } } })).json()).toEqual({ ignored: true })
    // firma falsa
    expect((await hook(t, { type: 'x', data: { object: {} } }, 'otro')).statusCode).toBe(400)
    // monto distinto: no activa
    const ev = (amount: number) => ({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', metadata: { app: 'tubio', payment_id: String(pid) }, payment_status: 'paid', amount_total: amount, currency: 'mxn', payment_intent: 'pi_1' } } })
    await hook(t, ev(100))
    expect(planOf(t.deps.db, findUserById(t.deps.db, u.id)!, t.clock.now).slug).toBe('free')
    expect((await hook(t, ev(99000))).statusCode).toBe(200)
    const user = findUserById(t.deps.db, u.id)!
    expect(planOf(t.deps.db, user, t.clock.now).slug).toBe('pro')
    const exp = user.plan_expires_at
    expect(t.deps.db.prepare('SELECT method, status, provider_ref FROM payments WHERE id = ?').get(pid)).toEqual({ method: 'stripe', status: 'paid', provider_ref: 'pi_1' })
    await hook(t, ev(99000)) // reintento de Stripe: no extiende dos veces
    expect(findUserById(t.deps.db, u.id)!.plan_expires_at).toBe(exp)
  })
})
