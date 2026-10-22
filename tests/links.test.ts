import { describe, expect, it } from 'vitest'
import { aliasError, normalizeAlias } from '../src/lib/alias.ts'
import { buildDestination, checkUrl } from '../src/lib/urls.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser, type TestApp } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }

async function setup(): Promise<{ t: TestApp; a: Agent }> {
  const t = await makeApp()
  await seedUser(t)
  const a = await loginAgent(t)
  return { t, a }
}

describe('alias y URLs', () => {
  it('normaliza y valida alias', () => {
    expect(normalizeAlias('  Mi Página Ñ  ')).toBe('mi-pagina-n')
    expect(aliasError('ab')).toBe('err.alias_short')
    expect(aliasError('panel')).toBe('err.alias_reserved')
    expect(aliasError('-hola')).toBe('err.alias_chars')
    expect(aliasError('hola_mundo-2')).toBeNull()
  })
  it('rechaza esquemas y hosts peligrosos', () => {
    expect(checkUrl('javascript:alert(1)').ok).toBe(false)
    expect(checkUrl('data:text/html,hola').ok).toBe(false)
    expect(checkUrl('http://localhost/x').ok).toBe(false)
    expect(checkUrl('http://192.168.1.10/').ok).toBe(false)
    expect(checkUrl('http://user:pw@example.com').ok).toBe(false)
    expect(checkUrl('example.com/a?b=1')).toMatchObject({ ok: true, url: 'https://example.com/a?b=1' })
    expect(checkUrl('mailto:hola@example.com', ['mailto:']).ok).toBe(true)
  })
  it('añade UTM sin pisar y reenvía query', () => {
    expect(buildDestination('https://e.com/?utm_source=ya', { utm_source: 'x', utm_medium: 'bio' }, { ref: 'tw', _preview: '1' })).toBe(
      'https://e.com/?utm_source=ya&utm_medium=bio&ref=tw',
    )
  })
})

describe('enlace corto', () => {
  it('se crea desde el panel y redirige contando la visita', async () => {
    const { t, a } = await setup()
    await a.get('/panel/links/new?kind=short')
    const res = await a.postMultipart('/panel/links?kind=short', { target_url: 'example.com/destino', alias: 'Promo Otoño', redirect_code: '301', is_enabled: '1', utm_source: 'tubio' })
    expect(res.statusCode).toBe(303)
    const link = findByAlias(t.deps.db, 'promo-otono')!
    expect(link.target_url).toBe('https://example.com/destino')
    const v = new Agent(t.app)
    const go = await v.get('/promo-otono', UA)
    expect(go.statusCode).toBe(301)
    expect(go.headers.location).toBe('https://example.com/destino?utm_source=tubio')
    expect(findByAlias(t.deps.db, 'promo-otono')!.clicks).toBe(1)
    const ev = t.deps.db.prepare('SELECT * FROM stat_events').all() as { device: string; visitor: string }[]
    expect(ev).toHaveLength(1)
    expect(ev[0]!.device).toBe('mobile')
    expect(ev[0]!.visitor).not.toContain('127.0.0.1')
  })

  it('alias vacío genera uno al azar; alias ocupado da error', async () => {
    const { t, a } = await setup()
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { target_url: 'https://a.com', alias: 'ocupado', is_enabled: '1' })
    const dup = await a.postMultipart('/panel/links?kind=short', { target_url: 'https://b.com', alias: 'ocupado', is_enabled: '1' })
    expect(dup.statusCode).toBe(422)
    expect(dup.body).toContain('ya está ocupado')
    const rnd = await a.postMultipart('/panel/links?kind=short', { target_url: 'https://b.com', alias: '', is_enabled: '1' })
    expect(rnd.statusCode).toBe(303)
    const n = t.deps.db.prepare('SELECT COUNT(*) FROM links').pluck().get()
    expect(n).toBe(2)
  })

  it('no redirige a URLs peligrosas ni a dominios bloqueados', async () => {
    const { t, a } = await setup()
    t.deps.db.prepare("INSERT INTO blocked_hosts (host, created_at) VALUES ('malo.com', 0)").run()
    await a.get('/panel/links/new?kind=short')
    expect((await a.postMultipart('/panel/links?kind=short', { target_url: 'javascript:alert(1)', is_enabled: '1' })).statusCode).toBe(422)
    const blocked = await a.postMultipart('/panel/links?kind=short', { target_url: 'https://sub.malo.com/x', is_enabled: '1' })
    expect(blocked.statusCode).toBe(422)
    expect(blocked.body).toContain('no está permitido')
  })

  it('programación: antes 404, después URL alterna', async () => {
    const { t, a } = await setup()
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', {
      target_url: 'https://a.com', alias: 'prog', is_enabled: '1',
      starts_at: '2026-10-23T00:00', ends_at: '2026-10-24T00:00', expired_url: 'https://fin.com',
    })
    const v = new Agent(t.app)
    expect((await v.get('/prog', UA)).statusCode).toBe(404)
    t.clock.now = Date.UTC(2026, 9, 23, 12)
    expect((await v.get('/prog', UA)).headers.location).toBe('https://a.com/')
    t.clock.now = Date.UTC(2026, 9, 25)
    expect((await v.get('/prog', UA)).headers.location).toBe('https://fin.com/')
  })

  it('tope de clics', async () => {
    const { t, a } = await setup()
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { target_url: 'https://a.com', alias: 'tope', is_enabled: '1', click_limit: '2' })
    const v = new Agent(t.app)
    expect((await v.get('/tope', UA)).statusCode).toBe(302)
    expect((await v.get('/tope', UA)).statusCode).toBe(302)
    expect((await v.get('/tope', UA)).statusCode).toBe(404)
  })

  it('contraseña y contenido sensible', async () => {
    const { t, a } = await setup()
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { target_url: 'https://a.com', alias: 'secreto', is_enabled: '1', password: 'abrete', is_sensitive: '1' })
    const v = new Agent(t.app)
    const gate = await v.get('/secreto', UA)
    expect(gate.statusCode).toBe(401)
    expect((await v.post('/secreto', { _action: 'password', password: 'mal' })).statusCode).toBe(401)
    expect((await v.post('/secreto', { _action: 'password', password: 'abrete' })).statusCode).toBe(303)
    const warn = await v.get('/secreto', UA)
    expect(warn.body).toContain('Contenido sensible')
    await v.post('/secreto', { _action: 'confirm' })
    expect((await v.get('/secreto', UA)).headers.location).toBe('https://a.com/')
  })

  it('pausado o dueño suspendido = 404; bots no cuentan', async () => {
    const { t, a } = await setup()
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { target_url: 'https://a.com', alias: 'pausa', is_enabled: '1' })
    const v = new Agent(t.app)
    await v.get('/pausa', { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' })
    expect(findByAlias(t.deps.db, 'pausa')!.clicks).toBe(0)
    const id = findByAlias(t.deps.db, 'pausa')!.id
    await a.get(`/panel/links/${id}`)
    await a.postMultipart(`/panel/links/${id}`, { target_url: 'https://a.com', alias: 'pausa' })
    expect((await v.get('/pausa', UA)).statusCode).toBe(404)
  })

  it('no se pueden ver ni editar enlaces ajenos', async () => {
    const { t, a } = await setup()
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { target_url: 'https://a.com', alias: 'mio', is_enabled: '1' })
    const id = findByAlias(t.deps.db, 'mio')!.id
    await seedUser(t, 'beto@example.com')
    const b = await loginAgent(t, 'beto@example.com')
    expect((await b.get(`/panel/links/${id}`)).statusCode).toBe(404)
    expect((await b.postMultipart(`/panel/links/${id}`, { target_url: 'https://evil.com', alias: 'mio', is_enabled: '1' })).statusCode).toBe(404)
    expect((await b.post(`/panel/links/${id}/delete`)).statusCode).toBe(404)
  })

  it('lista, busca y borra', async () => {
    const { t, a } = await setup()
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { target_url: 'https://uno.com', alias: 'uno', title: 'Primero', is_enabled: '1' })
    await a.postMultipart('/panel/links?kind=short', { target_url: 'https://dos.com', alias: 'dos', is_enabled: '1' })
    const all = await a.get('/panel')
    expect(all.body).toContain('Primero')
    const found = await a.get('/panel?q=dos')
    expect(found.body).toContain('dos.com')
    expect(found.body).not.toContain('Primero')
    const id = findByAlias(t.deps.db, 'uno')!.id
    await a.post(`/panel/links/${id}/delete`)
    expect(findByAlias(t.deps.db, 'uno')).toBeUndefined()
  })
})
