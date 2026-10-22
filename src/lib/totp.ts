import { createHmac, randomBytes } from 'node:crypto'
import { safeEqual } from './crypto.ts'

/** TOTP (RFC 6238) con HMAC-SHA1, 6 dígitos, paso de 30 s — lo que usan las apps autenticadoras. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx < 0) throw new Error('base32 inválido')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20))
}

export function hotp(secret: string, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const offset = (mac[mac.length - 1] as number) & 15
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits
  return String(code).padStart(digits, '0')
}

export function totp(secret: string, now = Date.now(), step = 30): string {
  return hotp(secret, Math.floor(now / 1000 / step))
}

/** Acepta el código del paso actual y ±1 (reloj desfasado). */
export function verifyTotp(secret: string, code: string, now = Date.now(), step = 30): boolean {
  const c = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(c)) return false
  const counter = Math.floor(now / 1000 / step)
  for (const d of [-1, 0, 1]) if (safeEqual(hotp(secret, counter + d), c)) return true
  return false
}

export function otpauthUri(secret: string, account: string, issuer = 'tubio'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
