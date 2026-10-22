import { describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { findUserByEmail, updateUser } from '../src/modules/users/repo.ts'
import { loginAgent, makeApp, seedUser, setPlan } from './helpers.ts'

describe('equipos', () => {
  it('invitar, aceptar, trabajar en el espacio del dueño según el rol', async () => {
    const t = await makeApp()
    const owner = await seedUser(t, 'duena@example.com')
    setPlan(t, owner.id, 'business')
    const member = await seedUser(t, 'beto@example.com')
    updateUser(t.deps.db, member.id, { email_verified_at: 1 })
    const o = await loginAgent(t, 'duena@example.com')
    await o.get('/panel/team')
    await o.post('/panel/team', { email: 'Beto@Example.com', role: 'viewer' })
    const link = /\/panel\/team\/accept\/[\w-]+/.exec(t.mailer.sent.at(-1)!.text)![0]
    // otra persona no puede usar la invitación
    await seedUser(t, 'otro@example.com')
    const x = await loginAgent(t, 'otro@example.com')
    expect((await x.get(link)).statusCode).toBe(400)
    const b = await loginAgent(t, 'beto@example.com')
    expect((await b.get(link)).statusCode).toBe(303)
    await b.get('/panel/team')
    await b.post(`/panel/workspace/${owner.id}`)
    const panel = await b.get('/panel')
    expect(panel.body).toContain('Trabajas en el espacio de')
    // lector: no puede crear
    expect((await b.postMultipart('/panel/links?kind=short', { alias: 'nolector', target_url: 'https://a.mx', is_enabled: '1' })).statusCode).toBe(403)
    // la dueña lo sube a editor
    const mid = t.deps.db.prepare('SELECT id FROM team_members').pluck().get() as number
    await o.get('/panel/team')
    await o.post(`/panel/team/${mid}/role`, { role: 'editor' })
    await b.get('/panel/links/new?kind=short')
    expect((await b.postMultipart('/panel/links?kind=short', { alias: 'del-equipo', target_url: 'https://a.mx', is_enabled: '1' })).statusCode).toBe(303)
    expect(findByAlias(t.deps.db, 'del-equipo')!.user_id).toBe(owner.id)
    const row = t.deps.db.prepare("SELECT actor_id, user_id FROM audit_log WHERE action = 'link.create'").get() as { actor_id: number; user_id: number }
    expect(row).toEqual({ actor_id: member.id, user_id: owner.id })
    // editor no toca dominios; su cuenta sigue siendo la suya
    expect((await b.post('/panel/domains', { host: 'x.mimarca.com' })).statusCode).toBe(403)
    expect((await b.get('/panel/account')).body).toContain('beto@example.com')
    // rutas con %xx: Fastify las decodifica, los permisos también deben verlas
    expect((await b.post('/panel/%64omains', { host: 'y.mimarca.com' })).statusCode).toBe(403)
    expect((await b.get('/panel/%61ccount')).body).toContain('beto@example.com')
    await b.post(`/panel/%74eam/${mid}/role`, { role: 'admin' })
    expect(t.deps.db.prepare('SELECT role FROM team_members WHERE id = ?').pluck().get(mid)).toBe('editor')
    await b.post('/panel/%61pi', { name: 'robada' })
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM api_keys WHERE user_id = ?').pluck().get(owner.id)).toBe(0)
    expect((await b.get('/panel//%61ccount/export')).body).not.toContain('duena@example.com')
    // aunque la dueña sea admin del sitio, desde su espacio nadie es admin
    updateUser(t.deps.db, owner.id, { role: 'admin' })
    expect((await b.get('/%61dmin')).statusCode).toBe(404)
    expect((await b.get('/admin/users')).statusCode).toBe(404)
    updateUser(t.deps.db, owner.id, { role: 'user' })
    // al quitarlo pierde el acceso
    await o.post(`/panel/team/${mid}/remove`)
    expect((await b.get('/panel')).body).not.toContain('del-equipo')
    expect(findUserByEmail(t.deps.db, 'beto@example.com')).toBeTruthy()
  })

  it('sin plan Negocio no se invita', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/team')
    expect((await a.post('/panel/team', { email: 'x@example.com', role: 'editor' })).headers.location).toBe('/panel/plan')
  })
})
