/**
 * Aplica una versión del logo final de design: copia wordmark, isotipo, favicon (.ico/svg/png), íconos de app, deriva apple-touch (180) y el 192 del manifiesto,
 * regenera la imagen para redes (OG), sube ASSET_VERSION y corre la prueba del logo.
 *   node scripts/logo-aplicar.ts <carpeta logo/final>
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'

const origen = resolve(process.argv[2] ?? '')
const root = join(import.meta.dirname, '..')
const brand = join(root, 'public/img/brand')
const falta = (f: string) => { throw new Error(`falta ${f} en ${origen}`) }
const cp = (de: string, a: string) => { const s = join(origen, de); if (!existsSync(s)) falta(de); copyFileSync(s, a); console.log('  →', a.replace(root + '/', '')) }

for (const f of ['tubio-logotipo-papel.svg', 'tubio-logotipo-tinta.svg', 'tubio-isotipo-papel.svg', 'tubio-isotipo-tinta.svg', 'tubio-logotipo-papel.png', 'tubio-app-512-lima.png', 'tubio-app-512-tinta.png', 'tubio-favicon-16.png', 'tubio-favicon-32.png', 'tubio-favicon-48.png']) cp(f, join(brand, f))
cp('tubio-favicon-32.svg', join(root, 'public/img/favicon.svg'))
cp('favicon.ico', join(root, 'public/img/favicon.ico'))
await sharp(join(brand, 'tubio-app-512-lima.png')).resize(192, 192).png({ compressionLevel: 9 }).toFile(join(brand, 'tubio-app-192-lima.png'))
await sharp(join(brand, 'tubio-app-512-lima.png')).resize(180, 180).png({ compressionLevel: 9 }).toFile(join(brand, 'apple-touch-icon.png'))
console.log('  → derivados: tubio-app-192-lima.png, apple-touch-icon.png')

// el SVG nuevo debe llevar el acento en su etiqueta: es la comprobación mínima de que es la versión «túbio»
for (const f of ['tubio-logotipo-papel.svg', 'tubio-logotipo-tinta.svg']) if (!readFileSync(join(brand, f), 'utf8').includes('aria-label="túbio"')) throw new Error(`${f} no dice «túbio»`)

// versión de estáticos +1 (rompe la caché de navegadores y de la CDN)
const lay = join(root, 'src/views/layout.ts')
const src = readFileSync(lay, 'utf8')
const nueva = String(Number(/ASSET_VERSION = '(\d+)'/.exec(src)![1]) + 1)
writeFileSync(lay, src.replace(/ASSET_VERSION = '\d+'/, `ASSET_VERSION = '${nueva}'`))
console.log('  → ASSET_VERSION', nueva)

for (const [cmd, args] of [['node', ['scripts/og-image.ts']], ['npx', ['vitest', 'run', 'tests/brand.test.ts']], ['npx', ['tsc', '--noEmit']]] as const) {
  const r = spawnSync(cmd, [...args], { cwd: root, stdio: 'inherit' })
  if (r.status) process.exit(r.status)
}
console.log('\n✓ logo aplicado. Falta: node scripts/logo-capturas.ts <carpeta>, suite completa, commit y UN deploy (pull, npm ci, restart; sin migración).')
