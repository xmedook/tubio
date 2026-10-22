import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildIcs } from '../src/lib/ical.ts'
import { uploadPath, findFile } from '../src/lib/uploads.ts'
import { buildVCard, foldLine, vcardSchema } from '../src/lib/vcard.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }

describe('vCard e iCalendar', () => {
  it('escapa y dobla líneas', () => {
    const v = buildVCard(vcardSchema.parse({ first_name: 'Ana', last_name: 'López; Díaz', org: 'A, B', note: 'línea1\nlínea2' }))
    expect(v).toContain('N:López\\; Díaz;Ana;;;')
    expect(v).toContain('ORG:A\\, B')
    expect(v).toContain('NOTE:línea1\\nlínea2')
    expect(v.endsWith('END:VCARD\r\n')).toBe(true)
    const long = foldLine('NOTE:' + 'á'.repeat(80))
    for (const l of long.split('\r\n')) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75)
  })
  it('evento con hora y de día completo', () => {
    const base = { name: 'Lanzamiento', description: '', location: 'CDMX', url: '', timezone: 'America/Mexico_City' }
    const timed = buildIcs({ ...base, starts_at: Date.UTC(2026, 10, 1, 16), ends_at: Date.UTC(2026, 10, 1, 18), all_day: false }, 'u1', 0)
    expect(timed).toContain('DTSTART:20261101T160000Z')
    const allDay = buildIcs({ ...base, starts_at: Date.UTC(2026, 10, 1, 16), ends_at: Date.UTC(2026, 10, 2, 16), all_day: true }, 'u1', 0)
    expect(allDay).toContain('DTSTART;VALUE=DATE:20261101')
    expect(allDay).toContain('DTEND;VALUE=DATE:20261103')
  })
})

describe('tipos de enlace', () => {
  it('tarjeta de contacto descarga .vcf', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=vcard')
    expect((await a.postMultipart('/panel/links?kind=vcard', { alias: 'ana-tarjeta', is_enabled: '1' })).statusCode).toBe(422)
    const ok = await a.postMultipart('/panel/links?kind=vcard', { alias: 'ana-tarjeta', is_enabled: '1', vc_first_name: 'Ana', vc_email: 'ana@example.com', vc_url: 'ana.mx' })
    expect(ok.statusCode).toBe(303)
    const res = await new Agent(t.app).get('/ana-tarjeta', UA)
    expect(res.headers['content-type']).toContain('text/vcard')
    expect(res.headers['content-disposition']).toContain('ana.vcf')
    expect(res.body).toContain('URL:https://ana.mx/')
  })

  it('evento descarga .ics', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=event')
    const bad = await a.postMultipart('/panel/links?kind=event', { alias: 'expo', is_enabled: '1', ev_name: 'Expo', ev_starts_at: '2026-11-01T10:00', ev_ends_at: '2026-11-01T09:00' })
    expect(bad.statusCode).toBe(422)
    await a.postMultipart('/panel/links?kind=event', { alias: 'expo', is_enabled: '1', ev_name: 'Expo', ev_starts_at: '2026-11-01T10:00', ev_ends_at: '2026-11-01T12:00' })
    const res = await new Agent(t.app).get('/expo', UA)
    expect(res.headers['content-type']).toContain('text/calendar')
    expect(res.body).toContain('DTSTART:20261101T160000Z') // 10:00 CDMX = 16:00 UTC
    // la edición conserva los valores
    const id = findByAlias(t.deps.db, 'expo')!.id
    expect((await a.get(`/panel/links/${id}`)).body).toContain('value="2026-11-01T10:00"')
  })

  it('archivo: se sube, se descarga como adjunto y se reemplaza', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=file')
    expect((await a.postMultipart('/panel/links?kind=file', { alias: 'menu', is_enabled: '1' })).statusCode).toBe(422)
    const up = await a.postMultipart('/panel/links?kind=file', { alias: 'menu', is_enabled: '1' }, [
      { field: 'file', filename: 'menú <x>.html', content: Buffer.from('<script>alert(1)</script>'), type: 'text/html' },
    ])
    expect(up.statusCode).toBe(303)
    const link = findByAlias(t.deps.db, 'menu')!
    const first = findFile(t.deps, Number(link.data.file_id))!
    const res = await new Agent(t.app).get('/menu', UA)
    expect(res.headers['content-disposition']).toMatch(/^attachment;/)
    expect(res.headers['content-type']).toBe('application/octet-stream')
    expect(res.headers['content-security-policy']).toContain('sandbox')
    expect(res.body).toBe('<script>alert(1)</script>')
    await a.get(`/panel/links/${link.id}`)
    await a.postMultipart(`/panel/links/${link.id}`, { alias: 'menu', is_enabled: '1' }, [
      { field: 'file', filename: 'menu.txt', content: Buffer.from('nuevo') },
    ])
    expect(existsSync(uploadPath(t.deps, first.key))).toBe(false)
    expect((await new Agent(t.app).get('/menu', UA)).body).toBe('nuevo')
  })
})
