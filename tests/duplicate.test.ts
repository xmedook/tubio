import { describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { loginAgent, makeApp, seedUser } from './helpers.ts'

describe('duplicar', () => {
  it('copia página con bloques (alias nuevo, contadores en cero); no duplica archivos; respeta límites', async () => {
    const t = await makeApp()
    const u = await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'promo', target_url: 'https://a.mx', is_enabled: '1' })
    const short = findByAlias(t.deps.db, 'promo')!
    t.deps.db.prepare('UPDATE links SET clicks = 9, hits = 9 WHERE id = ?').run(short.id)
    await a.get('/panel')
    const r = await a.post(`/panel/links/${short.id}/duplicate`)
    const copy = findByAlias(t.deps.db, 'promo-copia')!
    expect(r.headers.location).toBe(`/panel/links/${copy.id}`)
    expect(copy).toMatchObject({ target_url: 'https://a.mx/', clicks: 0, hits: 0, user_id: u.id })
    await a.post(`/panel/links/${short.id}/duplicate`)
    expect(findByAlias(t.deps.db, 'promo-copia-2')).toBeTruthy()
    // página bio: los bloques vienen también
    t.deps.db.prepare('UPDATE users SET plan_id = (SELECT id FROM plans WHERE slug = ?) WHERE id = ?').run('pro', u.id)
    await a.postMultipart('/panel/links?kind=bio', { alias: 'mipagina', title: 'Mi página', is_enabled: '1' })
    const bio = findByAlias(t.deps.db, 'mipagina')!
    await a.post(`/panel/links/${bio.id}/duplicate`)
    const bioCopy = findByAlias(t.deps.db, 'mipagina-copia')!
    expect(listBlocks(t.deps.db, bioCopy.id).map((b) => b.type)).toEqual(listBlocks(t.deps.db, bio.id).map((b) => b.type))
    expect(bioCopy.title).toBe('Mi página (copia)')
    // plan gratis: 1 página bio → no deja duplicar
    t.deps.db.prepare('UPDATE users SET plan_id = NULL WHERE id = ?').run(u.id)
    await a.post(`/panel/links/${bio.id}/duplicate`)
    expect(findByAlias(t.deps.db, 'mipagina-copia-2')).toBeUndefined()
    // otro usuario no puede duplicar lo ajeno
    await seedUser(t, 'beto@example.com')
    const b = await loginAgent(t, 'beto@example.com')
    await b.get('/panel')
    expect((await b.post(`/panel/links/${short.id}/duplicate`)).statusCode).toBe(404)
  })
})
