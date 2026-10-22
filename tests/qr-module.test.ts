import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { readBarcodes } from 'zxing-wasm/reader'
import { buildPayload } from '../src/modules/qr/payload.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { loginAgent, makeApp, seedUser } from './helpers.ts'

async function decodePng(buf: Buffer): Promise<string | null> {
  const r = await readBarcodes(new Blob([new Uint8Array(buf)]), { formats: ['QRCode'] })
  return r[0]?.text ?? null
}

describe('contenido de QR', () => {
  it('arma cada tipo', () => {
    const ok = (k: Parameters<typeof buildPayload>[0], v: Record<string, string>) => {
      const r = buildPayload(k, v)
      if (!r.ok) throw new Error(JSON.stringify(r.errors))
      return r.text
    }
    expect(ok('wifi', { ssid: 'Casa;1', encryption: 'WPA', password: 'p:a"s' })).toBe(String.raw`WIFI:T:WPA;S:Casa\;1;P:p\:a\"s;;`)
    expect(ok('wifi', { ssid: 'Libre', encryption: 'nopass', hidden: '1' })).toBe('WIFI:T:nopass;S:Libre;H:true;;')
    expect(ok('email', { email: 'a@b.mx', subject: 'Hola tú' })).toBe('mailto:a@b.mx?subject=Hola%20t%C3%BA')
    expect(ok('whatsapp', { phone: '+52 1 55 1234 5678', message: 'hola' })).toBe('https://wa.me/5215512345678?text=hola')
    expect(ok('sms', { phone: '5512345678', message: 'x' })).toBe('SMSTO:5512345678:x')
    expect(ok('location', { lat: '19.4326', lng: '-99.1332' })).toBe('geo:19.4326,-99.1332')
    expect(ok('vcard', { first_name: 'Ana' })).toContain('FN:Ana')
    expect(buildPayload('url', { url: 'javascript:alert(1)' }).ok).toBe(false)
    expect(buildPayload('location', { lat: '200', lng: '0' }).ok).toBe(false)
  })
})

describe('módulo QR', () => {
  it('QR dinámico de un enlace: sigue la dirección del enlace y se descarga legible', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'menu', target_url: 'https://restaurante.mx/menu', is_enabled: '1' })
    const link = findByAlias(t.deps.db, 'menu')!
    const form = await a.get(`/panel/qr/new?link=${link.id}`)
    expect(form.body).toContain(`<option value="${link.id}" selected>`)
    const res = await a.postMultipart('/panel/qr?kind=link', { name: 'Menú mesa', link_id: String(link.id), modules: 'dot', eyeOuter: 'circle', eyeInner: 'circle', fg: '#1d4ed8', eyeColor__same: '1' })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(303)
    const id = Number(/\/panel\/qr\/(\d+)/.exec(res.headers.location as string)![1])
    const png = await a.get(`/panel/qr/${id}/download.png`)
    expect(png.headers['content-type']).toBe('image/png')
    expect(png.headers['content-disposition']).toContain('menu-mesa.png')
    expect(await decodePng(png.rawPayload)).toBe('http://tubio.test/menu')
    const svg = await a.get(`/panel/qr/${id}/download.svg?inline=1`)
    expect(svg.headers['content-type']).toContain('image/svg+xml')
    expect(svg.headers['content-disposition']).toBeUndefined()
    for (const f of ['jpg', 'webp']) expect((await a.get(`/panel/qr/${id}/download.${f}`)).statusCode).toBe(200)
    expect((await a.get('/panel/qr')).body).toContain('Menú mesa')
  })

  it('QR de Wi‑Fi con logo; vista previa no guarda nada', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/qr/new?kind=wifi')
    const logo = await sharp({ create: { width: 80, height: 80, channels: 3, background: '#e11d48' } }).png().toBuffer()
    const prev = await a.postMultipart('/panel/qr/preview?kind=wifi', { ssid: 'Oficina', encryption: 'WPA', password: 'secreta123', ecc: 'H' }, [{ field: 'logo', filename: 'l.png', content: logo, type: 'image/png' }])
    expect(prev.statusCode).toBe(200)
    expect(prev.body).toContain('<image')
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM files').pluck().get()).toBe(0)
    const bad = await a.postMultipart('/panel/qr/preview?kind=wifi', { ssid: '', encryption: 'WPA' })
    expect(bad.statusCode).toBe(422)
    const res = await a.postMultipart('/panel/qr?kind=wifi', { name: 'Wifi oficina', ssid: 'Oficina', encryption: 'WPA', password: 'secreta123', ecc: 'H', logoSize: '20' }, [{ field: 'logo', filename: 'l.png', content: logo, type: 'image/png' }])
    expect(res.statusCode).toBe(303)
    const id = Number(/\/panel\/qr\/(\d+)/.exec(res.headers.location as string)![1])
    const png = await a.get(`/panel/qr/${id}/download.png`)
    expect(await decodePng(png.rawPayload)).toBe('WIFI:T:WPA;S:Oficina;P:secreta123;;')
  })

  it('no se ven QR ajenos ni enlaces ajenos en un QR dinámico', async () => {
    const t = await makeApp()
    await seedUser(t)
    await seedUser(t, 'beto@example.com')
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'deana', target_url: 'https://a.mx', is_enabled: '1' })
    const res = await a.postMultipart('/panel/qr?kind=url', { name: 'Web', url: 'ana.mx' })
    const id = Number(/\/panel\/qr\/(\d+)/.exec(res.headers.location as string)![1])
    const b = await loginAgent(t, 'beto@example.com')
    expect((await b.get(`/panel/qr/${id}`)).statusCode).toBe(404)
    expect((await b.get(`/panel/qr/${id}/download.png`)).statusCode).toBe(404)
    const linkId = findByAlias(t.deps.db, 'deana')!.id
    await b.get('/panel/qr/new?kind=link')
    expect((await b.postMultipart('/panel/qr?kind=link', { name: 'robado', link_id: String(linkId) })).statusCode).toBe(422)
  })

  it('edita y borra', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/qr/new?kind=text')
    const res = await a.postMultipart('/panel/qr?kind=text', { name: 'Nota', text: 'hola' })
    const id = Number(/\/panel\/qr\/(\d+)/.exec(res.headers.location as string)![1])
    await a.get(`/panel/qr/${id}`)
    expect((await a.postMultipart(`/panel/qr/${id}`, { name: 'Nota 2', text: 'adiós', frame: 'label', frameText: 'Escanéame' })).statusCode).toBe(303)
    expect(await decodePng((await a.get(`/panel/qr/${id}/download.png`)).rawPayload)).toBe('adiós')
    await a.post(`/panel/qr/${id}/delete`)
    expect((await a.get(`/panel/qr/${id}`)).statusCode).toBe(404)
  })
})

describe('QR: evento, cripto y PayPal', () => {
  it('arma el contenido', () => {
    const ev = buildPayload('event', { name: 'Expo, 2026', start: '2026-11-15 18:00', end: '2026-11-15 20:00', location: 'GDL' })
    expect(ev.ok && ev.text).toContain('DTSTART:20261115T180000')
    expect(ev.ok && ev.text).toContain('SUMMARY:Expo\\, 2026')
    expect(buildPayload('event', { name: 'x', start: 'mañana' }).ok).toBe(false)
    const btc = buildPayload('crypto', { coin: 'bitcoin', address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amount: '0.01' })
    expect(btc.ok && btc.text).toBe('bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.01')
    expect(buildPayload('crypto', { coin: 'ethereum', address: '0x123' }).ok).toBe(false)
    const pp = buildPayload('paypal', { user: 'ana', amount: '100', currency: 'MXN' })
    expect(pp.ok && pp.text).toBe('https://paypal.me/ana/100MXN')
  })
})
