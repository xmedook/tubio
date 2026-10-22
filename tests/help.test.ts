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
