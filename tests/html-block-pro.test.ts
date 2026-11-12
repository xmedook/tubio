import { describe, expect, it } from 'vitest'
import { blockTypeAllowed, limitsOf } from '../src/modules/plans/limits.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { loginAgent, makeApp, seedUser, setPlan } from './helpers.ts'

// TEMPORAL (peer #2386): Pro puede usar el bloque HTML; iframe y código propio siguen siendo de Negocio.
describe('bloque HTML en Pro (temporal)', () => {
  it('Pro: html sí, iframe y código propio no; Negocio y Gratis como siempre', async () => {
    const t = await makeApp()
    const now = t.deps.now()
    const pro = await seedUser(t)
    setPlan(t, pro.id, 'pro')
    const lp = limitsOf(t.deps.db, { role: 'user', plan_id: t.deps.db.prepare('SELECT id FROM plans WHERE slug = ?').pluck().get('pro') as number }, now)
    expect(lp.custom_code).toBe(false)
    expect(blockTypeAllowed(lp, 'html')).toBe(true)
    expect(blockTypeAllowed(lp, 'iframe')).toBe(false)
    const biz = limitsOf(t.deps.db, { role: 'user', plan_id: t.deps.db.prepare('SELECT id FROM plans WHERE slug = ?').pluck().get('business') as number }, now)
    expect(blockTypeAllowed(biz, 'html')).toBe(true)
    expect(blockTypeAllowed(biz, 'iframe')).toBe(true)
    const free = limitsOf(t.deps.db, { role: 'user', plan_id: null }, now)
    expect(blockTypeAllowed(free, 'html')).toBe(false)
  })

  it('se revierte con un UPDATE, sin deploy', async () => {
    const t = await makeApp()
    t.deps.db.prepare("UPDATE plans SET limits = json_set(limits, '$.html_block', json('false')) WHERE slug = 'pro'").run()
    const id = t.deps.db.prepare('SELECT id FROM plans WHERE slug = ?').pluck().get('pro') as number
    expect(blockTypeAllowed(limitsOf(t.deps.db, { role: 'user', plan_id: id }, t.deps.now()), 'html')).toBe(false)
  })

  it('página de un dueño Pro: el HTML se sirve; con el flag apagado deja de servirse', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    setPlan(t, u.id, 'pro')
    t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(u.id)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'heroe', title: 'Heroe', is_enabled: '1' })
    const link = findByAlias(t.deps.db, 'heroe')!
    const bid = Number(t.deps.db.prepare("INSERT INTO bio_blocks (link_id, type, position, data, created_at, updated_at) VALUES (?, 'html', 0, '{\"code\":\"<video>HEROE</video>\",\"height\":380}', 0, 0)").run(link.id).lastInsertRowid)
    const hdr = { 'sec-fetch-dest': 'iframe' }
    expect((await t.app.inject({ method: 'GET', url: '/heroe' })).body).toContain(`/_/h/${bid}`)
    const r = await t.app.inject({ method: 'GET', url: `/_/h/${bid}`, headers: hdr })
    expect(r.statusCode).toBe(200)
    expect(r.body).toContain('HEROE')
    t.deps.db.prepare("UPDATE plans SET limits = json_set(limits, '$.html_block', json('false')) WHERE slug = 'pro'").run()
    expect((await t.app.inject({ method: 'GET', url: `/_/h/${bid}`, headers: hdr })).statusCode).toBe(404)
  })
})
