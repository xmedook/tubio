import type { DB } from '../../db/index.ts'

/**
 * Píxeles de medición de terceros. Sólo se cargan con el consentimiento del visitante
 * (cookie tb_px=1, que pone la barra de aviso). Los scripts los arma public/js/pixels.js
 * a partir de atributos data-*; aquí sólo validamos IDs y listamos los orígenes para la CSP.
 */

export const PIXEL_KINDS = ['meta', 'ga4', 'tiktok', 'linkedin', 'pinterest', 'x', 'snapchat', 'quora'] as const
export type PixelKind = (typeof PIXEL_KINDS)[number]

export type Pixel = { id: number; user_id: number; kind: PixelKind; name: string; pixel_id: string; created_at: number }

const ID_RE: Record<PixelKind, RegExp> = {
  meta: /^\d{10,20}$/,
  ga4: /^G-[A-Z0-9]{6,12}$/,
  tiktok: /^[A-Z0-9]{15,25}$/,
  linkedin: /^\d{5,10}$/,
  pinterest: /^\d{10,16}$/,
  x: /^[a-z0-9]{5,10}$/,
  snapchat: /^[a-f0-9-]{36}$/,
  quora: /^[a-f0-9]{32}$/,
}

export function validPixelId(kind: PixelKind, id: string): boolean {
  return ID_RE[kind].test(id.trim())
}

/** Orígenes que necesita cada píxel: [script-src, connect/img-src] */
export const PIXEL_ORIGINS: Record<PixelKind, { script: string[]; other: string[] }> = {
  meta: { script: ['https://connect.facebook.net'], other: ['https://www.facebook.com', 'https://connect.facebook.net'] },
  ga4: { script: ['https://www.googletagmanager.com'], other: ['https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://www.googletagmanager.com'] },
  tiktok: { script: ['https://analytics.tiktok.com'], other: ['https://analytics.tiktok.com'] },
  linkedin: { script: ['https://snap.licdn.com'], other: ['https://px.ads.linkedin.com'] },
  pinterest: { script: ['https://s.pinimg.com'], other: ['https://ct.pinterest.com'] },
  x: { script: ['https://static.ads-twitter.com'], other: ['https://analytics.twitter.com', 'https://t.co'] },
  snapchat: { script: ['https://sc-static.net'], other: ['https://tr.snapchat.com'] },
  quora: { script: ['https://a.quora.com'], other: ['https://q.quora.com'] },
}

export function listPixels(db: DB, userId: number): Pixel[] {
  return db.prepare('SELECT * FROM pixels WHERE user_id = ? ORDER BY name').all(userId) as Pixel[]
}

/** Píxeles de un enlace (sólo los del mismo dueño) */
export function pixelsForLink(db: DB, userId: number, idsJson: string): Pixel[] {
  let ids: number[] = []
  try {
    ids = (JSON.parse(idsJson) as unknown[]).map(Number).filter(Number.isInteger)
  } catch {
    return []
  }
  if (!ids.length) return []
  return db.prepare(`SELECT * FROM pixels WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`).all(userId, ...ids) as Pixel[]
}

export function pixelCsp(px: Pixel[]): { script: string[]; other: string[] } {
  const script = new Set<string>()
  const other = new Set<string>()
  for (const p of px) {
    PIXEL_ORIGINS[p.kind].script.forEach((o) => script.add(o))
    PIXEL_ORIGINS[p.kind].other.forEach((o) => other.add(o))
  }
  return { script: [...script], other: [...other] }
}
