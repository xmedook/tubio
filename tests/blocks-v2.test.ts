import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

describe('bloques v2', () => {
  it('cabecera con portada, tarjeta de artículo y llamada a la acción', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'nuevos', title: 'N', is_enabled: '1' })
    const id = findByAlias(t.deps.db, 'nuevos')!.id
    const img = await sharp({ create: { width: 900, height: 400, channels: 3, background: '#14774a' } }).png().toBuffer()
    await a.get(`/panel/links/${id}/blocks/new?type=cover_header`)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=cover_header`, { title: 'Café Norte', subtitle: 'Desde 1998', is_enabled: '1' }, [{ field: 'cover', filename: 'p.png', content: img, type: 'image/png' }])).statusCode).toBe(303)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=article_card`, { url: 'https://blog.mx/nota', title: 'Nuestra historia', description: 'Cómo empezamos', is_enabled: '1' })).statusCode).toBe(303)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=cta`, { title: '¿Evento privado?', text: 'Cotiza sin compromiso', button: 'Cotizar', url: 'https://wa.me/5215512345678', is_enabled: '1' })).statusCode).toBe(303)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=article_card`, { url: 'javascript:alert(1)', title: 'x', is_enabled: '1' })).statusCode).toBe(422)
    const page = (await new Agent(t.app).get('/nuevos')).body
    expect(page).toContain('class="cover-h"')
    expect(page).toContain('Café Norte')
    expect(page).toContain('blog.mx')
    expect(page).toContain('Cotizar')
  })
})

describe('reporte semanal', () => {
  it('lunes desde las 8:00 de su zona, una vez por semana, sólo con movimiento; se apaga en Cuenta', async () => {
    const { weeklyReports } = await import('../src/jobs.ts')
    const t = await makeApp()
    t.clock.now = Date.UTC(2026, 9, 26, 15, 0) // lunes 26-oct 09:00 en CDMX
    const u = await seedUser(t)
    t.deps.db.prepare('UPDATE users SET email_verified_at = 1 WHERE id = ?').run(u.id)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'semana', target_url: 'https://a.mx', is_enabled: '1' })
    const link = findByAlias(t.deps.db, 'semana')!
    const ins = t.deps.db.prepare("INSERT INTO stat_events (link_id, kind, ts, day, hour, visitor) VALUES (?, 'view', ?, '2026-10-25', 10, 'x')")
    for (let i = 0; i < 3; i++) ins.run(link.id, t.clock.now - 86400_000)
    const before = t.mailer.sent.length
    expect(await weeklyReports(t.deps)).toBe(1)
    expect(t.mailer.sent.at(-1)!.subject).toContain('3 visitas')
    expect(await weeklyReports(t.deps)).toBe(0) // ya salió esta semana
    t.clock.now += 7 * 86400_000
    await a.get('/panel/account')
    await a.post('/panel/account/weekly-report', { on: '0' })
    expect(await weeklyReports(t.deps)).toBe(0)
    expect(t.mailer.sent.length).toBe(before + 1)
  })
})
