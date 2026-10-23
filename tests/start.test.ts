import { describe, expect, it } from 'vitest'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, makeApp } from './helpers.ts'

describe('primer uso', () => {
  it('reclamar → registro → asistente → página publicada con WhatsApp e Instagram → compartir', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/register?alias=cafe-luna')
    const r = await v.post('/register', { email: 'luna@example.com', password: 'contrasena-segura', accept: '1', claim: 'cafe-luna' })
    expect(r.headers.location).toBe('/panel/start?alias=cafe-luna')
    const start = await v.get(String(r.headers.location))
    expect(start.body).toContain('value="cafe-luna"')
    const tpl = t.deps.db.prepare("SELECT id FROM templates WHERE slug = 'restaurante'").pluck().get() as number
    const bad = await v.postMultipart('/panel/start', { tpl: String(tpl), alias: 'cafe-luna', name: '', whatsapp: '12' })
    expect(bad.statusCode).toBe(422)
    const ok = await v.postMultipart('/panel/start', { tpl: String(tpl), alias: 'cafe-luna', name: 'Café Luna', whatsapp: '55 1234 5678', instagram: '@cafeluna' })
    const page = findByAlias(t.deps.db, 'cafe-luna')!
    expect(ok.headers.location).toBe(`/panel/start/done?id=${page.id}`)
    const blocks = listBlocks(t.deps.db, page.id)
    expect(blocks[0]!.data.text).toBe('Café Luna')
    expect(blocks.some((b) => b.data.url === 'https://wa.me/525512345678')).toBe(true)
    expect(JSON.stringify(blocks.find((b) => b.type === 'socials')!.data)).toContain('instagram.com/cafeluna')
    const done = await v.get(String(ok.headers.location))
    expect(done.body).toContain('tubio.test/cafe-luna')
    expect(done.body).toContain('wa.me/?text=')
  })

  it('en blanco y sin WhatsApp: no deja botones de ejemplo vacíos', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/register')
    await v.post('/register', { email: 'x@example.com', password: 'contrasena-segura', accept: '1' })
    await v.get('/panel/start')
    await v.postMultipart('/panel/start', { tpl: '', alias: 'solo-yo', name: 'Solo yo' })
    const blocks = listBlocks(t.deps.db, findByAlias(t.deps.db, 'solo-yo')!.id)
    expect(blocks.map((b) => b.type)).toEqual(['heading'])
  })
})
