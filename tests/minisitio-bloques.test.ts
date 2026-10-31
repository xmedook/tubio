import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { ensureSite, saveSiteConfig, loadSite } from '../src/modules/minisitio/repo.ts'
import { readSite } from '../src/modules/minisitio/schema.ts'
import { Agent, loginAgent, makeApp, seedUser, setPlan, type TestApp } from './helpers.ts'

async function setup(): Promise<{ t: TestApp; a: Agent; id: number }> {
  const t = await makeApp()
  const u = await seedUser(t)
  setPlan(t, u.id, 'business')
  const a = await loginAgent(t)
  await a.get('/panel/links/new?kind=bio')
  expect((await a.postMultipart('/panel/links?kind=bio', { alias: 'sol', title: 'Sol', is_enabled: '1' })).statusCode).toBe(303)
  return { t, a, id: findByAlias(t.deps.db, 'sol')!.id }
}

const rowsOf = (list: Record<string, string>[]) => {
  const f: Record<string, string> = { is_enabled: '1' }
  list.forEach((r, i) => Object.entries(r).forEach(([k, v]) => (f[`acciones__${i}__${k}`] = v)))
  return f
}
const png = () => sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } }).png().toBuffer()
/** cabecera mínima de un mp4 (caja ftyp) seguida de relleno */
const mp4 = (size: number) => {
  const b = Buffer.alloc(size)
  Buffer.from('0000001c667479706d703432000000006d70343269736f6d', 'hex').copy(b)
  return b
}

describe('panel de acciones', () => {
  it('guarda, pinta y resuelve clics (WhatsApp usa el número del sitio)', async () => {
    const { t, a, id } = await setup()
    saveSiteConfig(t.deps.db, id, readSite({ whatsapp: '5213121234567' }), t.clock.now)
    await a.get(`/panel/links/${id}/blocks/new?type=action_panel`)
    const res = await a.postMultipart(`/panel/links/${id}/blocks?type=action_panel`, {
      disposicion: 'principal',
      ...rowsOf([
        { etiqueta: 'Pedido', titulo: 'Pedir por WhatsApp', subtitulo: 'Respondemos al momento', tipo: 'whatsapp', destino: '', mensaje: 'Quiero pedir', principal: 'si' },
        { titulo: 'Llamar', tipo: 'llamar', destino: '+52 312 000 0000' },
        { titulo: 'Uber Eats', tipo: 'enlace', destino: 'https://www.ubereats.com/mx/store/x', principal: 'no' },
        { titulo: 'Ver menú', tipo: 'pagina', destino: 'menu' },
        { titulo: 'Ubicación', tipo: 'ancla', destino: '#donde' },
      ]),
    })
    expect(res.statusCode).toBe(303)
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'action_panel')!
    const html = (await a.get('/sol')).body
    expect(html).toContain('class="apanel d-principal"')
    expect(html).toContain(`href="/_/c/${b.id}?to=0"`)
    expect(html).toContain('href="tel:+523120000000"')
    expect(html).toContain('href="/sol/menu"')
    expect(html).toContain('href="#donde"')
    expect(html).toContain('<small class="act-k">Pedido</small>')
    const wa = await a.get(`/_/c/${b.id}?to=0`)
    expect(wa.statusCode).toBe(302)
    expect(wa.headers.location).toBe('https://wa.me/5213121234567?text=Quiero%20pedir')
    expect((await a.get(`/_/c/${b.id}?to=2`)).headers.location).toBe('https://www.ubereats.com/mx/store/x')
    expect((await a.get(`/_/c/${b.id}?to=9`)).statusCode).toBe(404)
  })
  it('rechaza acciones con destino inválido o sin acciones', async () => {
    const { a, id } = await setup()
    await a.get(`/panel/links/${id}/blocks/new?type=action_panel`)
    const bad = await a.postMultipart(`/panel/links/${id}/blocks?type=action_panel`, rowsOf([{ titulo: 'X', tipo: 'enlace', destino: 'javascript:alert(1)' }]))
    expect(bad.statusCode).toBe(422)
    const none = await a.postMultipart(`/panel/links/${id}/blocks?type=action_panel`, { is_enabled: '1' })
    expect(none.statusCode).toBe(422)
    const phone = await a.postMultipart(`/panel/links/${id}/blocks?type=action_panel`, rowsOf([{ titulo: 'X', tipo: 'llamar', destino: '12' }]))
    expect(phone.statusCode).toBe(422)
  })
})

describe('ubicación', () => {
  it('muestra horarios y manda a Google, Apple, Waze y «cómo llegar»', async () => {
    const { t, a, id } = await setup()
    await a.get(`/panel/links/${id}/blocks/new?type=location`)
    const res = await a.postMultipart(`/panel/links/${id}/blocks?type=location`, {
      is_enabled: '1', nombre_lugar: 'Clínica Sol', direccion: 'Av. Ejemplo 123, Colima', lat: '19.2433', lng: '-103.725',
      referencias: 'Frente al parque', estacionamiento: 'Gratuito', timezone: 'America/Mexico_City',
      horario__0__day: 'mon', horario__0__open: '09:00', horario__0__close: '19:00',
    })
    expect(res.statusCode).toBe(303)
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'location')!
    const page = await a.get('/sol')
    expect(page.body).toContain('Av. Ejemplo 123, Colima')
    expect(page.body).toContain('09:00–19:00')
    expect(page.body).toContain(`/_/c/${b.id}?to=waze`)
    expect(page.headers['content-security-policy']).toContain('frame-src https://www.google.com')
    const loc = async (to: string) => (await a.get(`/_/c/${b.id}?to=${to}`)).headers.location
    expect(await loc('google')).toBe('https://www.google.com/maps/search/?api=1&query=19.2433%2C-103.725')
    expect(await loc('dir')).toBe('https://www.google.com/maps/dir/?api=1&destination=19.2433%2C-103.725')
    expect(await loc('apple')).toBe('https://maps.apple.com/?ll=19.2433,-103.725&q=Cl%C3%ADnica%20Sol')
    expect(await loc('waze')).toBe('https://waze.com/ul?ll=19.2433,-103.725&navigate=yes')
    expect((await a.get(`/_/c/${b.id}?to=otro`)).statusCode).toBe(404)
  })
  it('sin coordenadas busca por dirección; coordenadas a medias son error', async () => {
    const { t, a, id } = await setup()
    await a.get(`/panel/links/${id}/blocks/new?type=location`)
    const half = await a.postMultipart(`/panel/links/${id}/blocks?type=location`, { is_enabled: '1', direccion: 'Calle 1', lat: '19.2' })
    expect(half.statusCode).toBe(422)
    await a.postMultipart(`/panel/links/${id}/blocks?type=location`, { is_enabled: '1', direccion: 'Calle 1, Colima', timezone: 'America/Mexico_City' })
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'location')!
    expect((await a.get(`/_/c/${b.id}?to=waze`)).headers.location).toBe('https://waze.com/ul?q=Calle%201%2C%20Colima&navigate=yes')
  })
})

describe('portada', () => {
  it('foto + video: póster, video por Range, h1 único y sin video en la fuente', async () => {
    const { t, a, id } = await setup()
    await a.get(`/panel/links/${id}/blocks/new?type=hero`)
    const res = await a.postMultipart(
      `/panel/links/${id}/blocks?type=hero`,
      { is_enabled: '1', antetitulo: 'Colima', titulo: 'Café de la esquina', alto: 'completa', alineacion: 'abajo', oscurecer: '50', sonido: '1' },
      [
        { field: 'foto', filename: 'f.png', content: await png(), type: 'image/png' },
        { field: 'video', filename: 'v.mp4', content: mp4(4096), type: 'video/mp4' },
      ],
    )
    expect(res.statusCode).toBe(303)
    const b = listBlocks(t.deps.db, id).find((x) => x.type === 'hero')!
    const page = (await a.get('/sol')).body
    expect(page).toContain('class="hero al-abajo alto-completa ov-5"')
    expect(page).toContain(`data-hero-src="/_/v/${b.id}"`)
    expect(page).toContain('<h1 class="hero-t">Café de la esquina</h1>')
    expect(page).toContain('poster="/_/u/')
    expect(page).not.toContain('<source') // el video se pide por JS, no en el HTML
    expect(page).toContain('data-hero-sound')
    const full = await a.get(`/_/v/${b.id}`)
    expect(full.statusCode).toBe(200)
    expect(full.headers['content-type']).toBe('video/mp4')
    expect(full.rawPayload.length).toBe(4096)
    const part = await a.get(`/_/v/${b.id}`, { range: 'bytes=0-99' })
    expect(part.statusCode).toBe(206)
    expect(part.headers['content-range']).toBe('bytes 0-99/4096')
    expect(part.rawPayload.length).toBe(100)
    expect((await a.get(`/_/v/${b.id}`, { range: 'bytes=9999-' })).statusCode).toBe(416)
  })
  it('rechaza un archivo que no es mp4/webm y uno de más de 15 MB', async () => {
    const { a, id } = await setup()
    await a.get(`/panel/links/${id}/blocks/new?type=hero`)
    const notVideo = await a.postMultipart(`/panel/links/${id}/blocks?type=hero`, { is_enabled: '1', titulo: 'X' }, [{ field: 'video', filename: 'v.mp4', content: await png(), type: 'video/mp4' }])
    expect(notVideo.statusCode).toBe(422)
    const big = await a.postMultipart(`/panel/links/${id}/blocks?type=hero`, { is_enabled: '1', titulo: 'X' }, [{ field: 'video', filename: 'v.mp4', content: mp4(15 * 1024 * 1024 + 10), type: 'video/mp4' }])
    expect(big.statusCode).toBe(422)
  })
  it('en un sitio con portada, la portada es el h1 y las secciones h2', async () => {
    const { t, a, id } = await setup()
    await a.get(`/panel/links/${id}/blocks/new?type=hero`)
    await a.postMultipart(`/panel/links/${id}/blocks?type=hero`, { is_enabled: '1', titulo: 'Portada' }, [{ field: 'foto', filename: 'f.png', content: await png(), type: 'image/png' }])
    const site = ensureSite(t.deps.db, id, t.clock.now)
    t.deps.db.prepare('UPDATE ms_sections SET data = ? WHERE id = ?').run(JSON.stringify({ titulo: 'Servicios', ancla: 'servicios' }), site.sections[0]!.id)
    saveSiteConfig(t.deps.db, id, readSite({ cabecera: { activa: true, nombre: 'Sol' } }), t.clock.now)
    expect(loadSite(t.deps.db, id).sections[0]!.data.titulo).toBe('Servicios')
    const page = (await a.get('/sol')).body
    expect(page).toContain('<h1 class="hero-t">Portada</h1>')
    expect(page).not.toContain('<h1 class="ms-h">')
    expect(page).toContain('<h2 class="ms-h">Servicios</h2>')
  })
})
