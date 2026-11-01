import { describe, expect, it } from 'vitest'
import { totp } from '../src/lib/totp.ts'
import { findUserByEmail, findUserById } from '../src/modules/users/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

describe('cuenta', () => {
  it('edita perfil e idioma', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const a = await loginAgent(t)
    const res = await a.post('/panel/account/profile', { name: 'Ana Pérez', email: 'ana@example.com', locale: 'en', timezone: 'Europe/Madrid' })
    expect(res.statusCode).toBe(303)
    const after = findUserById(t.deps.db, u.id)!
    expect(after.name).toBe('Ana Pérez')
    expect(after.timezone).toBe('Europe/Madrid')
    expect((await a.get('/panel/account')).body).toContain('My account')
  })

  it('cambiar correo pide verificarlo otra vez', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    const sinClave = await a.post('/panel/account/profile', { name: 'Ana', email: 'nuevo@example.com', locale: 'es-MX', timezone: 'America/Mexico_City' })
    expect(sinClave.statusCode).toBe(422)
    await a.post('/panel/account/profile', { name: 'Ana', email: 'nuevo@example.com', locale: 'es-MX', timezone: 'America/Mexico_City', current: 'contrasena-segura' })
    const u = findUserByEmail(t.deps.db, 'nuevo@example.com')!
    expect(u.email_verified_at).toBeNull()
    expect(t.mailer.sent.at(-1)!.to).toBe('nuevo@example.com')
  })

  it('cambia contraseña sólo con la actual', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    expect((await a.post('/panel/account/password', { current: 'mala-mala-mala', password: 'otra-contrasena-1' })).statusCode).toBe(422)
    expect((await a.post('/panel/account/password', { current: 'contrasena-segura', password: 'otra-contrasena-1' })).statusCode).toBe(303)
    expect((await a.get('/panel')).statusCode).toBe(200) // la sesión actual sigue
    await loginAgent(t, 'ana@example.com', 'otra-contrasena-1')
  })

  it('activa y desactiva 2FA', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const a = await loginAgent(t)
    const setup = await a.get('/panel/account/2fa')
    expect(setup.body).toContain('<svg')
    const secret = findUserById(t.deps.db, u.id)!.totp_secret!
    expect((await a.post('/panel/account/2fa/enable', { code: '123456' })).statusCode).toBe(422)
    expect((await a.post('/panel/account/2fa/enable', { code: totp(secret, t.clock.now) })).statusCode).toBe(303)
    expect(findUserById(t.deps.db, u.id)!.totp_enabled_at).toBeTruthy()
    await a.get('/panel/account')
    expect((await a.post('/panel/account/2fa/disable', { current: 'contrasena-segura', code: totp(secret, t.clock.now) })).statusCode).toBe(303)
    expect(findUserById(t.deps.db, u.id)!.totp_enabled_at).toBeNull()
  })

  it('exporta datos sin secretos', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    const res = await a.get('/panel/account/export')
    expect(res.headers['content-disposition']).toContain('attachment')
    const data = JSON.parse(res.body)
    expect(data.user.email).toBe('ana@example.com')
    expect(res.body).not.toContain('scrypt$')
  })

  it('borra la cuenta con contraseña', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const a = await loginAgent(t)
    expect((await a.post('/panel/account/delete', { current: 'nop-nop-nop' })).statusCode).toBe(422)
    expect((await a.post('/panel/account/delete', { current: 'contrasena-segura' })).statusCode).toBe(303)
    expect(findUserById(t.deps.db, u.id)).toBeUndefined()
    expect((await new Agent(t.app).get('/panel')).statusCode).toBe(303)
  })
})

describe('Ajustes con el diseño nuevo', () => {
  it('trae las pestañas, las tarjetas de siempre, la tarjeta «Más» con afiliados, ayuda y salir, y la zona de borrado', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    const body = (await a.get('/panel/account')).body
    expect(body).toContain('<h1>Ajustes</h1>')
    for (const id of ['h-profile', 'h-password', 'h-2fa', 'h-reports', 'h-data', 'h-delete', 'h-more']) expect(body, id).toContain(`id="${id}"`)
    expect(body).toMatch(/<section class="card card-more" aria-labelledby="h-more">.*href="\/panel\/referrals".*href="\/help".*action="\/logout"/s)
    expect(body).toContain('card card-danger')
  })
})

