/**
 * Imagen para compartir el home en redes (public/img/og-tubio.png, 1200×630): wordmark del logo final sobre lima y la promesa en Bricolage Grotesque.
 *   node scripts/og-image.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import sharp from 'sharp'

const root = join(import.meta.dirname, '..')
const req = createRequire(import.meta.url)
// las fuentes van incrustadas (about:blank no puede leer file://)
const font = (pkg: string, file: string) => `data:font/woff2;base64,${readFileSync(join(req.resolve(`${pkg}/package.json`, { paths: [root] }).replace(/package\.json$/, ''), 'files', file)).toString('base64')}`
const wordmark = readFileSync(join(root, 'public/img/brand/tubio-logotipo-papel.svg'), 'utf8').replace(/width="\d+" height="\d+"/, 'width="520" height="192"')
const page = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:B;font-weight:200 800;src:url("${font('@fontsource-variable/bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2')}")}
@font-face{font-family:F;font-weight:300 900;src:url("${font('@fontsource-variable/figtree', 'figtree-latin-wght-normal.woff2')}")}
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:#d6f23a;color:#10120d;display:grid;align-content:center;padding:0 96px;gap:34px}
h1{font:700 64px/1.04 B;letter-spacing:-.035em;max-width:900px}p{font:600 30px/1.2 F;opacity:.82}svg{display:block}
</style><body>${wordmark}<h1>Minisitios para negocios, hechos por nosotros.</h1><p>tubio.link</p></body>`
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const pg = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await pg.setContent(page)
await pg.evaluate(() => document.fonts.ready)
const png = await pg.screenshot({ type: 'png' })
await browser.close()
await sharp(png).png({ compressionLevel: 9, palette: true }).toFile(join(root, 'public/img/og-tubio.png'))
console.log('✓ public/img/og-tubio.png')
