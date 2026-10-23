/**
 * Auditoría móvil: captura cada pantalla a 390×844 (iPhone 14) y mide lo que se puede medir:
 * scroll horizontal, objetivos táctiles < 44 px, texto < 14 px, campos sin etiqueta visible.
 *   TUBIO_A11Y_USER=… TUBIO_A11Y_PASS=… OUT=dir node scripts/mobile-audit.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { devices, chromium, type Page } from 'playwright'

const base = (process.env.TUBIO_A11Y_URL ?? 'http://127.0.0.1:3095').replace(/\/$/, '')
const out = process.env.OUT ?? 'data/mobile-audit'
mkdirSync(out, { recursive: true })
const PUBLIC = ['/', '/login', '/register', '/help', '/directory', '/demo', '/demo-negocio']
const PANEL = ['/panel', '/panel/links', '/panel/links/new?kind=short', '/panel/links/new?kind=bio', '/panel/qr', '/panel/qr/new?kind=url', '/panel/stats', '/panel/account', '/panel/plan', '/panel/domains', '/panel/team']

type Row = { path: string; hscroll: number; smallTargets: number; tinyText: number; examples: string[] }
const rows: Row[] = []

async function measure(page: Page, path: string, name: string) {
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const hscroll = Math.max(0, document.documentElement.scrollWidth - vw)
    const small: string[] = []
    for (const el of Array.from(document.querySelectorAll('a, button, input, select, textarea, [role=button], summary'))) {
      const b = el.getBoundingClientRect()
      if (!b.width || !b.height || getComputedStyle(el).visibility === 'hidden') continue
      if (b.height < 44 && b.width < 44 * 4 && !(el instanceof HTMLInputElement && el.type === 'hidden')) small.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} ${Math.round(b.width)}×${Math.round(b.height)} «${(el.textContent ?? '').trim().slice(0, 20)}»`)
    }
    let tiny = 0
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue
      if (parseFloat(getComputedStyle(el).fontSize) < 14) tiny++
    }
    return { hscroll, small, tiny }
  })
  rows.push({ path, hscroll: r.hscroll, smallTargets: r.small.length, tinyText: r.tiny, examples: r.small.slice(0, 40) })
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'es-MX' })
const page = await ctx.newPage()
let i = 0
for (const p of PUBLIC) await measure(page, p, `p${String(i++).padStart(2, '0')}`)
if (process.env.TUBIO_A11Y_USER) {
  await page.goto(base + '/login')
  await page.fill('input[name=email]', process.env.TUBIO_A11Y_USER)
  await page.fill('input[name=password]', process.env.TUBIO_A11Y_PASS ?? '')
  await Promise.all([page.waitForURL(/\/panel/), page.click('button[type=submit]')])
  const first = await page.locator('a[href^="/panel/links/"][href$="/blocks"]').first().getAttribute('href').catch(() => null)
  const extra = first ? [first, first.replace('/blocks', '/design'), first.replace('/blocks', '/stats'), first.replace('/blocks', '/blocks/new?type=link')] : []
  for (const p of [...PANEL, ...extra]) await measure(page, p, `a${String(i++).padStart(2, '0')}`)
}
await browser.close()
writeFileSync(`${out}/report.json`, JSON.stringify(rows, null, 2))
for (const r of rows) console.log(`${r.hscroll ? '⚠' : ' '} ${r.path.padEnd(42)} hscroll=${r.hscroll} táctiles<44=${r.smallTargets} texto<14px=${r.tinyText}`)
