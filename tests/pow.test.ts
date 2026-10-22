import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'
import { createChallenge, verifySolution, type PowChallenge } from '../src/lib/pow.ts'
import { Agent, makeApp } from './helpers.ts'

function solve(c: PowChallenge): string {
  for (let n = 0; n <= c.maxnumber; n++) {
    if (createHash('sha256').update(c.salt + n).digest('hex') === c.challenge) {
      return Buffer.from(JSON.stringify({ salt: c.salt, number: n, challenge: c.challenge, signature: c.signature })).toString('base64')
    }
  }
  throw new Error('sin solución')
}

describe('prueba de trabajo', () => {
  const now = Date.UTC(2026, 9, 22)
  it('acepta una solución válida una sola vez', () => {
    const c = createChallenge('s', now, 200)
    const sol = solve(c)
    expect(verifySolution('s', sol, now)).toBe(true)
    expect(verifySolution('s', sol, now)).toBe(false)
  })
  it('rechaza firma ajena, vencida o número equivocado', () => {
    const c = createChallenge('s', now, 200)
    const sol = solve(c)
    expect(verifySolution('otra', sol, now)).toBe(false)
    expect(verifySolution('s', sol, now + 16 * 60_000)).toBe(false)
    const bad = JSON.parse(Buffer.from(solve(createChallenge('s', now, 200)), 'base64').toString())
    bad.number += 1
    expect(verifySolution('s', Buffer.from(JSON.stringify(bad)).toString('base64'), now)).toBe(false)
    expect(verifySolution('s', 'basura', now)).toBe(false)
  })
  it('el registro exige la prueba', async () => {
    const t = await makeApp({ config: loadConfig({ env: 'test', dbPath: ':memory:', baseUrl: 'http://tubio.test', dataDir: '/tmp/tubio-test', powMax: 300 }) })
    const a = new Agent(t.app)
    const page = await a.get('/register')
    expect(page.body).toContain('data-pow=')
    const sin = await a.post('/register', { accept: '1', email: 'x@example.com', password: 'contrasena-segura' })
    expect(sin.statusCode).toBe(422)
    const raw = /data-pow="([^"]+)"/.exec((await a.get('/register')).body)![1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const res = await a.post('/register', { accept: '1', email: 'x@example.com', password: 'contrasena-segura', _pow: solve(JSON.parse(raw)) })
    expect(res.statusCode).toBe(303)
  })
})
