/**
 * Vistas de los 6 ejemplos del home (public/img/ejemplos/<giro>.webp).
 *   node scripts/ejemplos-img.ts
 * Levanta una instancia desechable (base temporal), crea los ejemplos con `src/cli/ejemplos.ts`, los abre en un celular emulado (390×800) y guarda
 * la captura como WebP. Se corre otra vez cuando cambie el diseño de los ejemplos; las imágenes se versionan con ASSET_VERSION.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { GIROS, GIRO_META } from '../src/modules/minisitio/giros.ts'

const PORT = 3197
const dir = mkdtempSync(join(tmpdir(), 'tubio-ej-'))
const env = { ...process.env, TUBIO_DATA_DIR: dir, TUBIO_SECRET: 'x'.repeat(48), TUBIO_PORT: String(PORT), TUBIO_HOST: '127.0.0.1', TUBIO_BASE_URL: `http://127.0.0.1:${PORT}`, TUBIO_SMTP_URL: '' }
const run = (...a: string[]) => {
  const r = spawnSync(process.execPath, a, { env, stdio: 'inherit' })
  if (r.status) throw new Error(`falló: node ${a.join(' ')}`)
}
run('src/db/cli.ts')
run('src/cli/ejemplos.ts', '--whatsapp', '5213121234567')
const server = spawn(process.execPath, ['src/server.ts'], { env, stdio: 'ignore' })
const out = join(import.meta.dirname, '..', 'public', 'img', 'ejemplos')
mkdirSync(out, { recursive: true })
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, locale: 'es-MX', colorScheme: 'light', reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  for (const g of GIROS) {
    await page.goto(`http://127.0.0.1:${PORT}/${GIRO_META[g].example}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 390, height: 800 } })
    const webp = await sharp(png).resize(390, 800).webp({ quality: 80 }).toBuffer()
    await sharp(webp).toFile(join(out, `${g}.webp`))
    console.log(`✓ ${g}.webp (${Math.round(webp.length / 1024)} KB)`)
  }
  await browser.close()
} finally {
  server.kill('SIGTERM')
  rmSync(dir, { recursive: true, force: true })
}
