import { describe, expect, it } from 'vitest'
import { disableStatsBuffer, enableStatsBuffer, flushStats } from '../src/modules/stats/buffer.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15' }

describe('estadísticas en lote', () => {
  it('junta visitas y contadores; el tope de clics cuenta lo pendiente; al apagar se escribe', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'lote', target_url: 'https://a.mx', is_enabled: '1', click_limit: '3' })
    const db = t.deps.db
    enableStatsBuffer(db, 60_000, 1000)
    const v = new Agent(t.app)
    for (let i = 0; i < 3; i++) expect((await v.get('/lote', UA)).statusCode).toBe(302)
    expect(db.prepare('SELECT COUNT(*) FROM stat_events').pluck().get()).toBe(0) // aún en memoria
    expect((await v.get('/lote', UA)).statusCode).toBe(404) // tope alcanzado con lo pendiente
    expect(flushStats(db)).toBe(3)
    expect(findByAlias(db, 'lote')!.hits).toBe(3)
    expect(findByAlias(db, 'lote')!.clicks).toBe(3)
    db.prepare('UPDATE links SET click_limit = NULL').run()
    await v.get('/lote', UA)
    disableStatsBuffer(db)
    expect(db.prepare('SELECT COUNT(*) FROM stat_events').pluck().get()).toBe(4)
  })
})
