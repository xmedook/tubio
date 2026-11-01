/**
 * Capturas (390 y 1440), axe y desborde de rutas públicas del diseño del sitio, contra una instancia desechable con los ejemplos cargados.
 *   node scripts/sitio-capturas.ts <carpeta-salida> /restaurantes /belleza …   [--abierto] [--en]
 * Sale con 1 si axe encuentra violaciones, hay scroll horizontal o la página responde algo que no es 200.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { AxeBuilder } from '@axe-core/playwright'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const out = resolve(args[0] ?? 'capturas')
// «/ruta=404»: se espera ese estado (p. ej. la página de error)
const rutas = args.slice(1).filter((a) => a.startsWith('/')).map((a) => { const m = /^(.*)=(\d{3})$/.exec(a); return { path: m?.[1] ?? a, esperado: m ? Number(m[2]) : 200 } })
const abierto = args.includes('--abierto')
const locale = args.includes('--en') ? 'en' : 'es-MX'
const PORT = 3197
const dir = mkdtempSync(join(tmpdir(), 'tubio-sitio-'))
const env = { ...process.env, TUBIO_DATA_DIR: dir, TUBIO_SECRET: 'y'.repeat(48), TUBIO_PORT: String(PORT), TUBIO_HOST: '127.0.0.1', TUBIO_BASE_URL: `http://127.0.0.1:${PORT}`, TUBIO_SMTP_URL: '' }
const run = (...a: string[]) => { if (spawnSync(process.execPath, a, { env, stdio: 'ignore' }).status) throw new Error(`falló: ${a.join(' ')}`) }
run('src/db/cli.ts')
run('src/cli/ejemplos.ts')
const { openDb } = await import('../src/db/index.ts')
const { setSetting } = await import('../src/modules/settings/repo.ts')
const db = openDb(join(dir, 'tubio.sqlite'))
setSetting(db, 'registration_open', abierto)
db.close()
const server = spawn(process.execPath, ['src/server.ts'], { env, stdio: 'ignore' })
mkdirSync(out, { recursive: true })
let mal = 0
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)) }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  for (const [nombre, w, h] of [['390', 390, 844], ['1440', 1440, 900]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w === 390 ? 2 : 1, locale })
    const page = await ctx.newPage()
    const errores: string[] = []
    page.on('console', (m) => { if (m.type() === 'error' && !((args.includes('--asistida') || args.includes('--acceso')) && /status of 4\d\d/.test(m.text())) && !(rutas.some((r) => r.esperado !== 200) && /status of 4\d\d/.test(m.text()))) errores.push(m.text()) }) // el 422 del formulario enviado vacío es lo esperado
    page.on('pageerror', (e) => errores.push(e.message))
    if (args.includes('--panel')) {
      // cuenta nueva por el formulario de registro (necesita --abierto); la sesión queda en el contexto del navegador
      await page.goto(`http://127.0.0.1:${PORT}/register`, { waitUntil: 'networkidle' })
      await page.fill('#f-name', 'Ana Gómez')
      await page.fill('#f-email', `ana${nombre}@ejemplo.mx`)
      await page.fill('#f-password', 'contrasena-segura-1')
      await page.check('#f-accept')
      await page.waitForFunction(() => (document.querySelector('input[name=_pow]') as HTMLInputElement | null)?.value, null, { timeout: 20000 }).catch(() => {}) // la prueba de trabajo corre sola
      await page.click('button[type=submit]')
      await page.waitForURL(/\/panel/, { timeout: 90000 }).catch(() => {})
      if (args.includes('--admin')) { const d2 = openDb(join(dir, 'tubio.sqlite')); d2.prepare("UPDATE users SET role = 'admin'").run(); d2.close() } // la cuenta de la captura pasa a administradora
      if (!/\/panel/.test(page.url())) throw new Error(`el registro no entró al panel: ${page.url()} — ${(await page.locator('.msg-e, .al').allTextContents()).join(' | ')}`)
    }
    for (const { path, esperado } of rutas) {
      const id = path.replace(/^\//, '').replace(/[/?=&]+/g, '-') || 'inicio'
      const r = await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.querySelectorAll('img[loading=lazy]').forEach((i) => ((i as HTMLImageElement).loading = 'eager')))
      await page.waitForTimeout(200)
      await page.screenshot({ path: join(out, `${id}-${nombre}.png`), fullPage: true })
      const ancho = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vp: window.innerWidth }))
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      const estado = r?.status() ?? 0
      const fallas = [estado !== esperado ? `HTTP ${estado}` : '', ancho.doc > ancho.vp ? `desborde ${ancho.doc}>${ancho.vp}` : '', ...axe.violations.map((v) => `axe ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)].filter(Boolean)
      if (fallas.length) mal++
      console.log(`${fallas.length ? '✗' : '✓'} ${nombre} ${path}${fallas.length ? ' — ' + fallas.join('; ') : ''}`)
    }
    if (args.includes('--acceso')) {
      const revisa2 = async (id: string) => {
        await page.waitForTimeout(200)
        await page.screenshot({ path: join(out, `${id}-${nombre}.png`), fullPage: true })
        const ancho = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vp: window.innerWidth }))
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
        const fallas = [ancho.doc > ancho.vp ? `desborde ${ancho.doc}>${ancho.vp}` : '', ...axe.violations.map((v) => `axe ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)].filter(Boolean)
        if (fallas.length) mal++
        console.log(`${fallas.length ? '✗' : '✓'} ${nombre} ${id}${fallas.length ? ' — ' + fallas.join('; ') : ''}`)
      }
      await page.goto(`http://127.0.0.1:${PORT}/login`, { waitUntil: 'networkidle' })
      await page.fill('#f-email', 'ana@ejemplo.mx')
      await page.fill('#f-password', 'incorrecta-123')
      await Promise.all([page.waitForLoadState('load'), page.click('button[type=submit]')])
      await revisa2('login-error')
      await page.goto(`http://127.0.0.1:${PORT}/forgot`, { waitUntil: 'networkidle' })
      await page.fill('#f-email', 'ana@ejemplo.mx')
      await Promise.all([page.waitForLoadState('load'), page.click('button[type=submit]')])
      await revisa2('forgot-enviado')
      await page.goto(`http://127.0.0.1:${PORT}/register`, { waitUntil: 'networkidle' })
      await page.fill('#f-email', 'ana@ejemplo')
      await Promise.all([page.waitForLoadState('load'), page.click('button[type=submit]')])
      await revisa2('register-error')
    }
    if (args.includes('--asistida')) {
      // flujo real del formulario: enviar vacío (errores) y enviar bien (folio). PoW apagado en la instancia desechable.
      const revisa = async (id: string) => {
        await page.waitForTimeout(200)
        await page.screenshot({ path: join(out, `${id}-${nombre}.png`), fullPage: true })
        const ancho = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vp: window.innerWidth }))
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
        const fallas = [ancho.doc > ancho.vp ? `desborde ${ancho.doc}>${ancho.vp}` : '', ...axe.violations.map((v) => `axe ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)].filter(Boolean)
        if (fallas.length) mal++
        console.log(`${fallas.length ? '✗' : '✓'} ${nombre} ${id}${fallas.length ? ' — ' + fallas.join('; ') : ''}`)
      }
      await page.goto(`http://127.0.0.1:${PORT}/armamos-por-ti`, { waitUntil: 'networkidle' })
      await page.fill('#a-wa', '33 1234 5678')
      await Promise.all([page.waitForLoadState('load'), page.click('button[type=submit]')])
      await revisa('armamos-por-ti-error')
      await page.fill('#a-biz', 'Atelier Nácar')
      await page.selectOption('#a-giro', 'belleza')
      await page.check('input[name=priv]')
      await Promise.all([page.waitForLoadState('load'), page.click('button[type=submit]')])
      await revisa('armamos-por-ti-enviado')
    }
    if (errores.length) { mal++; console.log(`✗ ${nombre} errores de consola: ${[...new Set(errores)].slice(0, 3).join(' | ')}`) }
    await ctx.close()
  }
  await browser.close()
} finally {
  server.kill()
  rmSync(dir, { recursive: true, force: true })
}
console.log(mal ? `\n${mal} con fallas` : '\nSin fallas: HTTP 200, sin desborde, axe limpio')
process.exit(mal ? 1 : 0)
