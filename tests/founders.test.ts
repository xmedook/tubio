import { describe, expect, it } from 'vitest'
import { setSetting } from '../src/modules/settings/repo.ts'
import { planOf } from '../src/modules/plans/limits.ts'
import { claimFounder } from '../src/modules/plans/founders.ts'
import { findUserById } from '../src/modules/users/repo.ts'
import { Agent, makeApp, seedUser } from './helpers.ts'

describe('fundadores', () => {
  it('al confirmar el correo: número fijo y un año de Negocio, hasta agotar lugares', async () => {
    const t = await makeApp()
    setSetting(t.deps.db, 'founders_max', 2)
    const a = new Agent(t.app)
    expect((await a.get('/')).body).toContain('Quedan 2')
    await a.get('/register')
    await a.post('/register', { email: 'uno@example.com', password: 'contrasena-segura', accept: '1' })
    const link = /\/verify\/[\w-]+/.exec(t.mailer.sent.at(-1)!.text)![0]
    await a.get(link)
    const uno = findUserById(t.deps.db, 1)!
    expect(uno.founder_no).toBe(1)
    expect(planOf(t.deps.db, uno, t.clock.now).slug).toBe('business')
    expect(uno.plan_expires_at).toBe(t.clock.now + 365 * 86400_000)
    expect(claimFounder(t.deps, 1)).toBeNull() // no dos veces
    // sin correo confirmado no cuenta
    const sin = await seedUser(t, 'sin@example.com')
    expect(claimFounder(t.deps, sin.id)).toBeNull()
    for (const e of ['dos@example.com', 'tres@example.com']) {
      const u = await seedUser(t, e)
      t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(u.id)
      claimFounder(t.deps, u.id)
    }
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM users WHERE founder_no IS NOT NULL').pluck().get()).toBe(2)
    expect((await new Agent(t.app).get('/')).body).not.toContain('Fundadores:')
  })
})
