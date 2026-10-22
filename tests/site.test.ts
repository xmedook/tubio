import { describe, expect, it } from 'vitest'
import { setSetting } from '../src/modules/settings/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

describe('sitio, blog y mantenimiento', () => {
  it('admin publica entrada y página; borrador no se ve', async () => {
    const t = await makeApp()
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const adm = await loginAgent(t, 'admin@example.com')
    await adm.get('/admin/pages/new?kind=post')
    await adm.post('/admin/pages?kind=post', { title: 'Lanzamos tubio', slug: 'Lanzamos Tubio!', locale: 'es-MX', summary: 'Hola', body: '**Software libre**', published: '1' })
    await adm.post('/admin/pages?kind=page', { title: 'Precios', slug: 'precios-tubio', locale: 'es-MX', body: 'Planes', in_footer: '1', published: '1' })
    await adm.post('/admin/pages?kind=post', { title: 'Borrador', slug: 'secreto', locale: 'es-MX', body: 'x' })
    const v = new Agent(t.app)
    expect((await v.get('/blog')).body).toContain('href="/blog/lanzamos-tubio"')
    expect((await v.get('/blog/lanzamos-tubio')).body).toContain('<strong>Software libre</strong>')
    expect((await v.get('/blog/secreto')).statusCode).toBe(404)
    expect((await v.get('/')).body).toContain('href="/p/precios-tubio"')
  })

  it('aviso del sistema y mantenimiento', async () => {
    const t = await makeApp()
    await seedUser(t)
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const a = await loginAgent(t)
    setSetting(t.deps.db, 'announcement', 'Mantenimiento el domingo <b>2 am</b>')
    expect((await a.get('/panel')).body).toContain('Mantenimiento el domingo &lt;b&gt;2 am&lt;/b&gt;')
    setSetting(t.deps.db, 'maintenance', true)
    expect((await a.get('/panel')).statusCode).toBe(503)
    const adm = await loginAgent(t, 'admin@example.com')
    expect((await adm.get('/panel')).statusCode).toBe(200)
  })
})
