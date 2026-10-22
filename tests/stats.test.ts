import { existsSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { purgeOrphanImages, runJobs } from '../src/jobs.ts'
import { uploadPath } from '../src/lib/uploads.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { buildReport, csvCell, parseRange, tzOffsetMinutes } from '../src/modules/stats/query.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

describe('rangos', () => {
  it('desfase de zona y rango por defecto de 30 días', () => {
    expect(tzOffsetMinutes('America/Mexico_City', Date.UTC(2026, 9, 22))).toBe(-360)
    expect(tzOffsetMinutes('UTC', 0)).toBe(0)
    const r = parseRange(undefined, undefined, 'America/Mexico_City', Date.UTC(2026, 9, 22, 3)) // 21-oct 21:00 local
    expect(r.to).toBe('2026-10-21')
    expect(r.days).toHaveLength(30)
    expect(r.fromTs).toBe(Date.UTC(2026, 8, 22, 6))
  })
  it('acota rangos inválidos o enormes', () => {
    const now = Date.UTC(2026, 9, 22, 12)
    expect(parseRange('basura', '2099-01-01', 'UTC', now).to).toBe('2026-10-22')
    expect(parseRange('2020-01-01', '2026-10-22', 'UTC', now).days).toHaveLength(366)
    expect(parseRange('2026-10-20', '2026-10-10', 'UTC', now).from).toBe('2026-10-10')
  })
  it('CSV sin inyección de fórmulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell(null)).toBe('')
  })
})

describe('reporte', () => {
  it('cuenta visitas, únicos por día, dispositivos, referentes, UTM y clics por bloque', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'ana', title: 'Ana', is_enabled: '1' })
    const link = findByAlias(t.deps.db, 'ana')!
    await a.get(`/panel/links/${link.id}/blocks`)
    await a.postMultipart(`/panel/links/${link.id}/blocks?type=link`, { label: 'Tienda', url: 'https://tienda.mx', is_enabled: '1' })
    const block = listBlocks(t.deps.db, link.id).find((b) => b.type === 'link')!

    const visit = (ua: string, ip: string, extra: Record<string, string> = {}, url = '/ana') =>
      t.app.inject({ method: 'GET', url, remoteAddress: ip, headers: { 'user-agent': ua, 'accept-language': 'en-US,en;q=0.9', ...extra } })
    await visit(IPHONE, '1.1.1.1', { referer: 'https://www.instagram.com/x' })
    await visit(IPHONE, '1.1.1.1') // mismo visitante
    await visit(MAC, '2.2.2.2', {}, '/ana?utm_source=newsletter&utm_campaign=otono')
    await visit('Googlebot/2.1 (+http://www.google.com/bot.html)', '3.3.3.3')
    await visit(MAC, '2.2.2.2', {}, `/_/c/${block.id}`)
    // al día siguiente el mismo visitante cuenta otra vez como único
    t.clock.now += 86400_000
    await visit(IPHONE, '1.1.1.1')

    const range = parseRange('2026-10-01', '2026-10-31', 'America/Mexico_City', t.clock.now)
    const r = buildReport(t.deps.db, { linkId: link.id }, range)
    expect(r.totals.views).toBe(4)
    expect(r.totals.visitors).toBe(3)
    expect(r.totals.clicks).toBe(1)
    expect(r.breakdowns.device.find((d) => d.key === 'mobile')!.views).toBe(3)
    expect(r.breakdowns.referrer.find((d) => d.key === 'instagram.com')!.views).toBe(1)
    expect(r.breakdowns.utm_campaign.find((d) => d.key === 'otono')!.views).toBe(1)
    expect(r.breakdowns.lang[0]!.key).toBe('en')
    expect(r.blocks).toEqual([{ block_id: block.id, clicks: 1 }])
    expect(r.series.reduce((s, d) => s + d.views, 0)).toBe(4)

    const page = await a.get(`/panel/links/${link.id}/stats?from=2026-10-01&to=2026-10-31`)
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('<svg viewBox="0 0 720 220"')
    expect(page.body).toContain('Celular')
    expect(page.body).toContain('instagram.com')
    const csv = await a.get(`/panel/links/${link.id}/stats?format=csv&from=2026-10-01&to=2026-10-31`)
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.body.trim().split('\n')).toHaveLength(6) // encabezado + 5 eventos
    expect(csv.body).not.toMatch(/\d+\.\d+\.\d+\.\d+/) // sin IPs
    const json = JSON.parse((await a.get(`/panel/links/${link.id}/stats?format=json&from=2026-10-01&to=2026-10-31`)).body)
    expect(json.totals.views).toBe(4)
    const all = await a.get('/panel/stats?from=2026-10-01&to=2026-10-31')
    expect(all.body).toContain('Enlaces con más actividad')
  })

  it('estadísticas públicas sólo si el dueño las activa', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'promo', target_url: 'https://a.mx', is_enabled: '1' })
    expect((await new Agent(t.app).get('/_/stats/promo')).statusCode).toBe(404)
    const id = findByAlias(t.deps.db, 'promo')!.id
    await a.get(`/panel/links/${id}`)
    await a.postMultipart(`/panel/links/${id}`, { alias: 'promo', target_url: 'https://a.mx', is_enabled: '1', public_stats: '1' })
    const pub = await new Agent(t.app).get('/_/stats/promo')
    expect(pub.statusCode).toBe(200)
    expect(pub.body).not.toContain('CSV')
  })

  it('retención borra eventos viejos y sales; imágenes huérfanas se limpian', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'ana', is_enabled: '1' })
    const link = findByAlias(t.deps.db, 'ana')!
    await a.get(`/panel/links/${link.id}/blocks`)
    const img = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#000' } }).png().toBuffer()
    await a.postMultipart(`/panel/links/${link.id}/blocks?type=avatar`, { is_enabled: '1' }, [{ field: 'image', filename: 'a.png', content: img, type: 'image/png' }])
    const avatar = listBlocks(t.deps.db, link.id).find((b) => b.type === 'avatar')!
    const key = avatar.data.image as string
    await t.app.inject({ method: 'GET', url: '/ana', headers: { 'user-agent': MAC } })
    t.clock.now += 2 * 86400_000
    expect(purgeOrphanImages(t.deps)).toBe(0) // en uso
    await a.post(`/panel/blocks/${avatar.id}/delete`)
    t.clock.now += 400 * 86400_000
    const r = runJobs(t.deps)
    expect(r.stat_events).toBe(1)
    expect(r.orphan_images).toBe(1)
    expect(existsSync(uploadPath(t.deps, key))).toBe(false)
    expect(u.id).toBeGreaterThan(0)
  })
})
