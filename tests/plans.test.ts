import { describe, expect, it } from 'vitest'
import { limitsOf, planOf } from '../src/modules/plans/limits.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { findUserById } from '../src/modules/users/repo.ts'
import { Agent, loginAgent, makeApp, seedUser, setPlan } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 Chrome/130' }

describe('planes', () => {
  it('sin plan = gratis; plan vencido vuelve a gratis; admin sin límites', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    expect(planOf(t.deps.db, findUserById(t.deps.db, u.id)!, t.clock.now).slug).toBe('free')
    setPlan(t, u.id, 'pro', t.clock.now + 1000)
    expect(planOf(t.deps.db, findUserById(t.deps.db, u.id)!, t.clock.now).slug).toBe('pro')
    expect(planOf(t.deps.db, findUserById(t.deps.db, u.id)!, t.clock.now + 2000).slug).toBe('free')
    const adm = await seedUser(t, 'adm@example.com', 'contrasena-segura', 'admin')
    expect(limitsOf(t.deps.db, adm, t.clock.now).bio_pages).toBe(-1)
  })

  it('gratis: 1 página bio, marca obligatoria, sin HTML propio ni webhooks', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    expect((await a.postMultipart('/panel/links?kind=bio', { alias: 'una', is_enabled: '1' })).statusCode).toBe(303)
    const second = await a.postMultipart('/panel/links?kind=bio', { alias: 'dos', is_enabled: '1' })
    expect(second.statusCode).toBe(402)
    expect(second.body).toContain('no permite más páginas bio')
    const id = findByAlias(t.deps.db, 'una')!.id
    await a.get(`/panel/links/${id}/design`)
    await a.postMultipart(`/panel/links/${id}/design`, { theme: 'nube', share_button: '1' }) // sin show_branding
    expect((await new Agent(t.app).get('/una', UA)).body).toContain('Hecho con')
    const editor = await a.get(`/panel/links/${id}/blocks`)
    expect(editor.body).toMatch(/class="pick locked" href="\/panel\/plan"/)
    const html = await a.postMultipart(`/panel/links/${id}/blocks?type=html`, { code: '<p>x</p>', is_enabled: '1' })
    expect(html.headers.location).toBe(`/panel/links/${id}/blocks`)
    expect(t.deps.db.prepare("SELECT COUNT(*) FROM bio_blocks WHERE type = 'html'").pluck().get()).toBe(0)
    await a.get('/panel/notifications?kind=webhook')
    expect((await a.post('/panel/notifications?kind=webhook', { name: 'wh', url: 'https://ejemplo.com/hook' })).headers.location).toBe('/panel/plan')
  })

  it('pro: quita la marca y crea más páginas', async () => {
    const t = await makeApp()
    setPlan(t, (await seedUser(t)).id, 'pro')
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'una', is_enabled: '1' })
    expect((await a.postMultipart('/panel/links?kind=bio', { alias: 'dos', is_enabled: '1' })).statusCode).toBe(303)
    const id = findByAlias(t.deps.db, 'una')!.id
    await a.get(`/panel/links/${id}/design`)
    await a.postMultipart(`/panel/links/${id}/design`, { theme: 'nube', share_button: '1' })
    expect((await new Agent(t.app).get('/una', UA)).body).not.toContain('Hecho con')
  })

  it('estadísticas: el plan gratis sólo ve 30 días', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'cort', target_url: 'https://a.mx', is_enabled: '1' })
    const id = findByAlias(t.deps.db, 'cort')!.id
    const page = await a.get(`/panel/links/${id}/stats?from=2026-01-01&to=2026-10-22`)
    expect(page.body).toContain('value="2026-09-23"')
  })
})

describe('página de plan y asignación', () => {
  it('muestra uso y el admin asigna plan con vencimiento', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const a = await loginAgent(t)
    const page = await a.get('/panel/plan')
    expect(page.body).toContain('Plan actual: Gratis')
    expect(page.body).toContain('$99')
    const adm = await loginAgent(t, 'admin@example.com')
    await adm.get(`/admin/users/${u.id}`)
    const pro = t.deps.db.prepare("SELECT id FROM plans WHERE slug = 'pro'").pluck().get() as number
    await adm.post(`/admin/users/${u.id}`, { plan_id: String(pro), plan_expires: '2026-12-31' })
    expect((await a.get('/panel/plan')).body).toContain('Plan actual: Pro')
  })
})

describe('retención por plan', () => {
  it('gratis borra lo de más de 30 días; pro lo conserva', async () => {
    const { purgeStatsByPlan } = await import('../src/jobs.ts')
    const t = await makeApp()
    const free = await seedUser(t)
    const pro = await seedUser(t, 'pro@example.com')
    setPlan(t, pro.id, 'pro')
    const ins = t.deps.db.prepare("INSERT INTO links (user_id, alias, kind, created_at, updated_at) VALUES (?, ?, 'short', 0, 0)")
    const l1 = Number(ins.run(free.id, 'free-l').lastInsertRowid)
    const l2 = Number(ins.run(pro.id, 'pro-l').lastInsertRowid)
    const ev = t.deps.db.prepare("INSERT INTO stat_events (link_id, kind, ts, day, hour, visitor) VALUES (?, 'view', ?, '2026-08-01', 0, 'v')")
    const old = t.clock.now - 60 * 86400_000
    ev.run(l1, old)
    ev.run(l2, old)
    expect(purgeStatsByPlan(t.deps)).toBe(1)
    expect(t.deps.db.prepare('SELECT link_id FROM stat_events').pluck().all()).toEqual([l2])
  })
})
