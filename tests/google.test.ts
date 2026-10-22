import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'
import { findUserByEmail, updateUser } from '../src/modules/users/repo.ts'
import { Agent, makeApp, seedUser } from './helpers.ts'

const CLIENT = 'cliente-123.apps.googleusercontent.com'

function idToken(claims: Record<string, unknown>): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'RS256' })}.${b(claims)}.firma`
}

async function setup(claimsFor: (nonce: string) => Record<string, unknown>) {
  let lastBody = ''
  let nonce = ''
  const fakeFetch = (async (_url: string, init?: RequestInit) => {
    lastBody = String(init?.body ?? '')
    return new Response(JSON.stringify({ id_token: idToken(claimsFor(nonce)) }), { status: 200 })
  }) as typeof fetch
  const t = await makeApp({
    config: loadConfig({ env: 'test', dbPath: ':memory:', baseUrl: 'http://tubio.test', dataDir: '/tmp/tubio-test', googleClientId: CLIENT, googleClientSecret: 's3cr3t' }),
    fetch: fakeFetch,
  })
  const a = new Agent(t.app)
  const go = async (next = '') => {
    const start = await a.get('/login/google' + next)
    const loc = new URL(String(start.headers.location))
    nonce = loc.searchParams.get('nonce')!
    return { state: loc.searchParams.get('state')!, loc }
  }
  return { t, a, go, body: () => lastBody }
}

const base = (nonce: string) => ({ iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.UTC(2026, 9, 23) / 1000), sub: 'g-1', email: 'nueva@gmail.com', email_verified: true, name: 'Nueva', nonce })

describe('login con Google', () => {
  it('sin credenciales no hay botón ni ruta', async () => {
    const t = await makeApp()
    expect((await new Agent(t.app).get('/login')).body).not.toContain('Continuar con Google')
    expect((await new Agent(t.app).get('/login/google')).statusCode).toBe(404)
  })

  it('crea la cuenta y entra; usa PKCE', async () => {
    const { t, a, go, body } = await setup(base)
    expect((await a.get('/login')).body).toContain('Continuar con Google')
    const { state, loc } = await go('?next=/panel/qr')
    expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256')
    expect(loc.searchParams.get('redirect_uri')).toBe('http://tubio.test/login/google/callback')
    const cb = await a.get(`/login/google/callback?code=abc&state=${state}`)
    expect(cb.statusCode).toBe(303)
    expect(cb.headers.location).toBe('/panel/qr')
    expect(body()).toContain('code_verifier=')
    const u = findUserByEmail(t.deps.db, 'nueva@gmail.com')!
    expect(u.google_sub).toBe('g-1')
    expect(u.email_verified_at).toBeTruthy()
    expect((await a.get('/panel')).statusCode).toBe(200)
  })

  it('enlaza una cuenta existente con el mismo correo', async () => {
    const { t, a, go } = await setup((n) => ({ ...base(n), email: 'ana@example.com', sub: 'g-ana' }))
    await seedUser(t)
    const { state } = await go()
    expect((await a.get(`/login/google/callback?code=abc&state=${state}`)).headers.location).toBe('/panel')
    expect(findUserByEmail(t.deps.db, 'ana@example.com')!.google_sub).toBe('g-ana')
  })

  it('rechaza state falso, nonce ajeno, audiencia ajena y correo sin verificar', async () => {
    for (const bad of [
      (n: string) => ({ ...base(n), nonce: 'otro' }),
      (n: string) => ({ ...base(n), aud: 'otra-app' }),
      (n: string) => ({ ...base(n), email_verified: false }),
      (n: string) => ({ ...base(n), iss: 'https://evil.com' }),
      (n: string) => ({ ...base(n), exp: 1 }),
    ]) {
      const { t, a, go } = await setup(bad)
      const { state } = await go()
      expect((await a.get(`/login/google/callback?code=abc&state=${state}`)).statusCode).toBe(401)
      expect(findUserByEmail(t.deps.db, 'nueva@gmail.com')).toBeUndefined()
    }
    const { a, go } = await setup(base)
    await go()
    expect((await a.get('/login/google/callback?code=abc&state=falso')).statusCode).toBe(400)
  })

  it('respeta 2FA y suspensión', async () => {
    const { t, a, go } = await setup((n) => ({ ...base(n), email: 'ana@example.com', sub: 'g-ana' }))
    const u = await seedUser(t)
    updateUser(t.deps.db, u.id, { totp_secret: 'JBSWY3DPEHPK3PXP', totp_enabled_at: 1 })
    let { state } = await go()
    expect((await a.get(`/login/google/callback?code=abc&state=${state}`)).headers.location).toBe('/login/2fa')
    updateUser(t.deps.db, u.id, { status: 'suspended' })
    ;({ state } = await go())
    expect((await a.get(`/login/google/callback?code=abc&state=${state}`)).statusCode).toBe(403)
  })
})
