/**
 * Revisa que las páginas públicas de una instalación no muestren «tubio» sin acento como palabra suelta (regla de marca: «túbio»).
 *   node scripts/marca-publica.ts https://tubio.link
 * Sale con 1 si encuentra alguna. Es la misma regla de tests/brand.test.ts, aplicada a un sitio vivo (solo GET).
 */
const base = (process.argv[2] ?? 'http://127.0.0.1:3095').replace(/\/$/, '')
const SUELTA = /(?<![\w@./:#$-])tubio(?![\w@/-]|\.(?:link|site|test|com|sqlite|mx|local|app|org|net|json|csv|png)\b)/gi
const visible = (html: string) => {
  const s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const attrs = [...s.matchAll(/\b(?:title|alt|aria-label|placeholder|content|value)="([^"]*)"/gi)].map((m) => m[1]!)
  return [s.replace(/<[^>]+>/g, ' '), ...attrs].join('\n')
}
const PAGINAS = ['/', '/login', '/register', '/forgot', '/help', '/directory', '/blog', '/privacy', '/terms', '/acceptable-use', '/security', '/armamos-por-ti', '/restaurantes', '/belleza', '/salud', '/inmobiliarias', '/fitness', '/servicios-profesionales', '/ejemplo-restaurante', '/ejemplo-belleza', '/ejemplo-salud', '/ejemplo-inmobiliaria', '/ejemplo-fitness', '/ejemplo-servicios', '/no-existe-esta-pagina']
let malas = 0
for (const lang of ['es-MX', 'en']) {
  const cookie = (await fetch(`${base}/lang/${lang}`, { redirect: 'manual' })).headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  for (const p of PAGINAS) {
    const r = await fetch(base + p, { headers: { cookie } })
    const html = await r.text()
    const hits = [...visible(html).matchAll(SUELTA)].map((m) => m[0])
    const titulo = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
    if (hits.length) { malas += hits.length; console.log(`✗ [${lang}] ${p} (${r.status}): «${titulo}» → ${hits.length} sin acento`) }
    else if (lang === 'es-MX') console.log(`✓ ${p} (${r.status}) ${titulo.slice(0, 60)}`)
  }
}
console.log(malas ? `\n✗ ${malas} aparición(es) de «tubio» sin acento` : '\n✓ ninguna aparición de «tubio» sin acento')
process.exit(malas ? 1 : 0)
