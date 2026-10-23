import { describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { loginAgent, makeApp, seedUser } from './helpers.ts'

describe('duplicar', () => {
  it('copia página con bloques (alias nuevo, contadores en cero); no duplica archivos; respeta límites', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'promo', target_url: 'https://a.mx', is_enabled: '1' })
    const short = findByAlias(t.deps.db, 'promo')!
    t.deps.db.prepare('UPDATE links SET clicks = 9, hits = 9 WHERE id = ?').run(short.id)
    await a.get('/panel')
    const r = await a.post(`/panel/links/${short.id}/duplicate`)
    const copy = findByAlias(t.deps.db, 'promo-copia')!
    expect(r.headers.location).toBe(`/panel/links/${copy.id}`)
    expect(copy).toMatchObject({ target_url: 'https://a.mx/', clicks: 0, hits: 0, user_id: u.id })
    await a.post(`/panel/links/${short.id}/duplicate`)
    expect(findByAlias(t.deps.db, 'promo-copia-2')).toBeTruthy()
    // página bio: los bloques vienen también
    t.deps.db.prepare('UPDATE users SET plan_id = (SELECT id FROM plans WHERE slug = ?) WHERE id = ?').run('pro', u.id)
    await a.postMultipart('/panel/links?kind=bio', { alias: 'mipagina', title: 'Mi página', is_enabled: '1' })
    const bio = findByAlias(t.deps.db, 'mipagina')!
    await a.post(`/panel/links/${bio.id}/duplicate`)
    const bioCopy = findByAlias(t.deps.db, 'mipagina-copia')!
    expect(listBlocks(t.deps.db, bioCopy.id).map((b) => b.type)).toEqual(listBlocks(t.deps.db, bio.id).map((b) => b.type))
    expect(bioCopy.title).toBe('Mi página (copia)')
    // plan gratis: 1 página bio → no deja duplicar
    t.deps.db.prepare('UPDATE users SET plan_id = NULL WHERE id = ?').run(u.id)
    await a.post(`/panel/links/${bio.id}/duplicate`)
    expect(findByAlias(t.deps.db, 'mipagina-copia-2')).toBeUndefined()
    // otro usuario no puede duplicar lo ajeno
    await seedUser(t, 'beto@example.com')
    const b = await loginAgent(t, 'beto@example.com')
    await b.get('/panel')
    expect((await b.post(`/panel/links/${short.id}/duplicate`)).statusCode).toBe(404)
  })
})

describe('idioma declarado de la página', () => {
  it('se refleja en <html lang> y en los textos del sistema', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'english', title: 'Hi', is_enabled: '1' })
    const l = findByAlias(t.deps.db, 'english')!
    await a.get(`/panel/links/${l.id}/design`)
    expect((await a.postMultipart(`/panel/links/${l.id}/design`, { theme: 'tinta', lang: 'en-US' })).statusCode).toBe(303)
    const page = await a.get('/english')
    expect(page.body).toContain('<html lang="en-US">')
    expect((await a.postMultipart(`/panel/links/${l.id}/design`, { theme: 'tinta', lang: 'xx' })).statusCode).toBe(422)
  })
})

describe('reclama tu alias', () => {
  it('portada → registro con aviso de libre → crear página con el alias', async () => {
    const { Agent } = await import('./helpers.ts')
    const t = await makeApp()
    const v = new Agent(t.app)
    expect((await v.get('/')).body).toContain('name="alias"')
    const free = await v.get('/register?alias=Café Norte')
    expect(free.body).toContain('tubio.test/cafe-norte está libre')
    expect(free.body).toContain('name="claim" value="cafe-norte"')
    expect((await v.get('/register?alias=panel')).body).toContain('claim-bad')
    const r = await v.post('/register', { email: 'cafe@example.com', password: 'contrasena-segura', accept: '1', claim: 'cafe-norte' })
    expect(r.headers.location).toBe('/panel/start?alias=cafe-norte')
    expect((await v.get(String(r.headers.location))).body).toContain('value="cafe-norte"')
    expect((await v.get('/panel/links/new?kind=bio&alias=cafe-norte')).body).toContain('value="cafe-norte"')
  })
})

describe('creación masiva', () => {
  it('una URL por renglón; marca las malas; respeta el plan', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/bulk')
    const r = await a.post('/panel/links/bulk', { urls: 'https://uno.mx\njavascript:alert(1)\n\ndos.mx/x' })
    expect(r.statusCode).toBe(200)
    expect(t.deps.db.prepare("SELECT target_url FROM links WHERE kind = 'short' ORDER BY id").pluck().all()).toEqual(['https://uno.mx/', 'https://dos.mx/x'])
    expect(r.body).toContain('renglón 2')
    // plan gratis: 25 enlaces
    t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(u.id)
    const many = Array.from({ length: 30 }, (_, i) => `https://e${i}.mx`).join('\n')
    await a.post('/panel/links/bulk', { urls: many })
    expect(t.deps.db.prepare("SELECT COUNT(*) FROM links WHERE kind = 'short'").pluck().get()).toBe(25)
  })
})

describe('mis propias visitas no cuentan', () => {
  it('con sesión del dueño o con el dispositivo excluido', async () => {
    const { Agent } = await import('./helpers.ts')
    const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15' }
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'mio', target_url: 'https://a.mx', is_enabled: '1' })
    const n = () => t.deps.db.prepare('SELECT COUNT(*) FROM stat_events').pluck().get()
    await a.get('/mio', UA)
    expect(n()).toBe(0)
    await new Agent(t.app).get('/mio', UA)
    expect(n()).toBe(1)
    await a.get('/panel/account')
    await a.post('/panel/account/self-exclude', { on: '1' })
    expect((await a.get('/panel/account')).body).toContain('Este dispositivo está excluido')
    const cookie = a.cookies.get('tb_self')
    const anon = new Agent(t.app)
    anon.cookies.set('tb_self', cookie as string)
    await anon.get('/mio', UA)
    expect(n()).toBe(1)
  })
})
