import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'

/**
 * Peticiones salientes a URLs que escribe un usuario (RSS, webhooks, clima) sin abrir la puerta a SSRF:
 * sólo http/https a puertos 80/443, resolución DNS propia y conexión a la IP ya revisada (no hay segunda
 * resolución que se pueda envenenar), nada de redes privadas/loopback/link-local, tope de tamaño y tiempo,
 * y máximo 3 redirecciones, cada una revisada igual.
 */

export class SafeFetchError extends Error {}

export function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0, c = 0] = ip.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false
    if (a === 198 && (b === 18 || b === 19)) return false
    return true
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::' || v === '::1') return false
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff')) return false
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
    if (mapped) return isPublicIp(mapped[1] as string)
    return true
  }
  return false
}

export type SafeResponse = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer; url: string }

export type SafeFetchOptions = {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxBytes?: number
  /** pruebas: resolver propio */
  resolve?: (host: string) => Promise<string>
}

async function resolvePublic(host: string, resolve?: (h: string) => Promise<string>): Promise<string> {
  const bare = host.replace(/^\[|\]$/g, '')
  const ip = isIP(bare) ? bare : resolve ? await resolve(bare) : (await lookup(bare)).address
  if (!isPublicIp(ip)) throw new SafeFetchError('blocked_ip')
  return ip
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}, hops = 0): Promise<SafeResponse> {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new SafeFetchError('bad_url')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new SafeFetchError('bad_scheme')
  if (u.username || u.password) throw new SafeFetchError('bad_url')
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80
  if (port !== 80 && port !== 443) throw new SafeFetchError('bad_port')
  const ip = await resolvePublic(u.hostname, opts.resolve)
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024
  const res = await new Promise<SafeResponse>((resolveP, reject) => {
    const req = (u.protocol === 'https:' ? httpsRequest : httpRequest)(
      {
        host: ip,
        port,
        path: u.pathname + u.search,
        method: opts.method ?? 'GET',
        servername: isIP(u.hostname) ? undefined : u.hostname,
        headers: { host: u.host, 'user-agent': 'tubio/1 (+https://tubio.link)', ...(opts.headers ?? {}) },
        timeout: opts.timeoutMs ?? 8000,
      },
      (r) => {
        const chunks: Buffer[] = []
        let size = 0
        r.on('data', (c: Buffer) => {
          size += c.length
          if (size > maxBytes) {
            req.destroy(new SafeFetchError('too_big'))
            return
          }
          chunks.push(c)
        })
        r.on('end', () => resolveP({ status: r.statusCode ?? 0, headers: r.headers, body: Buffer.concat(chunks), url: u.href }))
        r.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new SafeFetchError('timeout')))
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
  if (res.status >= 300 && res.status < 400 && typeof res.headers.location === 'string') {
    if (hops >= 3) throw new SafeFetchError('too_many_redirects')
    const next = new URL(res.headers.location, u).href
    return safeFetch(next, { ...opts, method: 'GET', body: undefined }, hops + 1)
  }
  return res
}
