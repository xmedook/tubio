import { describe, expect, it } from 'vitest'
import { planOf } from '../src/modules/plans/limits.ts'
import { findUserById } from '../src/modules/users/repo.ts'
import { loginAgent, makeApp, seedUser } from './helpers.ts'

describe('códigos de canje', () => {
  it('admin crea un código con usos; cada quien lo canjea una vez; vence; no baja de plan', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(u.id)
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const adm = await loginAgent(t, 'admin@example.com')
    await adm.get('/admin/redeem')
    await adm.post('/admin/redeem', { plan: 'pro', days: '30', code: 'feria2026', max_uses: '2' })
    await adm.post('/admin/redeem', { plan: 'business', days: '7', count: '3' })
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM redeem_codes').pluck().get()).toBe(4)
    const a = await loginAgent(t)
    await a.get('/panel/plan')
    await a.post('/panel/plan/redeem', { code: ' Feria2026 ' })
    let me = findUserById(t.deps.db, u.id)!
    expect(planOf(t.deps.db, me, t.clock.now).slug).toBe('pro')
    expect(me.plan_expires_at).toBe(t.clock.now + 30 * 86400_000)
    await a.post('/panel/plan/redeem', { code: 'FERIA2026' })
    expect((await a.get('/panel/plan')).body).toContain('Ya canjeaste ese código')
    // código de Negocio sobre Pro: sube
    const one = t.deps.db.prepare("SELECT code FROM redeem_codes WHERE code != 'FERIA2026' LIMIT 1").pluck().get() as string
    await a.post('/panel/plan/redeem', { code: one })
    me = findUserById(t.deps.db, u.id)!
    expect(planOf(t.deps.db, me, t.clock.now).slug).toBe('business')
    // otro de Pro estando en Negocio: no baja
    await adm.post('/admin/redeem', { plan: 'pro', days: '30', code: 'OTROPRO' })
    await a.post('/panel/plan/redeem', { code: 'OTROPRO' })
    expect(planOf(t.deps.db, findUserById(t.deps.db, u.id)!, t.clock.now).slug).toBe('business')
    // usado por otro → se agota
    const b = await seedUser(t, 'beto@example.com')
    t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(b.id)
    const c = await seedUser(t, 'cata@example.com')
    t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(c.id)
    const ba = await loginAgent(t, 'beto@example.com')
    await ba.get('/panel/plan')
    await ba.post('/panel/plan/redeem', { code: 'FERIA2026' })
    const ca = await loginAgent(t, 'cata@example.com')
    await ca.get('/panel/plan')
    await ca.post('/panel/plan/redeem', { code: 'FERIA2026' })
    expect((await ca.get('/panel/plan')).body).toContain('ya se usó todas las veces')
  })
})
