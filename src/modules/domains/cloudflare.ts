import type { AppDeps } from '../../app.ts'

/**
 * Cloudflare for SaaS: cada dominio propio verificado se da de alta como "custom hostname" en la
 * zona de tubio.link; Cloudflare emite su certificado (validación HTTP, basta con el CNAME a
 * custom.tubio.link) y manda el tráfico al origen. Sin TUBIO_CF_TOKEN/TUBIO_CF_ZONE no hace nada.
 */

export const cfOn = () => !!(process.env.TUBIO_CF_TOKEN && process.env.TUBIO_CF_ZONE)

export type CfHostname = { id: string; status: string; ssl: { status: string } }

async function cf<T>(deps: AppDeps, method: string, path: string, body?: unknown): Promise<T> {
  const http = deps.fetch ?? fetch
  const r = await http(`https://api.cloudflare.com/client/v4/zones/${process.env.TUBIO_CF_ZONE}/${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.TUBIO_CF_TOKEN}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  const j = (await r.json()) as { success: boolean; result: T; errors?: { message: string }[] }
  if (!j.success) throw new Error(`cloudflare: ${j.errors?.map((e) => e.message).join('; ') ?? r.status}`)
  return j.result
}

/** Alta (o la ya existente, si el host ya estaba) */
export async function cfAddHostname(deps: AppDeps, host: string): Promise<CfHostname> {
  const found = await cf<CfHostname[]>(deps, 'GET', `custom_hostnames?hostname=${encodeURIComponent(host)}`)
  if (found[0]) return found[0]
  return cf<CfHostname>(deps, 'POST', 'custom_hostnames', { hostname: host, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } })
}

export async function cfGetHostname(deps: AppDeps, id: string): Promise<CfHostname | null> {
  try {
    return await cf<CfHostname>(deps, 'GET', `custom_hostnames/${id}`)
  } catch {
    return null
  }
}

export async function cfDeleteHostname(deps: AppDeps, id: string): Promise<void> {
  await cf(deps, 'DELETE', `custom_hostnames/${id}`).catch(() => undefined)
}
