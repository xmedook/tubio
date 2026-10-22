import { describe, expect, it } from 'vitest'
import { parseFeed, weatherGroup, writeCache, youtubeFeedUrl } from '../src/lib/feeds.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>
<item><title>Hola &amp; adiós</title><link>https://blog.mx/1</link><pubDate>Tue, 21 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Peligro</title><link>javascript:alert(1)</link></item>
<item><title>Dos</title><link>https://blog.mx/2</link><enclosure url="https://blog.mx/i.jpg" type="image/jpeg"/></item></channel></rss>`
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<entry><title>Video uno</title><link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/><published>2026-10-20T00:00:00Z</published>
<media:group><media:thumbnail url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"/></media:group></entry></feed>`

describe('feeds', () => {
  it('lee RSS y Atom y descarta enlaces no http', () => {
    const r = parseFeed(RSS)
    expect(r.map((i) => i.title)).toEqual(['Hola & adiós', 'Dos'])
    expect(r[1]!.image).toBe('https://blog.mx/i.jpg')
    const a = parseFeed(ATOM)
    expect(a[0]).toMatchObject({ title: 'Video uno', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
  })
  it('URL del feed de YouTube desde /channel/ sin red', async () => {
    expect(await youtubeFeedUrl('https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw')).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=UCuAXFkgsw1L7xaCfnd5JJOw')
    expect(await youtubeFeedUrl('https://evil.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw')).toBeNull()
  })
  it('códigos de clima', () => {
    expect(weatherGroup(0)).toBe('clear')
    expect(weatherGroup(63)).toBe('rain')
    expect(weatherGroup(95)).toBe('storm')
  })
  it('bloque RSS: rechaza feeds internos y pinta desde la caché', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'mi-blog', is_enabled: '1' })
    const id = findByAlias(t.deps.db, 'mi-blog')!.id
    await a.get(`/panel/links/${id}/blocks`)
    const bad = await a.postMultipart(`/panel/links/${id}/blocks?type=rss`, { url: 'http://127.0.0.1/feed', count: '5', is_enabled: '1' })
    expect(bad.statusCode).toBe(422)
    // bloque guardado directo + caché caliente: la página no sale a la red al pintar
    const { createBlock } = await import('../src/modules/bio/repo.ts')
    createBlock(t.deps.db, id, { type: 'rss', is_enabled: true, starts_at: null, ends_at: null, data: { url: 'https://blog.mx/feed', count: '5', dates: true, title: 'Mi blog' }, style: {} }, t.clock.now)
    writeCache(t.deps.db, 'feed:https://blog.mx/feed', parseFeed(RSS), Date.now())
    const html = (await new Agent(t.app).get('/mi-blog', { 'user-agent': 'Mozilla/5.0 Chrome/130' })).body
    expect(html).toContain('href="https://blog.mx/1"')
    expect(html).toContain('Hola &amp; adiós')
    expect(html).not.toContain('javascript:')
    expect(listBlocks(t.deps.db, id).some((b) => b.type === 'rss')).toBe(true)
  })
})
