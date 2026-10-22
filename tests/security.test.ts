import { describe, expect, it } from 'vitest'
import { generateSecret, totp } from '../src/lib/totp.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { setSetting } from '../src/modules/settings/repo.ts'
import { findUserByEmail, findUserById, updateUser } from '../src/modules/users/repo.ts'
import { safeNext } from '../src/web/context.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36' }

describe('regresiones de la revisión de seguridad', () => {
  it('safeNext rechaza tabs, saltos y barras invertidas', async () => {
    for (const bad of ['/\t/evil.com', '/\n/evil.com', '/\\evil.com', '/ /evil.com', '/%09'.replace('%09', '\t')]) expect(safeNext(bad)).toBe('/panel')
    const t = await makeApp()
    const res = await new Agent(t.app).get('/lang/en?next=/%09/evil.com')
    expect(res.headers.location).toBe('/')
  })

  it('redes sociales pasan por la lista de bloqueo y el filtro de hosts', async () => {
    const t = await makeApp()
    await seedUser(t)
    t.deps.db.prepare("INSERT INTO blocked_hosts (host, created_at) VALUES ('evil.com', 0)").run()
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'ana', is_enabled: '1' })
    const id = findByAlias(t.deps.db, 'ana')!.id
    await a.get(`/panel/links/${id}/blocks`)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=socials`, { social_mastodon: 'https://evil.com/phish', is_enabled: '1' })).statusCode).toBe(422)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=socials`, { social_website: 'http://192.168.0.1/', is_enabled: '1' })).statusCode).toBe(422)
  })

  it('bloquear un dominio corta enlaces y botones que ya existían', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'viejo', target_url: 'https://good.com/x', is_enabled: '1' })
    await a.postMultipart('/panel/links?kind=bio', { alias: 'ana', is_enabled: '1' })
    const bio = findByAlias(t.deps.db, 'ana')!.id
    await a.get(`/panel/links/${bio}/blocks`)
    await a.postMultipart(`/panel/links/${bio}/blocks?type=link`, { label: 'x', url: 'https://sub.good.com', is_enabled: '1' })
    const block = listBlocks(t.deps.db, bio).find((b) => b.type === 'link')!
    expect((await new Agent(t.app).get('/viejo', UA)).statusCode).toBe(302)
    t.deps.db.prepare("INSERT INTO blocked_hosts (host, created_at) VALUES ('good.com', 0)").run()
    expect((await new Agent(t.app).get('/viejo', UA)).statusCode).toBe(404)
    expect((await new Agent(t.app).get(`/_/c/${block.id}`, UA)).statusCode).toBe(404)
  })

  it('el tope de clics cuenta también bots y agentes vacíos', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'unavez', target_url: 'https://a.mx', is_enabled: '1', click_limit: '1' })
    const v = new Agent(t.app)
    expect((await v.get('/unavez', { 'user-agent': 'curl/8.0' })).statusCode).toBe(302)
    expect((await v.get('/unavez', { 'user-agent': '' })).statusCode).toBe(404)
    expect((await v.get('/unavez', UA)).statusCode).toBe(404)
    const l = findByAlias(t.deps.db, 'unavez')!
    expect(l.hits).toBe(1)
    expect(l.clicks).toBe(0) // las estadísticas siguen sin bots
  })

  it('2FA: no se reusa un código y la cuenta se bloquea aunque se repita la contraseña', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const secret = generateSecret()
    updateUser(t.deps.db, u.id, { totp_secret: secret, totp_enabled_at: 1 })
    const login = async () => {
      const a = new Agent(t.app)
      await a.get('/login')
      await a.post('/login', { email: 'ana@example.com', password: 'contrasena-segura' })
      await a.get('/login/2fa')
      return a
    }
    const code = totp(secret, t.clock.now)
    expect((await (await login()).post('/login/2fa', { code })).statusCode).toBe(303)
    expect((await (await login()).post('/login/2fa', { code })).statusCode).toBe(401) // reuso
    // 1 (reuso) + 5 en una sesión + 2 en otra = 8 fallos de la cuenta → bloqueo
    const s1 = await login()
    for (let j = 0; j < 5; j++) await s1.post('/login/2fa', { code: '000000' })
    const s2 = await login()
    for (let j = 0; j < 2; j++) await s2.post('/login/2fa', { code: '000000' })
    const locked = findUserById(t.deps.db, u.id)!.locked_until!
    expect(locked).toBeGreaterThan(t.clock.now)
    expect(t.mailer.sent.at(-1)!.subject).toContain('Bloqueamos')
    t.clock.now += 60_000
    // aun con el código correcto
    const res = await (await login()).post('/login/2fa', { code: totp(secret, t.clock.now) })
    expect(res.statusCode).toBe(429)
    expect(res.body).toContain('bloqueada 15 minutos')
  })

  it('suplantando no se cambia correo/contraseña/2FA y la bitácora nombra al admin', async () => {
    const t = await makeApp()
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const ana = await seedUser(t, 'ana@example.com')
    const adm = await loginAgent(t, 'admin@example.com')
    const adminId = findUserByEmail(t.deps.db, 'admin@example.com')!.id
    await adm.get(`/admin/users/${ana.id}`)
    await adm.post(`/admin/users/${ana.id}/impersonate`)
    await adm.get('/panel/account')
    expect((await adm.post('/panel/account/profile', { name: 'x', email: 'robo@evil.com', locale: 'es-MX', timezone: 'America/Mexico_City' })).statusCode).toBe(403)
    expect((await adm.post('/panel/account/password', { current: 'x', password: 'nueva-contrasena-1' })).statusCode).toBe(403)
    await adm.get('/panel/links/new?kind=short')
    const created = await adm.postMultipart('/panel/links?kind=short', { alias: 'ayuda-ana', target_url: 'https://a.mx', is_enabled: '1' })
    expect(created.statusCode, created.statusCode + ' ' + (created.body.match(/<title>[^<]*|class="error"[^<]*</g) ?? []).join('|')).toBe(303)
    const row = t.deps.db.prepare("SELECT actor_id, user_id FROM audit_log WHERE action = 'link.create'").get() as { actor_id: number; user_id: number }
    expect(row).toEqual({ actor_id: adminId, user_id: ana.id })
  })

  it('cuota de archivos por usuario', async () => {
    const t = await makeApp()
    await seedUser(t)
    setSetting(t.deps.db, 'upload_quota_mb', 1)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=file')
    const mb = Buffer.alloc(700 * 1024, 1)
    expect((await a.postMultipart('/panel/links?kind=file', { alias: 'uno', is_enabled: '1' }, [{ field: 'file', filename: 'a.bin', content: mb }])).statusCode).toBe(303)
    const over = await a.postMultipart('/panel/links?kind=file', { alias: 'dos', is_enabled: '1' }, [{ field: 'file', filename: 'b.bin', content: mb }])
    expect(over.statusCode).toBe(422)
    expect(over.body).toContain('límite de espacio')
  })
})
