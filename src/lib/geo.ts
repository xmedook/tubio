import { existsSync } from 'node:fs'
import maxmind, { type CityResponse, type Reader } from 'maxmind'

export type GeoResult = { country: string | null; city: string | null }

export interface Geo {
  lookup(ip: string): GeoResult
}

export const noGeo: Geo = { lookup: () => ({ country: null, city: null }) }

/**
 * Base IP→ciudad en formato MMDB (p. ej. DB-IP "IP to City Lite", CC-BY 4.0, https://db-ip.com).
 * Sin archivo, todo queda como desconocido.
 */
export async function openGeo(path: string): Promise<Geo> {
  if (!existsSync(path)) return noGeo
  const reader: Reader<CityResponse> = await maxmind.open<CityResponse>(path)
  return {
    lookup(ip) {
      try {
        const r = reader.get(ip)
        return {
          country: r?.country?.iso_code ?? null,
          city: r?.city?.names?.en ?? null,
        }
      } catch {
        return { country: null, city: null }
      }
    },
  }
}
