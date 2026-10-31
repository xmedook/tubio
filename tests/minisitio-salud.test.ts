import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser, setPlan, type TestApp } from './helpers.ts'

async function setup(): Promise<{ t: TestApp; a: Agent; id: number }> {
  const t = await makeApp()
  const u = await seedUser(t)
  setPlan(t, u.id, 'business')
  const a = await loginAgent(t)
  await a.get('/panel/links/new?kind=bio')
  expect((await a.postMultipart('/panel/links?kind=bio', { alias: 'dra', title: 'Dra. Elena', is_enabled: '1' })).statusCode).toBe(303)
  return { t, a, id: findByAlias(t.deps.db, 'dra')!.id }
}
type Row = Record<string, string>
const rows = (name: string, list: Row[]) => {
  const f: Record<string, string> = {}
  list.forEach((r, i) => Object.entries(r).forEach(([k, v]) => (f[`${name}__${i}__${k}`] = v)))
  return f
}
const png = (c = '#336699') => sharp({ create: { width: 80, height: 80, channels: 3, background: c } }).png().toBuffer()
const add = async (a: Agent, id: number, type: string, fields: Record<string, string>, files: { field: string; filename: string; content: Buffer; type?: string }[] = []) => {
  await a.get(`/panel/links/${id}/blocks/new?type=${type}`)
  return a.postMultipart(`/panel/links/${id}/blocks?type=${type}`, { is_enabled: '1', ...fields }, files)
}

describe('Perfil profesional y línea de confianza', () => {
  it('pinta nombre, presentación en Markdown, credenciales y enlace de verificación contado', async () => {
    const { t, a, id } = await setup()
    expect((await add(a, id, 'profile', { nombre: 'Dra. Elena Ruvalcaba', especialidad: 'Cirugía plástica', bio: 'Más de **15 años** de experiencia.', enlace_verificacion: 'https://cedulaprofesional.sep.gob.mx/', texto_verificacion: 'Buscar cédula', ...rows('credenciales', [{ etiqueta: 'Cédula', valor: '7433985', nota: 'Cirugía' }, { etiqueta: 'Formación', valor: 'UNAM' }]) }, [{ field: 'foto', filename: 'f.png', content: await png(), type: 'image/png' }])).statusCode).toBe(303)
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'profile')!
    const page = (await a.get('/dra')).body
    expect(page).toContain('<h3 class="prof-n">Dra. Elena Ruvalcaba</h3>')
    expect(page).toContain('<strong>15 años</strong>')
    expect(page).toContain('<dt>Cédula</dt><dd>7433985<small>Cirugía</small></dd>')
    expect(page).toContain(`href="/_/c/${b.id}?to=verif"`)
    expect((await a.get(`/_/c/${b.id}?to=verif`)).headers.location).toBe('https://cedulaprofesional.sep.gob.mx/')
    expect((await a.get(`/_/c/${b.id}?to=otro`)).statusCode).toBe(404)
  })
  it('línea de confianza con hasta 4 frases', async () => {
    const { a, id } = await setup()
    await add(a, id, 'trust_line', rows('items', [{ texto: 'Consulta en Colima' }, { texto: 'Certificación CMCPER 2278' }]))
    const page = (await a.get('/dra')).body
    expect(page).toContain('<ul class="trust"><li>Consulta en Colima</li><li>Certificación CMCPER 2278</li></ul>')
  })
})

describe('Categorías y tarjetas con foto (imagen por fila)', () => {
  it('guarda una foto por fila, la conserva al editar sin subir otra y enlaza a página, ancla o https', async () => {
    const { t, a, id } = await setup()
    const items = rows('items', [
      { titulo: 'Rostro', sub_items: 'Rinoplastia, Blefaroplastia', enlace: 'rostro', texto_enlace: 'Ver procedimientos' },
      { titulo: 'Cuerpo', sub_items: 'Abdominoplastia', enlace: '#contacto' },
      { titulo: 'Reseñas', enlace: 'https://example.com/resenas' },
    ])
    const r = await add(a, id, 'category_grid', { titulo: 'Conoce tus opciones', ...items }, [
      { field: 'items__0__foto', filename: 'a.png', content: await png('#aa3333'), type: 'image/png' },
      { field: 'items__1__foto', filename: 'b.png', content: await png('#33aa33'), type: 'image/png' },
    ])
    expect(r.statusCode).toBe(303)
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'category_grid')!
    const its = b.data.items as { foto: string; titulo: string }[]
    expect(its[0]!.foto).toMatch(/^[\w-]+\.webp$/)
    expect(its[1]!.foto).toMatch(/^[\w-]+\.webp$/)
    expect(its[2]!.foto).toBe('')
    const page = (await a.get('/dra')).body
    expect(page).toContain('<span class="cg-n" aria-hidden="true">01</span>')
    expect(page).toContain('Rinoplastia · Blefaroplastia')
    expect(page).toContain('href="/dra/rostro"')
    expect(page).toContain('href="#contacto"')
    expect(page).toContain(`href="/_/c/${b.id}?to=2"`)
    // editar sin subir fotos: las dos que había se conservan (vienen en el campo __keep) y no se adoptan llaves ajenas
    await a.get(`/panel/blocks/${b.id}`)
    const edit = await a.postMultipart(`/panel/blocks/${b.id}`, {
      is_enabled: '1', titulo: 'Conoce tus opciones', ...items,
      items__0__foto__keep: its[0]!.foto, items__1__foto__keep: its[1]!.foto, items__2__foto__keep: 'ajena-123.webp',
    })
    expect(edit.statusCode).toBe(303)
    const after = listBlocks(t.deps.db, id).find((x) => x.type === 'category_grid')!.data.items as { foto: string }[]
    expect(after.map((x) => x.foto)).toEqual([its[0]!.foto, its[1]!.foto, ''])
    // quitar la de la primera fila
    await a.postMultipart(`/panel/blocks/${b.id}`, { is_enabled: '1', titulo: 'x', ...items, items__0__foto__keep: its[0]!.foto, items__0__foto__remove: '1', items__1__foto__keep: its[1]!.foto })
    expect((listBlocks(t.deps.db, id).find((x) => x.type === 'category_grid')!.data.items as { foto: string }[])[0]!.foto).toBe('')
  })
  it('las fotos de filas no cuentan como huérfanas (no las borra la limpieza)', async () => {
    const { t, a, id } = await setup()
    await add(a, id, 'photo_cards', rows('items', [{ titulo: 'Facial', antetitulo: 'Estética', enlace: 'facial' }]), [{ field: 'items__0__foto', filename: 'a.png', content: await png(), type: 'image/png' }])
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'photo_cards')!
    const key = (b.data.items as { foto: string }[])[0]!.foto
    const { imageKeysInUse } = await import('../src/modules/bio/repo.ts')
    const userId = t.deps.db.prepare('SELECT user_id FROM links WHERE id = ?').pluck().get(id) as number
    expect(imageKeysInUse(t.deps.db, userId).has(key)).toBe(true)
    expect((await a.get('/dra')).body).toContain('class="pc" href="/dra/facial"')
  })
})

describe('Carrusel de videos', () => {
  it('YouTube con póster, mp4 directo, permite el origen del iframe y descarta lo que no se reconoce', async () => {
    const { a, id } = await setup()
    await add(a, id, 'video_carousel', {
      titulo: 'Testimonios',
      ...rows('items', [
        { video: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', titulo: 'Rinoplastia', categoria: 'Rostro', cta_texto: 'Agendar', cta_enlace: '#contacto' },
        { video: 'https://cdn.example.com/clip.mp4', titulo: 'Clínica' },
        { video: 'https://example.com/pagina-cualquiera', titulo: 'No es video' },
      ]),
    })
    const res = await a.get('/dra')
    const page = res.body
    expect(page).toContain('data-kind="embed"')
    expect(page).toContain('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(page).toContain('data-kind="file" data-src="https://cdn.example.com/clip.mp4"')
    expect(page).not.toContain('No es video')
    expect(page).toContain('href="#contacto">Agendar →')
    expect(res.headers['content-security-policy']).toContain('frame-src https://www.youtube-nocookie.com')
    expect(page).toContain('/_/static/js/salud.js')
  })
})

describe('Menú con foto por platillo', () => {
  it('muestra la foto del platillo', async () => {
    const { a, id } = await setup()
    await add(a, id, 'menu', rows('items', [{ categoria: 'Comida', nombre: 'Pozole', precio: '$110', disponible: 'si' }]), [{ field: 'items__0__foto', filename: 'p.png', content: await png(), type: 'image/png' }])
    expect((await a.get('/dra')).body).toMatch(/<img class="mnu-img" src="\/_\/u\/[\w-]+\.webp"/)
  })
})
