import { describe, expect, it } from 'vitest'
import { totp, generateSecret } from '../src/lib/totp.ts'
import { findUserByEmail, updateUser } from '../src/modules/users/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

describe('registro', () => {
  it('crea la cuenta, inicia sesión y manda correo de verificación', async () => {
    const t = await makeApp()
    const a = new Agent(t.app)
    await a.get('/register')
    const res = await a.post('/register', { name: 'Ana', email: 'Ana@Example.com', password: 'contrasena-segura' })
    expect(res.statusCode).toBe(303)
    expect(res.headers.location).toBe('/panel')
    const panel = await a.get('/panel')
    expect(panel.statusCode).toBe(200)
    expect(panel.body).toContain('Aún no verificas')
    expect(t.mailer.sent).toHaveLength(1)
    const link = /\/verify\/[\w-]+/.exec(t.mailer.sent[0]!.text)![0]
    await a.get(link)
    expect(findUserByEmail(t.deps.db, 'ana@example.com')?.email_verified_at).toBeTruthy()
  })

  it('rechaza correo repetido y contraseña corta', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = new Agent(t.app)
    await a.get('/register')
    const dup = await a.post('/register', { email: 'ana@example.com', password: 'contrasena-segura' })
    expect(dup.statusCode).toBe(422)
    expect(dup.body).toContain('Ya hay una cuenta')
    const short = await a.post('/register', { email: 'otro@example.com', password: 'corta' })
    expect(short.statusCode).toBe(422)
    expect(short.body).toContain('al menos 10')
  })

  it('exige token CSRF', async () => {
    const t = await makeApp()
    const a = new Agent(t.app)
    await a.get('/register')
    a.csrf = 'falso'
    const res = await a.post('/register', { email: 'x@example.com', password: 'contrasena-segura' })
    expect(res.statusCode).toBe(403)
  })

  it('rechaza Origin ajeno', async () => {
    const t = await makeApp()
    const a = new Agent(t.app)
    await a.get('/register')
    const res = await a.post('/register', { email: 'x@example.com', password: 'contrasena-segura' }, { origin: 'https://evil.example' })
    expect(res.statusCode).toBe(403)
  })
})

describe('login', () => {
  it('entra con credenciales correctas y sale', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    expect((await a.get('/panel')).statusCode).toBe(200)
    await a.post('/logout')
    const after = await a.get('/panel')
    expect(after.statusCode).toBe(303)
    expect(after.headers.location).toContain('/login')
  })

  it('mensaje genérico con credenciales malas', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = new Agent(t.app)
    await a.get('/login')
    const bad = await a.post('/login', { email: 'ana@example.com', password: 'equivocada!!' })
    expect(bad.statusCode).toBe(401)
    const none = await a.post('/login', { email: 'nadie@example.com', password: 'equivocada!!' })
    expect(none.statusCode).toBe(401)
    expect(none.body).toContain('Correo o contraseña incorrectos')
  })

  it('no deja entrar a cuentas suspendidas', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    updateUser(t.deps.db, u.id, { status: 'suspended' })
    const a = new Agent(t.app)
    await a.get('/login')
    expect((await a.post('/login', { email: 'ana@example.com', password: 'contrasena-segura' })).statusCode).toBe(403)
  })

  it('pide 2FA cuando está activo', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const secret = generateSecret()
    updateUser(t.deps.db, u.id, { totp_secret: secret, totp_enabled_at: 1 })
    const a = new Agent(t.app)
    await a.get('/login')
    const res = await a.post('/login', { email: 'ana@example.com', password: 'contrasena-segura' })
    expect(res.headers.location).toBe('/login/2fa')
    expect((await a.get('/panel')).statusCode).toBe(303) // aún sin acceso
    await a.get('/login/2fa')
    expect((await a.post('/login/2fa', { code: '000000' })).statusCode).toBe(401)
    const ok = await a.post('/login/2fa', { code: totp(secret, t.clock.now) })
    expect(ok.statusCode).toBe(303)
    expect((await a.get('/panel')).statusCode).toBe(200)
  })

  it('next sólo acepta rutas internas', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = new Agent(t.app)
    await a.get('/login')
    const res = await a.post('/login', { email: 'ana@example.com', password: 'contrasena-segura', next: '//evil.com' })
    expect(res.headers.location).toBe('/panel')
  })
})

describe('recuperar contraseña', () => {
  it('flujo completo y cierra sesiones viejas', async () => {
    const t = await makeApp()
    await seedUser(t)
    const old = await loginAgent(t)
    const a = new Agent(t.app)
    await a.get('/forgot')
    const res = await a.post('/forgot', { email: 'ana@example.com' })
    expect(res.body).toContain('Si hay una cuenta')
    const link = /\/reset\/[\w-]+/.exec(t.mailer.sent.at(-1)!.text)![0]
    await a.get(link)
    expect((await a.post(link, { password: 'nueva-contrasena-1' })).statusCode).toBe(303)
    expect((await old.get('/panel')).statusCode).toBe(303)
    // el token ya no sirve
    expect((await a.get(link)).statusCode).toBe(400)
    await loginAgent(t, 'ana@example.com', 'nueva-contrasena-1')
  })

  it('misma respuesta para correos que no existen', async () => {
    const t = await makeApp()
    const a = new Agent(t.app)
    await a.get('/forgot')
    const res = await a.post('/forgot', { email: 'nadie@example.com' })
    expect(res.statusCode).toBe(200)
    expect(t.mailer.sent).toHaveLength(0)
  })
})

describe('idioma', () => {
  it('cambia por cookie y por Accept-Language', async () => {
    const t = await makeApp()
    const a = new Agent(t.app)
    expect((await a.get('/login', { 'accept-language': 'en-US' })).body).toContain('Log in')
    await a.get('/lang/en?next=/login')
    expect((await a.get('/login')).body).toContain('lang="en"')
    await a.get('/lang/es-MX?next=/login')
    expect((await a.get('/login')).body).toContain('lang="es-MX"')
  })
})
