import { describe, expect, it } from 'vitest'
import { HELP_ARTICLES } from '../src/modules/help/routes.ts'
import { Agent, makeApp } from './helpers.ts'

describe('centro de ayuda', () => {
  it('artículos en ambos idiomas', async () => {
    const t = await makeApp()
    const idx = await new Agent(t.app).get('/help')
    for (const s of HELP_ARTICLES) {
      expect(idx.body).toContain(`/help/${s}`)
      const es = await new Agent(t.app).get(`/help/${s}`)
      const en = await new Agent(t.app).get(`/help/${s}`, { 'accept-language': 'en' })
      expect(es.statusCode).toBe(200)
      expect(en.body).not.toBe(es.body)
    }
    expect((await new Agent(t.app).get('/help/../../etc/passwd')).statusCode).toBe(404)
  })

  it('el formulario sólo escribe a nuestro buzón, con Reply-To del visitante', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/help/contact')
    expect((await v.post('/help/contact', { email: 'x', message: 'hola hola hola' })).statusCode).toBe(422)
    expect((await v.post('/help/contact', { email: 'ana@example.com', topic: 'bug', message: 'No carga mi página bio' })).body).toContain('recibimos tu mensaje')
    const m = t.mailer.sent.at(-1)!
    expect(m.to).toBe('hola@tubio.link')
    expect(m.replyTo).toBe('ana@example.com')
    expect(m.subject).toContain('bug')
    expect(t.mailer.sent).toHaveLength(1)
  })
})

describe('soporte → Zammad', () => {
  it('crea el ticket con el visitante como cliente; si Zammad falla, cae al correo', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    let ok = true
    const t = await makeApp({ fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(JSON.stringify({ number: '17123' }), { status: ok ? 201 : 500 })
    }) as unknown as typeof fetch })
    process.env.TUBIO_ZAMMAD_URL = 'https://soporte.test'
    process.env.TUBIO_ZAMMAD_TOKEN = 'x'
    const v = new Agent(t.app)
    await v.get('/help/contact')
    await v.post('/help/contact', { email: 'ana@example.com', topic: 'billing', message: 'No veo mi recibo de pago' })
    expect(calls[0]!.url).toBe('https://soporte.test/api/v1/tickets')
    expect(calls[0]!.body).toMatchObject({ group: 'tubio', customer_id: 'guess:ana@example.com', tags: 'tubio,billing' })
    expect(t.mailer.sent).toHaveLength(0)
    ok = false
    await v.post('/help/contact', { email: 'ana@example.com', topic: 'bug', message: 'Otra cosa que falla aquí' })
    expect(t.mailer.sent).toHaveLength(1)
    delete process.env.TUBIO_ZAMMAD_URL
    delete process.env.TUBIO_ZAMMAD_TOKEN
  })
})
