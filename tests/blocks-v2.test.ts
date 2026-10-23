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
