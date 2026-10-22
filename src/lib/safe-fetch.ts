import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'

/**
 * Peticiones salientes a URLs que escribe un usuario (RSS, webhooks, clima) sin abrir la puerta a SSRF:
 * sólo http/https a puertos 80/443, resolución DNS propia y conexión a la IP ya revisada (no hay segunda
 * resolución que se pueda envenenar), nada de redes privadas/loopback/link-local, tope de tamaño y tiempo,
 * y máximo 3 redirecciones, cada una revisada igual.
 */

export class SafeFetchError extends Error {}

const V4_BLOCK = new BlockList()
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) V4_BLOCK.addSubnet(net, bits, 'ipv4')

const V6_BLOCK = new BlockList()
for (const [net, bits] of [
  ['::', 96], // no especificada, loopback e IPv4-compatible
  ['100::', 64], ['2001::', 23], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) V6_BLOCK.addSubnet(net, bits, 'ipv6')

/** 8 grupos de 16 bits de una IPv6 (acepta la forma con IPv4 al final) */
function hextets(ip: string): number[] | null {
  let v = ip.toLowerCase().split('%')[0] ?? ''
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(v)
  if (tail) {
    const o = (tail[1] as string).split('.').map(Number)
    v = v.slice(0, -(tail[1] as string).length) + `${(((o[0] ?? 0) << 8) | (o[1] ?? 0)).toString(16)}:${(((o[2] ?? 0) << 8) | (o[3] ?? 0)).toString(16)}`
  }
  const [head = '', rest] = v.split('::')
  const a = head ? head.split(':') : []
  const b = rest !== undefined && rest !== '' ? rest.split(':') : []
  const fill = rest !== undefined ? 8 - a.length - b.length : 0
  const all = [...a, ...new Array<string>(Math.max(0, fill)).fill('0'), ...b]
  if (all.length !== 8) return null
  const n = all.map((h) => parseInt(h, 16))
  return n.some((x) => !Number.isFinite(x) || x < 0 || x > 0xffff) ? null : n
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`

/**
 * ¿Es una IP de internet pública? Se revisa por bits, no por texto: `[::ffff:127.0.0.1]` llega como
 * `::ffff:7f00:1` y las IPv4 embebidas (mapeadas, NAT64, 6to4) se revisan como la IPv4 que son.
 */
export function isPublicIp(ip: string): boolean {
  if (isIP(ip) === 4) return !V4_BLOCK.check(ip, 'ipv4')
  if (isIP(ip) !== 6) return false
  const h = hextets(ip)
  if (!h) return false
  const zero = (from: number, to: number) => h.slice(from, to).every((x) => x === 0)
  if (zero(0, 5) && h[5] === 0xffff) return isPublicIp(v4From(h[6] as number, h[7] as number)) // ::ffff:a.b.c.d
  if (h[0] === 0x64 && h[1] === 0xff9b && zero(2, 6)) return isPublicIp(v4From(h[6] as number, h[7] as number)) // NAT64
  if (h[0] === 0x2002) return isPublicIp(v4From(h[1] as number, h[2] as number)) // 6to4
  const norm = h.map((x) => x.toString(16)).join(':')
  return !V6_BLOCK.check(norm, 'ipv6')
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
    const next = new URL(res.headers.location, u)
    // a otro origen no viajan las cabeceras propias (firma del webhook, etc.)
    const headers = next.origin === u.origin ? opts.headers : undefined
    return safeFetch(next.href, { ...opts, method: 'GET', body: undefined, headers }, hops + 1)
  }
  return res
}
