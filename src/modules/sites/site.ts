import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import { unzipSync } from 'fflate'
import type { AppDeps } from '../../app.ts'
import { UploadError } from '../../lib/uploads.ts'

/**
 * Sitios estáticos: un ZIP (o un solo .html) que se sirve en /<alias>/…
 * El ZIP original se guarda como archivo normal (cuenta en la cuota) y se extrae
 * a data/sites/<key>/; al borrar el archivo se borra la carpeta.
 */

export const SITE_MAX_FILES = 500
export const SITE_MAX_BYTES = 40 * 1024 * 1024
const SITE_MAX_FILE = 15 * 1024 * 1024

export const SITE_MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json',
  txt: 'text/plain; charset=utf-8', xml: 'application/xml', webmanifest: 'application/manifest+json', map: 'application/json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', pdf: 'application/pdf', wasm: 'application/wasm',
}

export function siteDir(deps: AppDeps, key: string): string {
  return join(deps.config.dataDir, 'sites', key)
}

export function removeSiteDir(deps: AppDeps, key: string): void {
  rmSync(siteDir(deps, key), { recursive: true, force: true })
}

/** Ruta dentro del sitio, limpia; null si intenta salirse o es rara */
export function cleanSitePath(p: string): string | null {
  const s = p.replace(/\\/g, '/').replace(/^\/+/, '')
  if (s.includes('\0') || s.split('/').some((x) => x === '..')) return null
  if (s.length > 300) return null
  return s
}

export type SiteInfo = { files: number; bytes: number; index: boolean }

/** Extrae el ZIP (o el HTML suelto) a la carpeta del sitio. Lanza UploadError con la clave del error. */
export function extractSite(deps: AppDeps, key: string, buf: Buffer, filename: string): SiteInfo {
  const out = new Map<string, Uint8Array>()
  if (/\.html?$/i.test(filename)) {
    out.set('index.html', buf)
  } else {
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new UploadError('err.site_format')
    let total = 0
    let count = 0
    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(new Uint8Array(buf), {
        // se revisa antes de descomprimir: tope de archivos y de tamaño (bombas zip)
        filter: (f) => {
          if (f.name.endsWith('/') || /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/.test(f.name)) return false
          count++
          total += f.originalSize
          if (count > SITE_MAX_FILES) throw new UploadError('err.site_too_many')
          if (f.originalSize > SITE_MAX_FILE || total > SITE_MAX_BYTES) throw new UploadError('err.site_too_big')
          return true
        },
      })
    } catch (e) {
      if (e instanceof UploadError) throw e
      throw new UploadError('err.site_format')
    }
    let real = 0
    for (const [name, data] of Object.entries(entries)) {
      real += data.length
      if (real > SITE_MAX_BYTES) throw new UploadError('err.site_too_big')
      const p = cleanSitePath(name)
      if (!p) throw new UploadError('err.site_format')
      out.set(p, data)
    }
    // un ZIP con todo dentro de una sola carpeta (sitio/index.html): se quita esa carpeta
    const tops = new Set([...out.keys()].map((k) => k.split('/')[0]))
    if (tops.size === 1 && !out.has('index.html') && [...out.keys()].every((k) => k.includes('/'))) {
      const top = [...tops][0] + '/'
      const moved = new Map([...out].map(([k, v]) => [k.slice(top.length), v]))
      out.clear()
      for (const [k, v] of moved) out.set(k, v)
    }
  }
  if (out.size === 0) throw new UploadError('err.site_empty')
  const dir = siteDir(deps, key)
  removeSiteDir(deps, key)
  let bytes = 0
  for (const [p, data] of out) {
    const dest = normalize(join(dir, p))
    if (!dest.startsWith(dir + sep)) throw new UploadError('err.site_format')
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, data)
    bytes += data.length
  }
  return { files: out.size, bytes, index: out.has('index.html') }
}

/** Archivo a servir para una ruta pedida (index.html en carpetas), o null */
export function resolveSiteFile(deps: AppDeps, key: string, path: string): { file: string; ext: string } | null {
  const p = cleanSitePath(decodeSafe(path))
  if (p === null) return null
  const dir = siteDir(deps, key)
  const candidates = p === '' || p.endsWith('/') ? [`${p}index.html`] : [p, `${p}/index.html`, `${p}.html`]
  for (const c of candidates) {
    const f = normalize(join(dir, c))
    if (!f.startsWith(dir + sep)) return null
    if (existsSync(f) && statSync(f).isFile()) return { file: f, ext: (c.split('.').pop() ?? '').toLowerCase() }
  }
  return null
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * Origen opaco (sandbox sin allow-same-origin): el sitio no puede leer cookies de tubio.link
 * ni pedir el panel con la sesión de quien lo visita; tampoco navegar la pestaña de arriba.
 */
export const SITE_CSP = "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads; frame-ancestors 'none'; base-uri 'none'"
