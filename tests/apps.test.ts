import { describe, expect, it } from 'vitest'
import { appFor, mobileOs } from '../src/modules/public/apps.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser } from './helpers.ts'

const IPHONE = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0' }
const ANDROID = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' }
const MAC = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15' }

describe('abrir en la app', () => {
  it('reconoce apps y arma los enlaces profundos', () => {
    expect(appFor('https://www.youtube.com/watch?v=abc')!.ios).toBe('youtube://www.youtube.com/watch?v=abc')
    expect(appFor('https://instagram.com/cafe.norte')!.ios).toBe('instagram://user?username=cafe.norte')
    expect(appFor('https://open.spotify.com/track/xyz')!.ios).toBe('spotify:track:xyz')
    expect(appFor('https://youtu.be/abc')!.android).toContain('package=com.google.android.youtube')
    expect(appFor('https://www.youtube.com/x')!.android).toContain('S.browser_fallback_url=https%3A%2F%2Fwww.youtube.com%2Fx')
    expect(appFor('https://ejemplo.mx/')).toBeNull()
    expect(mobileOs(IPHONE['user-agent'])).toBe('ios')
  })

  it('teléfono → página que abre la app; escritorio o apagado → redirect normal', async () => {
    const t = await makeApp()
    await seedUser(t)
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'video', target_url: 'https://www.youtube.com/watch?v=abc', is_enabled: '1', open_app: '1' })
    const ios = await new Agent(t.app).get('/video', IPHONE)
    expect(ios.statusCode).toBe(200)
    expect(ios.body).toContain('youtube://www.youtube.com/watch?v=abc')
    expect(ios.body).toContain('Abriendo YouTube')
    const and = await new Agent(t.app).get('/video', ANDROID)
    expect(and.body).toContain('intent://www.youtube.com/watch?v=abc#Intent')
    expect((await new Agent(t.app).get('/video', MAC)).statusCode).toBe(302)
    const id = findByAlias(t.deps.db, 'video')!.id
    await a.get(`/panel/links/${id}`)
    await a.postMultipart(`/panel/links/${id}`, { alias: 'video', target_url: 'https://www.youtube.com/watch?v=abc', is_enabled: '1' })
    expect((await new Agent(t.app).get('/video', IPHONE)).statusCode).toBe(302)
  })
})
