import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser, setPlan, type TestApp } from './helpers.ts'

const zip = (files: Record<string, string>) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))))

async function owner(t: TestApp, plan = 'business') {
  const u = await seedUser(t)
  setPlan(t, u.id, plan)
  t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(u.id)
  const a = await loginAgent(t)
  await a.get('/panel/links/new?kind=file')
  return { u, a }
}

describe('sitios estáticos', () => {
  it('ZIP con carpeta raíz: index, subcarpetas, 404 propio, CSP sandbox sin same-origin', async () => {
    const t = await makeApp()
    const { a } = await owner(t)
    const z = zip({ 'mi-sitio/index.html': '<h1>Hola sitio</h1><script src="js/app.js"></script>', 'mi-sitio/js/app.js': 'console.log(1)', 'mi-sitio/docs/index.html': '<p>docs</p>', 'mi-sitio/404.html': '<p>no está</p>', '__MACOSX/._x': 'basura' })
    const res = await a.postMultipart('/panel/links?kind=file', { alias: 'misitio', is_enabled: '1', as_site: '1' }, [{ field: 'file', filename: 'sitio.zip', content: z, type: 'application/zip' }])
    expect(res.statusCode, res.body.slice(0, 400)).toBe(303)
    const v = new Agent(t.app)
    expect((await v.get('/misitio')).headers.location).toBe('/misitio/')
    const home = await v.get('/misitio/')
    expect(home.statusCode).toBe(200)
    expect(home.body).toContain('Hola sitio')
    const csp = String(home.headers['content-security-policy'])
    expect(csp).toContain('sandbox allow-scripts')
    expect(csp).not.toContain('allow-same-origin')
    expect(csp).not.toContain('allow-top-navigation')
    expect((await v.get('/misitio/js/app.js')).headers['content-type']).toContain('text/javascript')
    expect((await v.get('/misitio/docs')).body).toContain('docs')
    const nf = await v.get('/misitio/nada')
    expect(nf.statusCode).toBe(404)
    expect(nf.body).toContain('no está')
    expect((await v.get('/misitio/..%2F..%2Fetc%2Fpasswd')).statusCode).toBe(404)
    expect((await v.get('/misitio/__MACOSX/._x')).statusCode).toBe(404)
  })

  it('un solo .html; quitar la casilla deja de servirlo como sitio; borrar limpia la carpeta', async () => {
    const t = await makeApp()
    const { a } = await owner(t)
    await a.postMultipart('/panel/links?kind=file', { alias: 'unico', is_enabled: '1', as_site: '1' }, [{ field: 'file', filename: 'pagina.html', content: Buffer.from('<p>una</p>'), type: 'text/html' }])
    const link = findByAlias(t.deps.db, 'unico')!
    const key = t.deps.db.prepare('SELECT key FROM files WHERE id = ?').pluck().get(link.data.file_id) as string
    const dir = join(t.deps.config.dataDir, 'sites', key)
    expect(existsSync(dir)).toBe(true)
    expect((await new Agent(t.app).get('/unico/')).body).toContain('una')
    await a.get(`/panel/links/${link.id}`)
    expect((await a.postMultipart(`/panel/links/${link.id}`, { alias: 'unico', is_enabled: '1' })).statusCode).toBe(303)
    expect(existsSync(dir)).toBe(false)
    expect((await new Agent(t.app).get('/unico/')).statusCode).toBe(404)
    // otra vez sitio sin volver a subir
    await a.postMultipart(`/panel/links/${link.id}`, { alias: 'unico', is_enabled: '1', as_site: '1' })
    expect((await new Agent(t.app).get('/unico/')).body).toContain('una')
    await a.post(`/panel/links/${link.id}/delete`)
    expect(existsSync(dir)).toBe(false)
  })

  it('plan sin código propio no publica; si el plan vence deja de servirse; zip bomba rechazado', async () => {
    const t = await makeApp()
    const { u, a } = await owner(t, 'pro')
    const r = await a.postMultipart('/panel/links?kind=file', { alias: 'nopuede', is_enabled: '1', as_site: '1' }, [{ field: 'file', filename: 'p.html', content: Buffer.from('<p>x</p>'), type: 'text/html' }])
    expect(r.statusCode).toBe(422)
    expect(r.body).toContain('plan Negocio')
    setPlan(t, u.id, 'business', t.clock.now + 86400_000)
    const big = Buffer.from(zipSync({ 'index.html': new Uint8Array(41 * 1024 * 1024) }, { level: 9 }))
    const bomb = await a.postMultipart('/panel/links?kind=file', { alias: 'bomba', is_enabled: '1', as_site: '1' }, [{ field: 'file', filename: 'b.zip', content: big, type: 'application/zip' }])
    expect(bomb.body).toContain('pesa demasiado')
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM files').pluck().get()).toBe(0)
    await a.postMultipart('/panel/links?kind=file', { alias: 'temporal', is_enabled: '1', as_site: '1' }, [{ field: 'file', filename: 'p.html', content: Buffer.from('<p>vigente</p>'), type: 'text/html' }])
    expect((await new Agent(t.app).get('/temporal/')).body).toContain('vigente')
    t.clock.now += 2 * 86400_000
    expect((await new Agent(t.app).get('/temporal/')).statusCode).toBe(404)
  })
})
