/**
 * Capturas del home y de las páginas relacionadas (390 y 1440) contra una instancia desechable.
 *   node scripts/home-capturas.ts <carpeta-salida> [--whatsapp 5213121234567] [--abierto]   (--abierto: registro propio abierto)
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const out = resolve(process.argv[2] ?? 'capturas')
const wi = process.argv.indexOf('--whatsapp')
const whatsapp = wi > 0 ? String(process.argv[wi + 1]) : ''
const abierto = process.argv.includes('--abierto')
const PORT = 3198
const dir = mkdtempSync(join(tmpdir(), 'tubio-cap-'))
const env = { ...process.env, TUBIO_DATA_DIR: dir, TUBIO_SECRET: 'y'.repeat(48), TUBIO_PORT: String(PORT), TUBIO_HOST: '127.0.0.1', TUBIO_BASE_URL: `http://127.0.0.1:${PORT}`, TUBIO_SMTP_URL: '' }
const run = (...a: string[]) => { if (spawnSync(process.execPath, a, { env, stdio: 'ignore' }).status) throw new Error(`falló: ${a.join(' ')}`) }
run('src/db/cli.ts')
run('src/cli/ejemplos.ts')
const { openDb } = await import('../src/db/index.ts')
const { setSetting } = await import('../src/modules/settings/repo.ts')
const db = openDb(join(dir, 'tubio.sqlite'))
if (whatsapp) setSetting(db, 'sales_whatsapp', whatsapp)
setSetting(db, 'registration_open', abierto)
db.close()
const server = spawn(process.execPath, ['src/server.ts'], { env, stdio: 'ignore' })
mkdirSync(out, { recursive: true })
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)) }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  for (const [nombre, w, h] of [['390', 390, 844], ['1440', 1440, 900]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 2 : 1, locale: 'es-MX' })
    const page = await ctx.newPage()
    const errores: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
    page.on('pageerror', (e) => errores.push(e.message))
    for (const [id, path] of [['home', '/'], ['asistida', '/armamos-por-ti?negocio=Caf%C3%A9%20La%20Ceiba'], ['giro-salud', '/salud']] as const) {
      await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => ((i as HTMLImageElement).loading = 'eager')))
      await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 }).catch(() => {})
      await page.addStyleTag({ content: '.cta{position:static!important}.bar{position:static!important}' }) // las barras fijas salen una sola vez en la captura completa
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(out, `${id}-${nombre}.png`), fullPage: true })
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      console.log(`${id}-${nombre}: desborde horizontal ${desborde}px`)
      if (desborde > 0) {
        const culpables = await page.evaluate((W) => [...document.querySelectorAll('body *')].filter((e) => !e.closest('.rail') && e.getBoundingClientRect().right > W + 1).slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)} → ${Math.round(e.getBoundingClientRect().right)}`), w)
        console.log('  culpables:', culpables)
      }
    }
    // el eco de «Prueba cómo se verá tu liga»
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' })
    await page.fill('#neg', 'Atelier Nácar')
    console.log(`eco ${nombre}:`, await page.textContent('#slug'), '|', await page.textContent('#nm'), '|', await page.getAttribute('[data-negocio-href="/armamos-por-ti"]', 'href'))
    if (errores.length) console.log('errores de consola:', errores.slice(0, 5))
    await ctx.close()
  }
  await browser.close()
} finally {
  server.kill('SIGTERM')
  rmSync(dir, { recursive: true, force: true })
}
