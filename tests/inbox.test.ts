import { describe, expect, it } from 'vitest'
import { notifyUser, unreadCount } from '../src/modules/inbox/repo.ts'
import { loginAgent, makeApp, seedUser } from './helpers.ts'

describe('campanita', () => {
  it('contador en la cabecera; al abrir la lista quedan leídas; cada quien ve las suyas', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const b = await seedUser(t, 'beto@example.com')
    notifyUser(t.deps.db, u.id, { kind: 'capture', title: 'Nuevo mensaje en /cafe', body: 'Ana · hola', url: '/panel/data' }, t.clock.now)
    notifyUser(t.deps.db, b.id, { kind: 'capture', title: 'De otro', url: '/panel' }, t.clock.now)
    const a = await loginAgent(t)
    expect((await a.get('/panel')).body).toContain('class="bell-n" aria-hidden="true">1<')
    const list = await a.get('/panel/inbox')
    expect(list.body).toContain('Nuevo mensaje en /cafe')
    expect(list.body).not.toContain('De otro')
    expect(unreadCount(t.deps.db, u.id)).toBe(0)
    expect((await a.get('/panel')).body).not.toContain('bell-n')
  })
})
