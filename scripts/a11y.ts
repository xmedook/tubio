/**
 * Auditoría automática WCAG 2.2 AA con axe-core sobre una instalación corriendo.
 *   TUBIO_A11Y_URL=http://127.0.0.1:3095 TUBIO_A11Y_USER=demo@tubio.local TUBIO_A11Y_PASS=demo-demo-demo node scripts/a11y.ts
 * Sale con 1 si hay violaciones. axe no ve todo: falta la revisión manual con teclado y lector de pantalla.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { chromium, type Page } from 'playwright'

const base = (process.env.TUBIO_A11Y_URL ?? 'http://127.0.0.1:3095').replace(/\/$/, '')
const user = process.env.TUBIO_A11Y_USER
const pass = process.env.TUBIO_A11Y_PASS
const bio = process.env.TUBIO_A11Y_BIO ?? 'demo'

const PUBLIC = ['/', '/restaurantes', '/salud', '/armamos-por-ti', '/ejemplo-restaurante', '/ejemplo-salud', '/ejemplo-fitness', '/login', '/register', '/forgot', '/help', '/help/primeros-pasos', '/help/contact', '/directory', '/blog', '/terms', '/security', `/${bio}`, '/no-existe-esta-pagina']
const PANEL = ['/panel', '/panel/links', '/panel/links/new?kind=short', '/panel/links/new?kind=bio', '/panel/qr', '/panel/qr/new?kind=url', '/panel/stats', '/panel/account', '/panel/plan', '/panel/referrals']

async function audit(page: Page, path: string, theme: string): Promise<number> {
  await page.goto(base + path, { waitUntil: 'networkidle' })
  // los iframes de terceros (YouTube, Telegram…) no son nuestros: su contraste y etiquetas no los controlamos
  const r = await new AxeBuilder({ page }).exclude('iframe:not([src^="/"])').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const external = (t: unknown) => /iframe\[src="?https?:/.test(String(t))
  r.violations = r.violations.map((v) => ({ ...v, nodes: v.nodes.filter((n) => !n.target.some(external)) })).filter((v) => v.nodes.length)
  for (const v of r.violations) {
    console.log(`✗ [${theme}] ${path} — ${v.id} (${v.impact}): ${v.help}`)
    for (const n of v.nodes.slice(0, Number(process.env.TUBIO_A11Y_NODES ?? 3))) console.log(`    ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`)
  }
  return r.violations.length
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
let total = 0
for (const scheme of ['light', 'dark'] as const) {
  const ctx = await browser.newContext({ colorScheme: scheme, locale: 'es-MX' })
  const page = await ctx.newPage()
  for (const p of PUBLIC) total += await audit(page, p, scheme)
  if (user && pass) {
    await page.goto(base + '/login')
    await page.fill('input[name=email]', user)
    await page.fill('input[name=password]', pass)
    await Promise.all([page.waitForURL(/\/panel/), page.click('button[type=submit]')])
    const first = await page.locator('a[href^="/panel/links/"][href$="/blocks"]').first().getAttribute('href').catch(() => null)
    const extra = first ? [first, first.replace('/blocks', '/design'), first.replace('/blocks', '/stats')] : []
    for (const p of [...PANEL, ...extra]) total += await audit(page, p, scheme)
  }
  await ctx.close()
}
await browser.close()
console.log(total ? `\n${total} violaciones` : '\nSin violaciones automáticas')
process.exit(total ? 1 : 0)
