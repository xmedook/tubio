import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { buildApp, type AppDeps } from '../src/app.ts'
import { loadConfig } from '../src/config.ts'
import { migrate, openDb } from '../src/db/index.ts'
import { noGeo } from '../src/lib/geo.ts'
import { MemoryMailer } from '../src/lib/mail.ts'
import { hashPassword } from '../src/lib/crypto.ts'
import { createUser, type User } from '../src/modules/users/repo.ts'

export type TestApp = {
  app: FastifyInstance
  deps: AppDeps
  mailer: MemoryMailer
  clock: { now: number }
}

export async function makeApp(overrides: Partial<AppDeps> = {}): Promise<TestApp> {
  const db = openDb(':memory:')
  migrate(db)
  const mailer = new MemoryMailer()
  const clock = { now: Date.UTC(2026, 9, 22, 18, 0, 0) }
  const deps: AppDeps = {
    config: loadConfig({ env: 'test', dbPath: ':memory:', baseUrl: 'http://tubio.test', dataDir: '/tmp/tubio-test' }),
    db,
    mailer,
    geo: noGeo,
    now: () => clock.now,
    ...overrides,
  }
  const app = await buildApp(deps)
  return { app, deps, mailer, clock }
}

/** Navegador mínimo: guarda cookies entre peticiones y extrae el token CSRF de los formularios */
export class Agent {
  readonly app: FastifyInstance
  cookies = new Map<string, string>()
  csrf = ''
  constructor(app: FastifyInstance) {
    this.app = app
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  private store(res: LightMyRequestResponse): void {
    for (const c of res.cookies) {
      if (c.value === '' || (c.expires && c.expires.getTime() < Date.now()) || c.maxAge === 0) this.cookies.delete(c.name)
      else this.cookies.set(c.name, c.value)
    }
    const m = /name="_csrf" value="([^"]+)"/.exec(res.body)
    if (m?.[1]) this.csrf = m[1]
  }

  async get(url: string, headers: Record<string, string> = {}): Promise<LightMyRequestResponse> {
    const res = await this.app.inject({ method: 'GET', url, headers: { cookie: this.cookieHeader(), ...headers } })
    this.store(res)
    return res
  }

  async post(url: string, form: Record<string, string | string[]> = {}, headers: Record<string, string> = {}): Promise<LightMyRequestResponse> {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries({ _csrf: this.csrf, ...form })) {
      for (const one of Array.isArray(v) ? v : [v]) params.append(k, one)
    }
    const res = await this.app.inject({
      method: 'POST',
      url,
      payload: params.toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: this.cookieHeader(), ...headers },
    })
    this.store(res)
    return res
  }

  async postJson(url: string, body: unknown): Promise<LightMyRequestResponse> {
    const res = await this.app.inject({
      method: 'POST',
      url,
      payload: JSON.stringify(body),
      headers: { 'content-type': 'application/json', cookie: this.cookieHeader(), 'x-csrf-token': this.csrf },
    })
    this.store(res)
    return res
  }
}

export async function seedUser(t: TestApp, email = 'ana@example.com', password = 'contrasena-segura', role: 'user' | 'admin' = 'user'): Promise<User> {
  const user = createUser(t.deps.db, { email, passwordHash: await hashPassword(password), name: 'Ana', role }, t.clock.now)
  return user
}

/** Agente con sesión iniciada */
export async function loginAgent(t: TestApp, email = 'ana@example.com', password = 'contrasena-segura'): Promise<Agent> {
  const a = new Agent(t.app)
  await a.get('/login')
  const res = await a.post('/login', { email, password })
  if (res.statusCode !== 303) throw new Error('login falló: ' + res.statusCode + ' ' + res.body.slice(0, 200))
  await a.get('/panel')
  return a
}
