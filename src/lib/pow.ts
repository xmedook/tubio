import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto'
import { safeEqual } from './crypto.ts'

/**
 * Captcha sin terceros: prueba de trabajo. El servidor elige un número secreto n ≤ max y publica
 * sha256(sal + n) firmado con HMAC; el navegador prueba números hasta dar con él (≈ medio segundo).
 * Un bot puede resolverlo, pero cada intento le cuesta CPU, y cada reto sirve una sola vez.
 */

export type PowChallenge = { algorithm: 'SHA-256'; salt: string; challenge: string; maxnumber: number; signature: string }

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const TTL_MS = 15 * 60 * 1000

export function createChallenge(secret: string, now: number, maxnumber = 100_000): PowChallenge {
  // la expiración va dentro de la sal para que no se pueda alterar
  const salt = `${randomBytes(12).toString('hex')}?expires=${Math.floor((now + TTL_MS) / 1000)}`
  const n = randomInt(maxnumber + 1)
  const challenge = sha256(salt + n)
  return { algorithm: 'SHA-256', salt, challenge, maxnumber, signature: createHmac('sha256', secret).update(challenge).digest('hex') }
}

const used = new Map<string, number>()

/** payload = base64(JSON {salt, number, challenge, signature}) que llena el navegador */
export function verifySolution(secret: string, payload: string, now: number): boolean {
  let p: { salt?: unknown; number?: unknown; challenge?: unknown; signature?: unknown }
  try {
    p = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
  } catch {
    return false
  }
  if (typeof p.salt !== 'string' || typeof p.challenge !== 'string' || typeof p.signature !== 'string' || typeof p.number !== 'number') return false
  const exp = Number(/[?&]expires=(\d+)/.exec(p.salt)?.[1])
  if (!exp || exp * 1000 < now) return false
  if (!safeEqual(createHmac('sha256', secret).update(p.challenge).digest('hex'), p.signature)) return false
  if (sha256(p.salt + p.number) !== p.challenge) return false
  // un solo uso
  for (const [k, t] of used) if (t < now) used.delete(k)
  if (used.has(p.challenge)) return false
  used.set(p.challenge, exp * 1000)
  return true
}
