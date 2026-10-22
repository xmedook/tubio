import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>
const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 32
const SCRYPT_OPTS = { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }

/** Formato: scrypt$N$r$p$salBase64$hashBase64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, SCRYPT_OPTS)
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string]
  const expected = Buffer.from(hashB64, 'base64')
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

/** Token aleatorio apto para URL. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(s: string | Buffer): string {
  return createHash('sha256').update(s).digest('hex')
}

export function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}
