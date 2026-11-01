/**
 * Capturas del logo final «túbio»: cabecera y pie a 390, el panel en oscuro y una «pestaña» armada con el favicon y el <title> REALES de la instancia.
 *   node scripts/logo-capturas.ts <carpeta-salida>
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const out = resolve(process.argv[2] ?? 'capturas-logo')
const PORT = 3192
const dir = mkdtempSync(join(tmpdir(), 'tubio-logo-'))
const env = { ...process.env, TUBIO_DATA_DIR: dir, TUBIO_SECRET: 'l'.repeat(48), TUBIO_PORT: String(PORT), TUBIO_HOST: '127.0.0.1', TUBIO_BASE_URL: `http://127.0.0.1:${PORT}`, TUBIO_SMTP_URL: '' }
if (spawnSync(process.execPath, ['src/db/cli.ts'], { env, stdio: 'ignore' }).status) throw new Error('migración')
const server = spawn(process.execPath, ['src/server.ts'], { env, stdio: 'ignore' })
mkdirSync(out, { recursive: true })
const base = `http://127.0.0.1:${PORT}`
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${base}/healthz`)).ok) break } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 250)) }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  const nuevo = (scheme: 'light' | 'dark', w = 390) => browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, locale: 'es-MX', colorScheme: scheme })

  let ctx = await nuevo('light'); let p = await ctx.newPage()
  await p.goto(`${base}/`, { waitUntil: 'load' })
  await p.waitForFunction(() => [...document.images].every((i) => i.complete))
  await p.screenshot({ path: join(out, 'cabecera-390.png'), clip: { x: 0, y: 0, width: 390, height: 230 } })
  await p.evaluate(() => document.querySelector('footer')!.scrollIntoView())
  await p.addStyleTag({ content: '.cta{display:none!important}' })
  const f = await p.locator('footer').boundingBox()
  await p.screenshot({ path: join(out, 'pie-390.png'), clip: { x: 0, y: f!.y, width: 390, height: f!.height }, fullPage: true })
  const titulo = await p.title()
  await p.goto(`${base}/salud`, { waitUntil: 'load' }); await p.waitForTimeout(300)
  await p.screenshot({ path: join(out, 'cabecera-giro-390.png'), clip: { x: 0, y: 0, width: 390, height: 120 } })
  await ctx.close()

  ctx = await nuevo('dark'); p = await ctx.newPage()
  await p.goto(`${base}/login`, { waitUntil: 'load' }); await p.waitForTimeout(300)
  await p.screenshot({ path: join(out, 'login-oscuro-390.png'), clip: { x: 0, y: 0, width: 390, height: 420 } })
  await ctx.close()

  // «pestaña»: el favicon que sirve la instancia (/favicon.ico, el que piden los navegadores) y el <title> real, en claro y en oscuro
  const ico = Buffer.from(await (await fetch(`${base}/favicon.ico`)).arrayBuffer()).toString('base64')
  const png32 = Buffer.from(await (await fetch(`${base}/_/static/img/brand/tubio-favicon-32.png`)).arrayBuffer()).toString('base64')
  const tab = (dark: boolean) => `<body style="margin:0;background:${dark ? '#202124' : '#dee1e6'};font:13px system-ui,sans-serif;width:560px;padding:10px 12px 0">
<div style="display:flex;align-items:flex-end;gap:2px;height:36px"><div style="display:flex;align-items:center;gap:8px;background:${dark ? '#35363a' : '#fff'};color:${dark ? '#e8eaed' : '#202124'};padding:0 14px;height:34px;border-radius:9px 9px 0 0;width:236px"><img src="data:image/png;base64,${png32}" width="16" height="16"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${titulo}</span><span style="margin-left:auto;opacity:.6">✕</span></div></div>
<div style="background:${dark ? '#35363a' : '#fff'};height:34px;display:flex;align-items:center;padding:0 14px;color:${dark ? '#9aa0a6' : '#5f6368'}">tubio.link</div>
<div style="padding:14px 4px 14px;display:flex;gap:26px;align-items:center;background:${dark ? '#202124' : '#f1f3f4'};color:${dark ? '#e8eaed' : '#202124'}"><span>favicon.ico servido en /favicon.ico (16 · 32 · 48):</span><img src="data:image/x-icon;base64,${ico}" width="16" height="16"><img src="data:image/x-icon;base64,${ico}" width="32" height="32"><img src="data:image/x-icon;base64,${ico}" width="48" height="48"></div></body>`
  const t = await browser.newPage({ viewport: { width: 584, height: 190 }, deviceScaleFactor: 3 })
  for (const dark of [false, true]) { await t.setContent(tab(dark)); await t.screenshot({ path: join(out, `pestana-${dark ? 'oscuro' : 'claro'}.png`) }) }
  await browser.close()
  console.log('título real de la pestaña:', titulo)
} finally {
  server.kill('SIGTERM')
  rmSync(dir, { recursive: true, force: true })
}
