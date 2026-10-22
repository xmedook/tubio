import { describe, expect, it } from 'vitest'
import { blueskyEmbed, calendlyEmbed, canvaEmbed, discordEmbed, facebookEmbed, googleDocsEmbed, googleFormsEmbed, iframeEmbed, instagramEmbed, mapEmbed, pinterestEmbed, redditEmbed, snapchatEmbed, srcOf, telegramEmbed, threadsEmbed, typeformEmbed, xEmbed } from '../src/modules/bio/blocks-embeds.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser, setPlan } from './helpers.ts'

describe('embeds de redes y herramientas', () => {
  it('reconocen URLs válidas y rechazan hosts ajenos', () => {
    expect(xEmbed('https://x.com/nasa/status/1850000000000000000')?.src).toBe('https://platform.twitter.com/embed/Tweet.html?id=1850000000000000000&dnt=true')
    expect(xEmbed('https://evil.com/nasa/status/1')).toBeNull()
    expect(instagramEmbed('https://www.instagram.com/reel/C8abcDEF12/?igsh=x')?.src).toBe('https://www.instagram.com/reel/C8abcDEF12/embed')
    expect(facebookEmbed('https://www.facebook.com/nasa/videos/123456789/')?.src).toContain('plugins/video.php')
    expect(threadsEmbed('https://www.threads.net/@zuck/post/C8abcDEF12')?.src).toBe('https://www.threads.net/@zuck/post/C8abcDEF12/embed')
    expect(blueskyEmbed('https://bsky.app/profile/jay.bsky.team/post/3kabc123', 'did:plc:abcdef12345')?.src).toBe('https://embed.bsky.app/embed/did:plc:abcdef12345/app.bsky.feed.post/3kabc123')
    expect(pinterestEmbed('https://mx.pinterest.com/pin/123456789012/')?.src).toContain('embed.html?id=123456789012')
    expect(redditEmbed('https://www.reddit.com/r/mexico/comments/1abcde/titulo/')?.src).toContain('embed.reddit.com/r/mexico/comments/1abcde/')
    expect(snapchatEmbed('https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYb2xtYWZ1bGx1')?.ratio).toBe('9x16')
    expect(telegramEmbed('https://t.me/durov/123')?.src).toBe('https://t.me/durov/123?embed=1')
    expect(discordEmbed('123456789012345678')?.src).toContain('widget?id=123456789012345678')
    expect(calendlyEmbed('https://calendly.com/ana/30min', 'tubio.link')?.src).toContain('embed_domain=tubio.link')
    expect(typeformEmbed('https://form.typeform.com/to/AbC123')?.src).toContain('/to/AbC123')
    expect(googleFormsEmbed('https://docs.google.com/forms/d/e/1FAIpQLSdAbCdEfGhIjKlMnOpQrStUv/viewform')?.src).toContain('embedded=true')
    expect(googleDocsEmbed('https://docs.google.com/presentation/d/e/2PACX-1vAbCdEfGhIjKlMnOpQrStUvWxYz/pub')?.ratio).toBe('16x9')
    expect(canvaEmbed('https://www.canva.com/design/DAFabc12345/view')?.src).toBe('https://www.canva.com/design/DAFabc12345/view?embed')
    expect(mapEmbed('https://www.openstreetmap.org/#map=15/20.6736/-103.3440')?.src).toContain('marker=20.6736,-103.344')
    expect(srcOf('<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12" width="600"></iframe>')).toBe('https://www.google.com/maps/embed?pb=!1m18!1m12')
    expect(mapEmbed('<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3"></iframe>')).not.toBeNull()
    expect(iframeEmbed('http://inseguro.com')).toBeNull()
    expect(iframeEmbed('https://usuario:clave@sitio.com')).toBeNull()
  })

  it('la CSP de la página sólo deja los orígenes que usan sus bloques; iframe respeta la lista de bloqueo', async () => {
    const t = await makeApp()
    setPlan(t, (await seedUser(t)).id, 'business')
    t.deps.db.prepare("INSERT INTO blocked_hosts (host, created_at) VALUES ('malo.com', 0)").run()
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'embeds', is_enabled: '1' })
    const id = findByAlias(t.deps.db, 'embeds')!.id
    await a.get(`/panel/links/${id}/blocks`)
    const ua = { 'user-agent': 'Mozilla/5.0 Chrome/130' }
    expect(String((await new Agent(t.app).get('/embeds', ua)).headers['content-security-policy'])).toContain("frame-src 'none'")
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=x_post`, { url: 'https://x.com/nasa/status/1850000000000000000', is_enabled: '1' })).statusCode).toBe(303)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=iframe`, { url: 'https://sub.malo.com/x', is_enabled: '1' })).statusCode).toBe(422)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=pdf`, { is_enabled: '1' }, [{ field: 'file', filename: 'm.pdf', content: Buffer.from('%PDF-1.4\n%hola'), type: 'application/pdf' }])).statusCode).toBe(303)
    const res = await new Agent(t.app).get('/embeds', ua)
    const csp = String(res.headers['content-security-policy'])
    expect(csp).toContain("frame-src https://platform.twitter.com 'self'")
    expect(csp).not.toContain('youtube')
    const pdf = listBlocks(t.deps.db, id).find((b) => b.type === 'pdf')!
    const file = await new Agent(t.app).get(`/_/pdf/${pdf.id}`, ua)
    expect(file.headers['content-type']).toBe('application/pdf')
    expect(file.headers['x-frame-options']).toBe('SAMEORIGIN')
  })
})

describe('HTML propio', () => {
  it('se sirve aparte con CSP sandbox (origen opaco) y nunca dentro de la página', async () => {
    const t = await makeApp()
    setPlan(t, (await seedUser(t)).id, 'business')
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'conhtml', is_enabled: '1' })
    const id = findByAlias(t.deps.db, 'conhtml')!.id
    await a.get(`/panel/links/${id}/blocks`)
    const code = '<script>document.cookie; parent.location="https://evil.com"</script><p>hola</p>'
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=html`, { code, height: '200', is_enabled: '1' })).statusCode).toBe(303)
    const ua = { 'user-agent': 'Mozilla/5.0 Chrome/130' }
    const page = await new Agent(t.app).get('/conhtml', ua)
    expect(page.body).not.toContain('evil.com')
    expect(page.body).toContain('sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"')
    expect(page.body).toMatch(/#b\d+ \.embed\{height:200px\}/)
    const blk = listBlocks(t.deps.db, id).find((b) => b.type === 'html')!
    expect((await new Agent(t.app).get(`/_/h/${blk.id}`, { ...ua, 'sec-fetch-dest': 'document' })).statusCode).toBe(404)
    const frame = await new Agent(t.app).get(`/_/h/${blk.id}`, { ...ua, 'sec-fetch-dest': 'iframe' })
    expect(String(frame.headers['content-security-policy'])).toMatch(/^sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox;/)
    expect(String(frame.headers['content-security-policy'])).not.toContain('allow-same-origin')
    expect(frame.body).toBe(code)
  })
})
