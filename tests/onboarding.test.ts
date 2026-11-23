import { describe, expect, it } from 'vitest'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, makeApp, type TestApp } from './helpers.ts'

async function signup(t: TestApp, email = 'dueno@example.com'): Promise<Agent> {
  const v = new Agent(t.app)
  await v.get('/register')
  await v.post('/register', { email, accept: '1', name: 'Dueño' })
  return v
}

/** Llega hasta «tu liga ya existe» con el objetivo dado */
async function crear(t: TestApp, v: Agent, alias = 'mi-liga', goal = 'creador') {
  await v.get('/panel/onboarding')
  const r1 = await v.post('/panel/onboarding', { alias })
  expect(r1.headers.location).toBe(`/panel/onboarding/objetivo?alias=${alias}`)
  await v.get(String(r1.headers.location))
  const r2 = await v.post('/panel/onboarding/objetivo', { alias, goal })
  return { r2, link: findByAlias(t.deps.db, alias) }
}

describe('onboarding guiado', () => {
  it('registrarse lleva al paso 1 y el alias reclamado llega prellenado', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    await v.get('/register')
    const r = await v.post('/register', { email: 'a@example.com', accept: '1', claim: 'cafe-norte' })
    expect(r.headers.location).toBe('/panel/onboarding?alias=cafe-norte')
    const page = await v.get(String(r.headers.location))
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('value="cafe-norte"')
    expect(page.body).toContain('Elige tu usuario')
  })

  it('paso 1: sugerencias libres, disponibilidad en JSON y rechazo de alias ocupados o inválidos', async () => {
    const t = await makeApp()
    const v = await signup(t)
    const page = await v.get('/panel/onboarding')
    expect(page.body).toContain('data-ob-sug=')
    const ok = (await v.get('/panel/onboarding/alias?alias=Mi%20Liga')).json()
    expect(ok).toMatchObject({ alias: 'mi-liga', ok: true })
    expect((await v.get('/panel/onboarding/alias?alias=panel')).json()).toMatchObject({ ok: false })
    await crear(t, v, 'ya-existe')
    const w = await signup(t, 'otra@example.com')
    expect((await w.get('/panel/onboarding/alias?alias=ya-existe')).json()).toMatchObject({ ok: false })
    await w.get('/panel/onboarding')
    const bad = await w.post('/panel/onboarding', { alias: 'ya-existe' })
    expect(bad.statusCode).toBe(422)
    expect(bad.body).toContain('Ese alias ya está ocupado')
    expect((await w.post('/panel/onboarding', { alias: 'x' })).statusCode).toBe(422)
  })

  it('paso 2: negocio sigue por el asistente de sitio; creador y personal crean la liga con su tema', async () => {
    const t = await makeApp()
    const v = await signup(t)
    await v.get('/panel/onboarding/objetivo?alias=mi-negocio')
    const neg = await v.post('/panel/onboarding/objetivo', { alias: 'mi-negocio', goal: 'negocio' })
    expect(neg.headers.location).toBe('/panel/start?alias=mi-negocio')
    expect(findByAlias(t.deps.db, 'mi-negocio')).toBeUndefined()
    const { r2, link } = await crear(t, v, 'mi-canal', 'creador')
    expect(link).toBeTruthy()
    expect(r2.headers.location).toBe(`/panel/onboarding/listo?id=${link!.id}`)
    expect(link!.data.theme).toBe('neon')
    expect(listBlocks(t.deps.db, link!.id).map((b) => b.type)).toEqual(['heading'])
    // el plan gratis admite una página bio: otra persona prueba «personal»
    const w = await signup(t, 'otra-persona@example.com')
    const { link: p } = await crear(t, w, 'mi-perfil', 'personal')
    expect(p!.data.theme).toBe('nube')
    expect((await v.post('/panel/onboarding/objetivo', { alias: 'otro-alias', goal: 'xx' })).statusCode).toBe(422)
  })

  it('«tu liga ya existe» muestra la URL y sigue al guiado', async () => {
    const t = await makeApp()
    const v = await signup(t)
    const { link } = await crear(t, v)
    const page = await v.get(`/panel/onboarding/listo?id=${link!.id}`)
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('tubio.test/mi-liga')
    expect(page.body).toContain(`/panel/onboarding/tema?id=${link!.id}`)
  })

  it('guiado: tema, redes con @usuario, links, perfil y celebración; todo queda guardado', async () => {
    const t = await makeApp()
    const v = await signup(t)
    const { link } = await crear(t, v)
    const id = link!.id
    // 1/4 tema
    expect((await v.get(`/panel/onboarding/tema?id=${id}`)).body).toContain('aria-valuenow="1"')
    await v.post(`/panel/onboarding/tema?id=${id}`, { theme: 'gala' })
    expect(findByAlias(t.deps.db, 'mi-liga')!.data.theme).toBe('gala')
    await v.post(`/panel/onboarding/tema?id=${id}`, { theme: 'no-existe' })
    expect(findByAlias(t.deps.db, 'mi-liga')!.data.theme).toBe('gala')
    // 2/4 redes → 3/4 links (acepta @usuario)
    expect((await v.get(`/panel/onboarding/redes?id=${id}`)).body).toContain('name="n" value="instagram"')
    const form = await v.get(`/panel/onboarding/links?id=${id}&n=instagram&n=tiktok`)
    expect(form.body).toContain('name="s_instagram"')
    const bad = await v.post(`/panel/onboarding/links?id=${id}`, { n: ['instagram'], s_instagram: 'esto no es una red social @@ ###' })
    expect(bad.statusCode).toBe(422)
    const ok = await v.post(`/panel/onboarding/links?id=${id}`, { n: ['instagram', 'tiktok'], s_instagram: '@mi.canal', s_tiktok: '', x1: 'https://ejemplo.com/tienda', x2: '' })
    expect(ok.headers.location).toBe(`/panel/onboarding/perfil?id=${id}`)
    const blocks = listBlocks(t.deps.db, id)
    const soc = blocks.find((b) => b.type === 'socials')!
    expect(soc.data.links).toEqual({ instagram: 'https://instagram.com/mi.canal' })
    expect(blocks.find((b) => b.type === 'link')!.data.url).toBe('https://ejemplo.com/tienda')
    // 4/4 perfil
    const pf = await v.postMultipart(`/panel/onboarding/perfil?id=${id}`, { name: 'Mi Canal', bio: 'Videos de cocina fácil' })
    expect(pf.headers.location).toBe(`/panel/onboarding/vivo?id=${id}`)
    const after = listBlocks(t.deps.db, id)
    expect(after.map((b) => b.type)).toEqual(['heading', 'paragraph', 'socials', 'link'])
    expect(after[0]!.data.text).toBe('Mi Canal')
    expect(after[1]!.data.text).toBe('Videos de cocina fácil')
    expect(findByAlias(t.deps.db, 'mi-liga')!.title).toBe('Mi Canal')
    // celebración: la página pública ya muestra todo
    const live = await v.get(`/panel/onboarding/vivo?id=${id}`)
    expect(live.statusCode).toBe(200)
    expect(live.body).toContain('ob-confetti')
    expect(live.body).toContain('<iframe')
    const pub = await v.get('/mi-liga')
    expect(pub.statusCode).toBe(200)
    expect(pub.body).toContain('Mi Canal')
  })

  it('el nombre del perfil es obligatorio y un paso se puede omitir sin romper nada', async () => {
    const t = await makeApp()
    const v = await signup(t)
    const { link } = await crear(t, v)
    const empty = await v.postMultipart(`/panel/onboarding/perfil?id=${link!.id}`, { name: '', bio: '' })
    expect(empty.statusCode).toBe(422)
    expect((await v.get(`/panel/onboarding/vivo?id=${link!.id}`)).statusCode).toBe(200)
  })

  it('nadie toca la liga de otra persona', async () => {
    const t = await makeApp()
    const v = await signup(t)
    const { link } = await crear(t, v)
    const w = await signup(t, 'intruso@example.com')
    for (const p of ['listo', 'tema', 'redes', 'links', 'perfil', 'vivo']) {
      const r = await w.get(`/panel/onboarding/${p}?id=${link!.id}`)
      expect(r.statusCode, p).toBe(303)
      expect(r.headers.location, p).toBe('/panel')
    }
    await w.post(`/panel/onboarding/tema?id=${link!.id}`, { theme: 'gala' })
    expect(findByAlias(t.deps.db, 'mi-liga')!.data.theme).toBe('neon')
  })

  it('sin sesión pide iniciar sesión', async () => {
    const t = await makeApp()
    const v = new Agent(t.app)
    expect([301, 302, 303, 401]).toContain((await v.get('/panel/onboarding')).statusCode)
  })
})
