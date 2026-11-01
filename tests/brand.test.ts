import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultBioData } from '../src/modules/bio/design.ts'
import { createLink } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

/**
 * REGLA DE MARCA (Alejandro, 1-nov-2026, permanente): la marca se escribe «túbio» (ú con acento; suena «tú bio», no «tubo») en TODO texto visible.
 * Se quedan sin acento: el dominio y las URL (tubio.link, tubio.site), los alias, los correos, los nombres de archivo y de paquete, las variables y los identificadores de código.
 * Este archivo falla si «tubio» sin acento reaparece como PALABRA SUELTA en un texto que ve una persona.
 */

// «tubio» como palabra suelta: no es parte de una URL, un correo, un dominio, un identificador (tubio_, tubio-, TUBIO_) ni un nombre de archivo
const SUELTA = /(?<![\w@./:#$-])tubio(?![\w@/-]|\.(?:link|site|test|com|sqlite|mx|local|app|org|net|json|csv|png)\b)/gi
const sueltas = (s: string) => [...s.matchAll(SUELTA)].map((m) => `…${s.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ')}…`)

const ROOT = join(import.meta.dirname, '..')
const walk = (dir: string, ext: RegExp, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, ext, out)
    else if (ext.test(f)) out.push(p)
  }
  return out
}

/** Lo que ve una persona de una página: texto + title/alt/aria-label/placeholder/content (sin scripts, estilos ni URL) */
function visible(html: string): string {
  const sinCodigo = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const attrs = [...sinCodigo.matchAll(/\b(?:title|alt|aria-label|placeholder|content|value)="([^"]*)"/gi)].map((m) => m[1]!)
  const texto = sinCodigo.replace(/<[^>]+>/g, ' ')
  return [texto, ...attrs].join('\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}

describe('marca «túbio»', () => {
  it('los catálogos de textos (es y en) y los documentos legales y de ayuda no traen «tubio» sin acento', () => {
    for (const f of ['src/locales/es-MX.json', 'src/locales/en.json']) {
      const cat = JSON.parse(readFileSync(join(ROOT, f), 'utf8')) as Record<string, string>
      const malas = Object.entries(cat).flatMap(([k, v]) => sueltas(String(v)).map((s) => `${f} ${k}: ${s}`))
      expect(malas, malas.join('\n')).toEqual([])
    }
    const md = walk(join(ROOT, 'src/content'), /\.md$/)
    expect(md.length).toBeGreaterThan(8)
    const malas = md.flatMap((f) => sueltas(readFileSync(f, 'utf8')).map((s) => `${f.replace(ROOT, '')}: ${s}`))
    expect(malas, malas.join('\n')).toEqual([])
    expect(readFileSync(join(ROOT, 'README.md'), 'utf8').split('\n')[0]).toBe('# túbio')
  })

  it('en el código no hay textos con «tubio» sin acento (los identificadores permitidos están en la lista)', () => {
    // identificadores, no texto visible: etiqueta y grupo del helpdesk, metadata de Stripe, alias reservado
    const PERMITIDO = [/app:\s*'tubio'/, /\.app\s*!==\s*'tubio'/, /\|\|\s*'tubio'/, /tags:\s*\['tubio'/, /'terminos',\s*'tubio'/]
    const malas: string[] = []
    for (const f of walk(join(ROOT, 'src'), /\.ts$/)) {
      readFileSync(f, 'utf8').split('\n').forEach((raw, i) => {
        const l = raw.trim()
        if (/^(\/\/|\/\*|\*)/.test(l)) return // comentarios: no los ve nadie
        const codigo = raw.replace(/\s\/\/\s.*$/, '') // comentario al final de la línea
        if (PERMITIDO.some((p) => p.test(codigo))) return
        for (const s of sueltas(codigo)) malas.push(`${f.replace(ROOT, '')}:${i + 1}: ${s}`)
      })
    }
    expect(malas, malas.join('\n')).toEqual([])
  })

  it('las páginas públicas, el panel y el admin, en español y en inglés, no muestran «tubio» sin acento', async () => {
    const t = await makeApp()
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const publico = ['/', '/login', '/register', '/forgot', '/help', '/directory', '/privacy', '/terms', '/acceptable-use', '/security', '/armamos-por-ti', '/restaurantes', '/belleza', '/salud', '/inmobiliarias', '/fitness', '/servicios-profesionales', '/no-existe-esta-pagina']
    const malas: string[] = []
    for (const lang of ['es-MX', 'en']) {
      const v = new Agent(t.app)
      await v.get(`/lang/${lang}`)
      for (const p of publico) {
        const r = await v.get(p)
        expect(r.statusCode, `${lang} ${p}`).toBeLessThan(500)
        malas.push(...sueltas(visible(r.body)).map((s) => `[${lang}] ${p}: ${s}`))
      }
    }
    const admin = await loginAgent(t, 'admin@example.com')
    for (const p of ['/panel', '/panel/links', '/panel/qr', '/panel/stats', '/panel/account', '/panel/plan', '/admin', '/admin/settings']) {
      const r = await admin.get(p)
      expect(r.statusCode, p).toBeLessThan(500)
      malas.push(...sueltas(visible(r.body)).map((s) => `[panel] ${p}: ${s}`))
    }
    expect(malas, malas.join('\n')).toEqual([])
    // el título, la marca de la cabecera y el nombre del sitio llevan el acento
    const home = (await new Agent(t.app).get('/')).body
    expect(home).toContain('<title>túbio · ')
    expect(home).toMatch(/class="logo"[^>]*>túbio<\/a>/)
    expect(t.deps.config.mailFrom.includes('túbio') || process.env.TUBIO_MAIL_FROM !== undefined).toBe(true)
  })

  it('la página bio pública, su pie «Hecho con túbio» y los correos transaccionales llevan el acento', async () => {
    const t = await makeApp()
    const u = await seedUser(t, 'dueno@example.com')
    createLink(t.deps.db, u.id, { project_id: null, alias: 'mi-pagina', kind: 'bio', title: 'Mi página', target_url: null, redirect_code: 302, data: { ...defaultBioData('Mi página', '', 'papel') },
      is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false }, t.clock.now)
    const bio = (await new Agent(t.app).get('/mi-pagina')).body
    expect(bio).toMatch(/Hecho con <b>túbio<\/b>|Made with <b>túbio<\/b>/)
    expect(sueltas(visible(bio))).toEqual([])
    // correo de verificación al registrarse (es y en)
    for (const lang of ['es-MX', 'en']) {
      const a = new Agent(t.app)
      await a.get(`/lang/${lang}`)
      await a.get('/register')
      await a.post('/register', { email: `nuevo-${lang}@example.com`, password: 'contrasena-segura', accept: '1' })
      const m = t.mailer.sent.at(-1)!
      expect(m.subject).toContain('túbio')
      expect(sueltas(`${m.subject}\n${m.text}`)).toEqual([])
    }
  })
})
