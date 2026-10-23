import { describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { loginAgent, makeApp, seedUser } from './helpers.ts'

describe('plantillas', () => {
  it('generales de arranque: vista previa y crear página con alias', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    const gal = await a.get('/panel/templates')
    expect(gal.body).toContain('Restaurante o cafetería')
    const id = t.deps.db.prepare("SELECT id FROM templates WHERE slug = 'restaurante'").pluck().get() as number
    const prev = await a.get(`/_/tpl/${id}`)
    expect(prev.statusCode).toBe(200)
    expect(prev.body).toContain('Pide por WhatsApp')
    const r = await a.post(`/panel/templates/${id}/use`, { alias: 'Mi Café', title: 'Mi Café' })
    const page = findByAlias(t.deps.db, 'mi-cafe')!
    expect(r.headers.location).toBe(`/panel/links/${page.id}/blocks`)
    expect(listBlocks(t.deps.db, page.id).map((b) => b.type)).toEqual(['heading', 'paragraph', 'big_link', 'link', 'link', 'hours', 'socials'])
    expect(page.data.theme).toBe('papel')
    expect(t.deps.db.prepare('SELECT uses FROM templates WHERE id = ?').pluck().get(id)).toBe(1)
    // plan gratis: 1 página bio → la segunda no
    expect((await a.post(`/panel/templates/${id}/use`, { alias: 'otra-mas' })).statusCode).toBe(402)
  })

  it('guardar mi página como plantilla privada; otra cuenta no la ve', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    t.deps.db.prepare("UPDATE users SET plan_id = (SELECT id FROM plans WHERE slug = 'pro') WHERE id = ?").run(u.id)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'base', title: 'Base', is_enabled: '1' })
    const base = findByAlias(t.deps.db, 'base')!
    await a.get(`/panel/links/${base.id}/blocks`)
    await a.post(`/panel/links/${base.id}/save-template`, { name: 'Mi formato', general: '1' })
    const tp = t.deps.db.prepare("SELECT id, user_id FROM templates WHERE name = 'Mi formato'").get() as { id: number; user_id: number }
    expect(tp.user_id).toBe(u.id) // no es admin: queda privada aunque pida general
    await seedUser(t, 'beto@example.com')
    const b = await loginAgent(t, 'beto@example.com')
    expect((await b.get('/panel/templates')).body).not.toContain('Mi formato')
    expect((await b.get(`/_/tpl/${tp.id}`)).statusCode).toBe(404)
    await a.post(`/panel/templates/${tp.id}/use`, { alias: 'copia-formato' })
    expect(findByAlias(t.deps.db, 'copia-formato')).toBeTruthy()
  })
})
