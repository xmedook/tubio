import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/lib/markdown.ts'
import { BLOCKS } from '../src/modules/bio/blocks.ts'
import { soundcloudEmbed, spotifyEmbed, tiktokEmbed, twitchEmbed, vimeoEmbed, youtubeEmbed } from '../src/modules/bio/embeds.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { normalizeSocial } from '../src/modules/bio/socials.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { dictionary } from '../src/lib/i18n.ts'
import { Agent, loginAgent, makeApp, seedUser, type TestApp } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' }

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 200, channels: 3, background: '#3366ff' } }).png().toBuffer()
}

async function bioPage(): Promise<{ t: TestApp; a: Agent; id: number }> {
  const t = await makeApp()
  await seedUser(t)
  const a = await loginAgent(t)
  await a.get('/panel/links/new?kind=bio')
  const res = await a.postMultipart('/panel/links?kind=bio', { alias: 'ana', title: 'Ana Pérez', is_enabled: '1' })
  expect(res.statusCode).toBe(303)
  const id = findByAlias(t.deps.db, 'ana')!.id
  expect(res.headers.location).toBe(`/panel/links/${id}/blocks`)
  await a.get(`/panel/links/${id}/blocks`)
  return { t, a, id }
}

describe('markdown seguro', () => {
  it('escapa HTML y sólo permite enlaces http(s)/mailto', () => {
    const out = renderMarkdown('# Hola\n**negrita** <script>x</script> [ok](https://a.com) [mal](javascript:alert(1))\n\n- uno\n- dos')
    expect(out).toContain('<h2>Hola</h2>')
    expect(out).toContain('<strong>negrita</strong>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('<a href="https://a.com"')
    expect(out).not.toContain('href="javascript')
    expect(out).toContain('<ul><li>uno</li><li>dos</li></ul>')
  })
  it('no deja romper atributos con comillas', () => {
    expect(renderMarkdown('[x](https://a.com/"onmouseover="alert(1))')).not.toMatch(/href="[^"]*"onmouseover/)
  })
})

describe('embeds', () => {
  it('reconoce URLs de cada proveedor', () => {
    expect(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ?t=42')?.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42')
    expect(youtubeEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.ratio).toBe('9x16')
    expect(youtubeEmbed('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(vimeoEmbed('https://vimeo.com/76979871')?.src).toBe('https://player.vimeo.com/video/76979871')
    expect(tiktokEmbed('https://www.tiktok.com/@scout2015/video/6718335390845095173')?.src).toContain('/player/v1/6718335390845095173')
    expect(twitchEmbed('https://www.twitch.tv/monstercat', 'tubio.link')?.src).toContain('channel=monstercat&parent=tubio.link')
    expect(spotifyEmbed('https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT?si=x')?.src).toBe('https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT')
    expect(soundcloudEmbed('https://soundcloud.com/forss/flickermood')?.src).toContain('w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood')
  })
})

describe('redes', () => {
  it('acepta usuario, @usuario o URL del host correcto', () => {
    expect(normalizeSocial('instagram', '@ana.mx')).toBe('https://instagram.com/ana.mx')
    expect(normalizeSocial('instagram', 'https://www.instagram.com/ana')).toBe('https://www.instagram.com/ana')
    expect(normalizeSocial('instagram', 'https://evil.com/ana')).toBeNull()
    expect(normalizeSocial('whatsapp', '+52 1 55 1234 5678'.replace(/\s/g, ''))).toBe('https://wa.me/5215512345678')
    expect(normalizeSocial('email', 'a@b.mx')).toBe('mailto:a@b.mx')
    expect(normalizeSocial('phone', '+52 (55) 1234-5678')).toBe('tel:+525512345678')
  })
})

describe('catálogo', () => {
  it('cada tipo y cada opción tiene texto en ambos idiomas', () => {
    expect(BLOCKS.length).toBeGreaterThanOrEqual(36)
    for (const loc of ['es-MX', 'en'] as const) {
      const d = dictionary(loc)
      for (const b of BLOCKS) {
        expect(d[`bio.type_${b.type}`], `${loc} bio.type_${b.type}`).toBeTruthy()
        for (const f of b.fields) {
          expect(d[f.label], `${loc} ${f.label}`).toBeTruthy()
          if (f.kind === 'select' && f.name !== 'timezone' && f.name !== 'currency') for (const o of f.options) expect(d[`bio.o.${b.type}.${f.name}.${o}`], `${loc} bio.o.${b.type}.${f.name}.${o}`).toBeTruthy()
        }
      }
    }
  })
})

describe('página bio', () => {
  it('nace con un encabezado y se publica con CSP estricta', async () => {
    const { t } = await bioPage()
    const res = await new Agent(t.app).get('/ana', UA)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<h1 class="heading">Ana Pérez')
    const csp = String(res.headers['content-security-policy'])
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(res.headers['x-frame-options']).toBe('DENY')
    // la única JS de la página pública es bio.js (<50 KB)
    expect((res.body.match(/<script/g) ?? []).length).toBe(1)
  })

  it('añade bloques de todos los tipos y los pinta', async () => {
    const { t, a, id } = await bioPage()
    const image = await png()
    const cases: [string, Record<string, string>, boolean?][] = [
      ['link', { label: 'Mi tienda', url: 'tienda.mx', subtitle: 'Envíos a todo México' }],
      ['big_link', { label: 'Inscríbete', url: 'https://curso.mx', effect: 'pulse' }],
      ['image_link', { label: 'Portafolio', url: 'https://port.mx', layout: 'thumb' }, true],
      ['paragraph', { text: 'Hola\nmundo <b>' }],
      ['markdown', { text: '**fuerte**' }],
      ['avatar', { alt: 'Foto de Ana', size: 'lg', shape: 'circle' }, true],
      ['image', { alt: 'Paisaje', caption: 'Mi foto' }, true],
      ['divider', { style: 'dots' }],
      ['list', { items: 'uno\ndos', style: 'check' }],
      ['alert', { text: 'Ojo', variant: 'warning' }],
      ['marquee', { text: 'Ofertas', speed: 'fast' }],
      ['socials', { social_instagram: '@ana', social_email: 'ana@ana.mx', colored: '1' }],
      ['share', { label: '' }],
      ['youtube', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Video' }],
      ['vimeo', { url: 'https://vimeo.com/76979871' }],
      ['tiktok', { url: 'https://www.tiktok.com/@a/video/6718335390845095173' }],
      ['twitch', { url: 'https://twitch.tv/monstercat' }],
      ['spotify', { url: 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy' }],
      ['soundcloud', { url: 'https://soundcloud.com/forss/flickermood' }],
      ['video', { url: 'https://cdn.example.com/v.mp4' }],
      ['audio', { url: 'https://cdn.example.com/a.mp3', title: 'Podcast' }],
    ]
    for (const [type, fields, withImage] of cases) {
      const res = await a.postMultipart(`/panel/links/${id}/blocks?type=${type}`, { ...fields, is_enabled: '1' }, withImage ? [{ field: 'image', filename: 'x.png', content: image, type: 'image/png' }] : [])
      expect(res.statusCode, `${type}: ${res.body.slice(0, 300)}`).toBe(303)
    }
    expect(listBlocks(t.deps.db, id)).toHaveLength(cases.length + 1)
    const page = await new Agent(t.app).get('/ana', UA)
    const b = page.body
    expect(b).toContain('Envíos a todo México')
    expect(b).toContain('Hola<br>mundo &lt;b&gt;')
    expect(b).toContain('<strong>fuerte</strong>')
    expect(b).toMatch(/<img class="avatar s-lg sh-circle" src="\/_\/u\/[\w-]+\.webp" alt="Foto de Ana"/)
    expect(b).toContain('class="soc soc-instagram"')
    expect(b).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(b).toContain('parent=tubio.test')
    expect(b).toContain('<video class="media"')
    expect(b).not.toContain('mundo <b>')
    // imagen subida servida como webp
    const src = /src="(\/_\/u\/[\w-]+\.webp)"/.exec(b)![1]!
    const img = await new Agent(t.app).get(src)
    expect(img.headers['content-type']).toBe('image/webp')
  })

  it('valida campos: URL peligrosa, embed ajeno, imagen falsa', async () => {
    const { a, id } = await bioPage()
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=link`, { label: 'x', url: 'javascript:alert(1)', is_enabled: '1' })).statusCode).toBe(422)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=youtube`, { url: 'https://vimeo.com/76979871', is_enabled: '1' })).statusCode).toBe(422)
    const fake = await a.postMultipart(`/panel/links/${id}/blocks?type=avatar`, { is_enabled: '1' }, [{ field: 'image', filename: 'x.png', content: Buffer.from('<?php echo 1;'), type: 'image/png' }])
    expect(fake.statusCode).toBe(422)
    expect(fake.body).toContain('no es una imagen válida')
  })

  it('clic en bloque cuenta y redirige; mailto también', async () => {
    const { t, a, id } = await bioPage()
    await a.postMultipart(`/panel/links/${id}/blocks?type=link`, { label: 'Escríbeme', url: 'mailto:ana@ana.mx', is_enabled: '1' })
    await a.postMultipart(`/panel/links/${id}/blocks?type=socials`, { social_github: 'ana', is_enabled: '1' })
    const page = await new Agent(t.app).get('/ana', UA)
    const hrefs = [...page.body.matchAll(/href="(\/_\/c\/\d+[^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'))
    expect(hrefs).toHaveLength(2)
    const v = new Agent(t.app)
    expect((await v.get(hrefs[0]!, UA)).headers.location).toBe('mailto:ana@ana.mx')
    expect((await v.get(hrefs[1]!, UA)).headers.location).toBe('https://github.com/ana')
    expect((await v.get(hrefs[1]!.replace('github', 'x'), UA)).statusCode).toBe(404)
    const blocks = listBlocks(t.deps.db, id)
    expect(blocks.find((b) => b.type === 'link')!.clicks).toBe(1)
    const clicks = t.deps.db.prepare("SELECT COUNT(*) FROM stat_events WHERE kind = 'click'").pluck().get()
    expect(clicks).toBe(2)
  })

  it('el clic de un bloque respeta la contraseña de la página', async () => {
    const { t, a, id } = await bioPage()
    await a.postMultipart(`/panel/links/${id}/blocks?type=link`, { label: 'Secreto', url: 'https://secreto.mx', is_enabled: '1' })
    await a.get(`/panel/links/${id}`)
    await a.postMultipart(`/panel/links/${id}`, { alias: 'ana', is_enabled: '1', password: 'clave' })
    const block = listBlocks(t.deps.db, id).find((b) => b.type === 'link')!
    expect((await new Agent(t.app).get(`/_/c/${block.id}`, UA)).statusCode).toBe(404)
  })

  it('ordena, oculta, mueve y borra bloques', async () => {
    const { t, a, id } = await bioPage()
    for (const label of ['A', 'B', 'C']) await a.postMultipart(`/panel/links/${id}/blocks?type=link`, { label, url: 'https://a.mx', is_enabled: '1' })
    const ids = () => listBlocks(t.deps.db, id).map((b) => (b.data.label as string) ?? 'h')
    expect(ids()).toEqual(['h', 'A', 'B', 'C'])
    const all = listBlocks(t.deps.db, id)
    await a.get(`/panel/links/${id}/blocks`)
    expect((await a.postJson(`/panel/links/${id}/blocks/order`, { ids: [all[3]!.id, all[2]!.id, all[1]!.id, all[0]!.id] })).statusCode).toBe(200)
    expect(ids()).toEqual(['C', 'B', 'A', 'h'])
    await a.post(`/panel/blocks/${all[0]!.id}/move`, { dir: 'up' })
    expect(ids()).toEqual(['C', 'B', 'h', 'A'])
    await a.post(`/panel/blocks/${all[2]!.id}/toggle`)
    expect((await new Agent(t.app).get('/ana', UA)).body).not.toContain('>B<')
    await a.post(`/panel/blocks/${all[2]!.id}/delete`)
    expect(ids()).toEqual(['C', 'h', 'A'])
  })

  it('otro usuario no puede tocar bloques ajenos', async () => {
    const { t, id } = await bioPage()
    const block = listBlocks(t.deps.db, id)[0]!
    await seedUser(t, 'beto@example.com')
    const b = await loginAgent(t, 'beto@example.com')
    expect((await b.get(`/panel/blocks/${block.id}`)).statusCode).toBe(404)
    expect((await b.post(`/panel/blocks/${block.id}/delete`)).statusCode).toBe(404)
    expect((await b.get(`/panel/links/${id}/blocks`)).statusCode).toBe(404)
    expect((await b.postJson(`/panel/links/${id}/blocks/order`, { ids: [block.id] })).statusCode).toBe(404)
  })

  it('guarda el diseño y lo aplica', async () => {
    const { t, a, id } = await bioPage()
    await a.get(`/panel/links/${id}/design`)
    const res = await a.postMultipart(`/panel/links/${id}/design`, {
      theme: 'tinta', bg_type: 'gradient', bg_color: '#112233', bg_color2: '#445566', bg_angle: '90',
      font: 'serif', font_size: '18', btn_radius: '0', btn_bg: '#ff0000', btn_text__theme: '1', btn_text: '#000000',
      text_color__theme: '1', btn_border_color__theme: '1', btn_border_width: '', btn_border_style: 'dashed', btn_shadow: 'hard',
      width: 'wide', spacing: 'relaxed', align: 'left', animation: 'pop', hover: 'grow',
      announce_text: 'Nuevo curso', announce_url: 'curso.mx', announce_bg: '#000000', announce_color: '#ffffff', announce_position: 'top',
      seo_title: 'Ana en tubio', seo_description: 'Diseñadora', share_button: '1', show_branding: '1',
    })
    expect(res.statusCode, res.body.slice(0, 400)).toBe(303)
    const page = (await new Agent(t.app).get('/ana', UA)).body
    expect(page).toContain('linear-gradient(90deg, #112233, #445566)')
    expect(page).toContain('--btn-bg:#ff0000')
    expect(page).toContain('--btn-r:0px')
    expect(page).toContain('<title>Ana en tubio</title>')
    expect(page).toContain('<a href="https://curso.mx/">Nuevo curso</a>')
    expect(page).toContain('class="bio al-left anim-pop hov-grow"')
    const bad = await a.postMultipart(`/panel/links/${id}/design`, { theme: 'tinta', leap_url: 'javascript:alert(1)' })
    expect(bad.statusCode).toBe(422)
  })

  it('enlace salto redirige a visitantes, no a la vista previa del dueño', async () => {
    const { t, a, id } = await bioPage()
    await a.get(`/panel/links/${id}/design`)
    await a.postMultipart(`/panel/links/${id}/design`, { theme: 'nube', leap_url: 'https://lanzamiento.mx', share_button: '1', show_branding: '1' })
    expect((await new Agent(t.app).get('/ana', UA)).headers.location).toBe('https://lanzamiento.mx/')
    const prev = await a.get('/ana?_preview=1', UA)
    expect(prev.statusCode).toBe(200)
    expect(prev.headers['x-frame-options']).toBe('SAMEORIGIN')
  })

  it('bloque programado no aparece fuera de su ventana', async () => {
    const { t, a, id } = await bioPage()
    await a.postMultipart(`/panel/links/${id}/blocks?type=link`, { label: 'Promo', url: 'https://a.mx', is_enabled: '1', starts_at: '2026-10-30T00:00' })
    expect((await new Agent(t.app).get('/ana', UA)).body).not.toContain('Promo')
    t.clock.now = Date.UTC(2026, 9, 31)
    expect((await new Agent(t.app).get('/ana', UA)).body).toContain('Promo')
  })
})

describe('fuentes web', () => {
  it('sirve sólo las fuentes de la lista y las declara en la página', async () => {
    const { t, a, id } = await bioPage()
    await a.get(`/panel/links/${id}/design`)
    await a.postMultipart(`/panel/links/${id}/design`, { theme: 'nube', font: 'playfair', share_button: '1', show_branding: '1' })
    const page = (await new Agent(t.app).get('/ana', UA)).body
    expect(page).toContain('@font-face{font-family:"Playfair Display Variable"')
    const f = await new Agent(t.app).get('/_/fonts/playfair-display-latin-wght-normal.woff2')
    expect(f.statusCode).toBe(200)
    expect(f.headers['content-type']).toBe('font/woff2')
    expect((await new Agent(t.app).get('/_/fonts/..%2Fpackage.json')).statusCode).toBe(404)
  })
})

describe('PWA', () => {
  it('manifiesto e íconos sólo si el dueño lo activa', async () => {
    const { t, a, id } = await bioPage()
    expect((await new Agent(t.app).get('/_/pwa/ana/manifest.webmanifest')).statusCode).toBe(404)
    await a.get(`/panel/links/${id}/design`)
    await a.postMultipart(`/panel/links/${id}/design`, { theme: 'nube', pwa: '1', share_button: '1', show_branding: '1' })
    const page = (await new Agent(t.app).get('/ana', UA)).body
    expect(page).toContain('rel="manifest" href="/_/pwa/ana/manifest.webmanifest"')
    const m = await new Agent(t.app).get('/_/pwa/ana/manifest.webmanifest')
    expect(m.json()).toMatchObject({ start_url: '/ana?utm_source=pwa', display: 'standalone' })
    const icon = await new Agent(t.app).get('/_/pwa/ana/icon-192.png')
    expect(icon.headers['content-type']).toBe('image/png')
    expect((await sharp(icon.rawPayload).metadata()).width).toBe(192)
  })
})
