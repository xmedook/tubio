import { describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { findUserByEmail } from '../src/modules/users/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36' }

async function setup() {
  const t = await makeApp()
  await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
  await seedUser(t, 'ana@example.com')
  const admin = await loginAgent(t, 'admin@example.com')
  const ana = await loginAgent(t, 'ana@example.com')
  return { t, admin, ana, anaId: findUserByEmail(t.deps.db, 'ana@example.com')!.id }
}

describe('admin', () => {
  it('sólo admins entran', async () => {
    const { admin, ana } = await setup()
    expect((await ana.get('/admin')).statusCode).toBe(404)
    expect((await ana.post('/admin/settings', { registration_open: '' })).statusCode).toBe(404)
    const home = await admin.get('/admin')
    expect(home.statusCode).toBe(200)
    expect(home.body).toContain('Bitácora')
    expect((await admin.get('/admin/users?q=ana')).body).toContain('ana@example.com')
  })

  it('suspender corta sesiones y enlaces; insignia de verificado', async () => {
    const { t, admin, ana, anaId } = await setup()
    await ana.get('/panel/links/new?kind=short')
    await ana.postMultipart('/panel/links?kind=short', { alias: 'tienda', target_url: 'https://a.mx', is_enabled: '1' })
    await admin.get(`/admin/users/${anaId}`)
    await admin.post(`/admin/users/${anaId}`, { suspended: '1', is_verified: '1' })
    expect((await ana.get('/panel')).statusCode).toBe(303)
    expect((await new Agent(t.app).get('/tienda', UA)).statusCode).toBe(404)
    expect(findUserByEmail(t.deps.db, 'ana@example.com')!.is_verified).toBe(1)
    await admin.post(`/admin/users/${anaId}`, { is_verified: '1' })
    expect((await new Agent(t.app).get('/tienda', UA)).statusCode).toBe(302)
  })

  it('entrar como otro usuario y volver', async () => {
    const { admin, anaId } = await setup()
    await admin.get(`/admin/users/${anaId}`)
    expect((await admin.post(`/admin/users/${anaId}/impersonate`)).headers.location).toBe('/panel')
    const panel = await admin.get('/panel')
    expect(panel.body).toContain('Estás viendo la cuenta de ana@example.com')
    expect((await admin.get('/admin')).statusCode).toBe(404) // ahora es Ana
    expect((await admin.post('/panel/account/delete', { current: 'contrasena-segura' })).statusCode).toBe(403)
    await admin.get('/panel')
    expect((await admin.post('/admin/stop-impersonating')).headers.location).toBe(`/admin/users/${anaId}`)
    expect((await admin.get('/admin')).statusCode).toBe(200)
  })

  it('un usuario normal no puede "volver" a una cuenta admin', async () => {
    const { ana } = await setup()
    expect((await ana.post('/admin/stop-impersonating')).headers.location).toBe('/login')
  })

  it('bloquea dominios, desactiva enlaces y cierra el registro', async () => {
    const { t, admin, ana } = await setup()
    await admin.get('/admin/blocked-hosts')
    await admin.post('/admin/blocked-hosts', { host: 'https://www.Malo.com/x', reason: 'phishing' })
    expect(t.deps.db.prepare('SELECT host FROM blocked_hosts').pluck().all()).toEqual(['malo.com'])
    await ana.get('/panel/links/new?kind=short')
    expect((await ana.postMultipart('/panel/links?kind=short', { target_url: 'https://login.malo.com', is_enabled: '1' })).statusCode).toBe(422)
    await ana.postMultipart('/panel/links?kind=short', { alias: 'ok1', target_url: 'https://bien.mx', is_enabled: '1' })
    const id = findByAlias(t.deps.db, 'ok1')!.id
    await admin.get('/admin/links')
    await admin.post(`/admin/links/${id}/toggle`)
    expect((await new Agent(t.app).get('/ok1', UA)).statusCode).toBe(404)
    await admin.get('/admin/settings')
    await admin.post('/admin/settings', { site_name: 'tubio', stats_retention_days: '90' })
    expect((await new Agent(t.app).get('/register')).statusCode).toBe(403)
  })

  it('borrar usuario', async () => {
    const { t, admin, anaId } = await setup()
    await admin.get(`/admin/users/${anaId}`)
    await admin.post(`/admin/users/${anaId}/delete`)
    expect(findUserByEmail(t.deps.db, 'ana@example.com')).toBeUndefined()
  })
})
