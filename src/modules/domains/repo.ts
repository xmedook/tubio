import { resolveCname, resolveTxt } from 'node:dns/promises'
import type { DB } from '../../db/index.ts'

export type Domain = { id: number; user_id: number; host: string; status: 'pending' | 'active' | 'disabled'; verify_token: string; verified_at: number | null; home_link_id: number | null; created_at: number }

/** Host de cada dominio activo (para armar URLs públicas sin consultar la BD en cada enlace) */
const hostById = new Map<number, string>()
const idByHost = new Map<string, number>()
const ownerById = new Map<number, number>()

export function refreshDomainCache(db: DB): void {
  hostById.clear()
  idByHost.clear()
  ownerById.clear()
  for (const d of db.prepare("SELECT id, host, user_id FROM domains WHERE status = 'active'").all() as { id: number; host: string; user_id: number }[]) {
    hostById.set(d.id, d.host)
    idByHost.set(d.host, d.id)
    ownerById.set(d.id, d.user_id)
  }
}

export function domainOwner(id: number): number | undefined {
  return ownerById.get(id)
}

export function domainHost(id: number): string | undefined {
  return hostById.get(id)
}

export function domainIdForHost(host: string): number | undefined {
  return idByHost.get(host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, ''))
}

export function normalizeHost(input: string): string | null {
  let h = input.trim().toLowerCase()
  try {
    h = new URL(/^https?:\/\//.test(h) ? h : `https://${h}`).hostname
  } catch {
    return null
  }
  h = h.replace(/\.$/, '')
  // nombre de dominio público: al menos dos etiquetas, sin IPs ni nombres internos
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return null
  return h
}

export function listDomains(db: DB, userId: number): Domain[] {
  return db.prepare('SELECT * FROM domains WHERE user_id = ? ORDER BY host').all(userId) as Domain[]
}

export function getOwnDomain(db: DB, id: number, userId: number): Domain | undefined {
  return db.prepare('SELECT * FROM domains WHERE id = ? AND user_id = ?').get(id, userId) as Domain | undefined
}

/**
 * Verificación de propiedad: el TXT `_tubio.<host>` con el token de ESTA cuenta. El CNAME a
 * `target` sólo lleva el tráfico; no prueba nada (un CNAME olvidado por el dueño anterior
 * dejaría a cualquiera reclamar el host). resolver inyectable para pruebas.
 */
export async function verifyDomain(
  d: Domain,
  target: string,
  resolver: { txt: (h: string) => Promise<string[][]>; cname: (h: string) => Promise<string[]> } = { txt: resolveTxt, cname: resolveCname },
): Promise<boolean> {
  const txt = await resolver.txt(`_tubio.${d.host}`).catch(() => [] as string[][])
  void target
  return txt.some((parts) => parts.join('').trim() === `tubio-verify=${d.verify_token}`)
}
