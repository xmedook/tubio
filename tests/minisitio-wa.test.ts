import { describe, expect, it } from 'vitest'
import { compose } from '../public/js/wa-compose.js'
import { waKeys } from '../src/modules/bio/wa-request.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { saveSiteConfig } from '../src/modules/minisitio/repo.ts'
import { readSite } from '../src/modules/minisitio/schema.ts'
import { Agent, loginAgent, makeApp, seedUser, setPlan, type TestApp } from './helpers.ts'

async function setup(): Promise<{ t: TestApp; a: Agent; id: number }> {
  const t = await makeApp()
  const u = await seedUser(t)
  setPlan(t, u.id, 'business')
  const a = await loginAgent(t)
  await a.get('/panel/links/new?kind=bio')
  expect((await a.postMultipart('/panel/links?kind=bio', { alias: 'spa', title: 'Spa Luna', is_enabled: '1' })).statusCode).toBe(303)
  return { t, a, id: findByAlias(t.deps.db, 'spa')!.id }
}

const add = async (a: Agent, id: number, f: Record<string, string>) => {
  await a.get(`/panel/links/${id}/blocks/new?type=wa_request`)
  return a.postMultipart(`/panel/links/${id}/blocks?type=wa_request`, { is_enabled: '1', guardar_copia: '1', ...f })
}

/** Visitante anónimo con su cookie y token CSRF (como un navegador que abrió la página) */
async function visitor(t: TestApp, path = '/spa'): Promise<Agent> {
  const v = new Agent(t.app)
  const res = await v.get(path)
  v.csrf = /data-csrf="([^"]+)"/.exec(res.body)?.[1] ?? ''
  expect(v.csrf).not.toBe('')
  return v
}

describe('compose (plantilla → mensaje)', () => {
  it('rellena variables y descarta frases con todas sus variables vacías', () => {
    const tpl = 'Hola {negocio}, quiero agendar {servicio} el {fecha}. Soy {nombre}. Ocasión: {ocasion}.'
    expect(compose(tpl, { servicio: 'Facial', fecha: 'lunes 3 de noviembre', nombre: 'Ana' }, { negocio: 'Spa Luna' })).toBe('Hola Spa Luna, quiero agendar Facial el lunes 3 de noviembre. Soy Ana.')
  })
  it('respeta saltos de línea y limpia espacios antes de la puntuación', () => {
    expect(compose('Pedido:\n{pedido}\nNombre: {nombre} .', { nombre: 'Luis' }, { pedido: '' })).toBe('Pedido:\nNombre: Luis.')
  })
  it('sin plantilla útil devuelve vacío', () => {
    expect(compose('{a} {b}', {}, {})).toBe('')
  })
})

describe('bloque Solicitud por WhatsApp', () => {
  it('pinta botón, hoja con campos del preset y enlace de respaldo con el número del sitio', async () => {
    const { t, a, id } = await setup()
    saveSiteConfig(t.deps.db, id, readSite({ whatsapp: '5213121234567' }), t.clock.now)
    expect((await add(a, id, { preset: 'cita' })).statusCode).toBe(303)
    const page = (await a.get('/spa')).body
    expect(page).toContain('data-wa-open')
    expect(page).toContain('href="https://wa.me/5213121234567?text=Hola%20Spa%20Luna"')
    expect(page).toContain('data-num="5213121234567"')
    expect(page).toContain('<dialog class="wa-sheet"')
    for (const k of ['servicio', 'fecha', 'franja', 'nombre', 'primera_vez']) expect(page).toContain(`name="${k}"`)
    expect(page).toContain('data-tpl="Hola {negocio}, quiero agendar {servicio}')
    expect(page).toContain('Esto es una solicitud, no una reserva confirmada')
    expect(page).toContain('/_/static/js/wa.js')
    expect(page).toMatch(/data-save="1"/)
  })
  it('número propio gana al del sitio; sin ningún número no pinta nada', async () => {
    const { t, a, id } = await setup()
    expect((await add(a, id, { preset: 'libre' })).statusCode).toBe(303)
    expect((await a.get('/spa')).body).not.toContain('data-wa-open') // sin número en ninguna parte
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'wa_request')!
    await a.get(`/panel/blocks/${b.id}`)
    expect((await a.postMultipart(`/panel/blocks/${b.id}`, { is_enabled: '1', preset: 'libre', numero: '+52 312 000 1111', guardar_copia: '1' })).statusCode).toBe(303)
    expect((await a.get('/spa')).body).toContain('data-num="523120001111"')
  })
  it('preguntas propias reemplazan a las del preset y fijan las claves', async () => {
    const { t, a, id } = await setup()
    saveSiteConfig(t.deps.db, id, readSite({ whatsapp: '5213121234567' }), t.clock.now)
    expect(
      (await add(a, id, { preset: 'cotizacion', campos__0__etiqueta: 'Tipo de evento', campos__0__tipo: 'uno', campos__0__requerido: 'si', campos__0__opciones: 'Boda, XV años, Corporativo', campos__1__etiqueta: 'Invitados', campos__1__tipo: 'numero', campos__1__requerido: 'no', plantilla: 'Quiero cotizar {tipo_de_evento} para {invitados} invitados.' })).statusCode,
    ).toBe(303)
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'wa_request')!
    expect(waKeys(b)).toEqual(['tipo_de_evento', 'invitados'])
    const page = (await a.get('/spa')).body
    expect(page).toContain('name="tipo_de_evento" value="Boda"')
    expect(page).toContain('name="invitados"')
    expect(page).not.toContain('name="nombre"')
    expect(page).toContain('data-tpl="Quiero cotizar {tipo_de_evento} para {invitados} invitados."')
  })
})

describe('envío y medición', () => {
  async function conBloque() {
    const ctx = await setup()
    saveSiteConfig(ctx.t.deps.db, ctx.id, readSite({ whatsapp: '5213121234567' }), ctx.t.clock.now)
    await add(ctx.a, ctx.id, { preset: 'cita' })
    const b = listBlocks(ctx.t.deps.db, ctx.id).find((x) => x.type === 'wa_request')!
    return { ...ctx, b }
  }
  const stats = (t: TestApp, id: number) => t.deps.db.prepare('SELECT COALESCE(SUM(opens),0) o, COALESCE(SUM(sends),0) s, COALESCE(SUM(abandons),0) a FROM wa_stats WHERE block_id = ?').get(id) as { o: number; s: number; a: number }

  it('cuenta aperturas, envíos y abandonos; guarda la solicitud y avisa en la bandeja', async () => {
    const { t, a, id, b } = await conBloque()
    const v = await visitor(t)
    expect((await v.postJson(`/_/wa/${b.id}`, { ev: 'open' })).statusCode).toBe(204)
    expect((await v.postJson(`/_/wa/${b.id}`, { ev: 'abandon', touched: true })).statusCode).toBe(204)
    const r = await v.postJson(`/_/wa/${b.id}`, { ev: 'send', fields: { nombre: 'Ana', servicio: 'Facial', fecha: 'lunes', hackeado: 'x'.repeat(50) }, message: 'Hola Spa Luna, quiero agendar Facial. Soy Ana.' })
    expect(r.statusCode).toBe(204)
    expect(stats(t, b.id)).toEqual({ o: 1, s: 1, a: 1 })
    const row = t.deps.db.prepare("SELECT kind, data FROM collected WHERE block_id = ?").get(b.id) as { kind: string; data: string }
    expect(row.kind).toBe('whatsapp')
    const d = JSON.parse(row.data)
    expect(d.name).toBe('Ana')
    expect(d.message).toContain('quiero agendar Facial')
    expect(d.fields).toEqual({ nombre: 'Ana', servicio: 'Facial', fecha: 'lunes' }) // la clave ajena se descarta
    const inbox = await a.get('/panel/data')
    expect(inbox.body).toContain('quiero agendar Facial')
    expect((await a.get('/panel/data?kind=whatsapp')).statusCode).toBe(200)
    expect((await a.get(`/panel/blocks/${b.id}`)).body).toContain('1 aperturas')
    void id
  })
  it('un doble toque en menos de un minuto no duplica la solicitud', async () => {
    const { t, b } = await conBloque()
    const v = await visitor(t)
    const body = { ev: 'send', fields: { nombre: 'Luis' }, message: 'Hola. Soy Luis.' }
    await v.postJson(`/_/wa/${b.id}`, body)
    await v.postJson(`/_/wa/${b.id}`, body)
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM collected WHERE block_id = ?').pluck().get(b.id)).toBe(1)
  })
  it('sin guardar copia sólo mide', async () => {
    const { t, a, id } = await setup()
    saveSiteConfig(t.deps.db, id, readSite({ whatsapp: '5213121234567' }), t.clock.now)
    await a.get(`/panel/links/${id}/blocks/new?type=wa_request`)
    await a.postMultipart(`/panel/links/${id}/blocks?type=wa_request`, { is_enabled: '1', preset: 'libre' }) // sin guardar_copia
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'wa_request')!
    const v = await visitor(t)
    await v.postJson(`/_/wa/${b.id}`, { ev: 'send', fields: { nombre: 'Eva' }, message: 'Hola. Soy Eva.' })
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM collected WHERE block_id = ?').pluck().get(b.id)).toBe(0)
    expect(stats(t, b.id).s).toBe(1)
  })
  it('exige token CSRF, rechaza eventos raros y bloques ajenos', async () => {
    const { t, a, b } = await conBloque()
    const v = await visitor(t)
    const sin = await t.app.inject({ method: 'POST', url: `/_/wa/${b.id}`, payload: JSON.stringify({ ev: 'open' }), headers: { 'content-type': 'application/json', cookie: [...v.cookies].map(([k, x]) => `${k}=${x}`).join('; ') } })
    expect(sin.statusCode).toBe(403)
    expect((await v.postJson(`/_/wa/${b.id}`, { ev: 'borrar' })).statusCode).toBe(422)
    expect((await v.postJson('/_/wa/999999', { ev: 'open' })).statusCode).toBe(404)
    // las pruebas del dueño no son estadística
    await a.postJson(`/_/wa/${b.id}`, { ev: 'open' })
    expect(stats(t, b.id).o).toBe(0)
  })
})
