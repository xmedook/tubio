import { describe, expect, it } from 'vitest'
import { chooseDestination } from '../src/modules/marketing/resolve.ts'
import { findByAlias, type Link } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser, setPlan } from './helpers.ts'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'

const fake = (t: Link['targeting']) => ({ target_url: 'https://base.mx/', targeting: t }) as Link

describe('segmentación', () => {
  it('primera regla que coincide; luego A/B; luego destino base', () => {
    const t = { rules: [{ type: 'country' as const, value: 'US', url: 'https://us.mx/' }, { type: 'device' as const, value: 'mobile', url: 'https://m.mx/' }] }
    expect(chooseDestination(fake(t), { country: 'US', ua: IPHONE, lang: 'en' })).toEqual({ url: 'https://us.mx/', variant: 'country:US' })
    expect(chooseDestination(fake(t), { country: 'MX', ua: IPHONE, lang: 'es' }).url).toBe('https://m.mx/')
    expect(chooseDestination(fake(t), { country: 'MX', ua: MAC, lang: 'es' })).toEqual({ url: 'https://base.mx/', variant: null })
    expect(chooseDestination(fake({ rules: [{ type: 'os', value: 'ios', url: 'https://ios.mx/' }] }), { country: null, ua: IPHONE, lang: null }).url).toBe('https://ios.mx/')
    const ab = fake({ ab: [{ url: 'https://a.mx/', weight: 30 }] })
    expect(chooseDestination(ab, { country: null, ua: MAC, lang: null }, () => 1000).url).toBe('https://a.mx/') // 10 < 30
    expect(chooseDestination(ab, { country: null, ua: MAC, lang: null }, () => 5000).url).toBe('https://base.mx/')
  })
})

describe('marketing en enlaces', () => {
  async function setup(plan = 'pro') {
    const t = await makeApp()
    const u = await seedUser(t)
    setPlan(t, u.id, plan)
    const a = await loginAgent(t)
    return { t, a }
  }

  it('reglas desde el formulario y variante registrada en estadísticas', async () => {
    const { t, a } = await setup()
    await a.get('/panel/links/new?kind=short')
    const res = await a.postMultipart('/panel/links?kind=short', { alias: 'promo', target_url: 'https://base.mx', is_enabled: '1', tg__0__type: 'device', tg__0__value: 'mobile', tg__0__url: 'm.base.mx' })
    expect(res.statusCode).toBe(303)
    const go = await new Agent(t.app).get('/promo', { 'user-agent': IPHONE })
    expect(go.headers.location).toBe('https://m.base.mx/')
    expect(t.deps.db.prepare('SELECT variant FROM stat_events').pluck().get()).toBe('device:mobile')
  })

  it('splash con cuenta regresiva y píxeles con consentimiento', async () => {
    const { t, a } = await setup()
    await a.get('/panel/pixels')
    expect((await a.post('/panel/pixels', { kind: 'meta', pixel_id: '1234567890123', name: 'Meta' })).statusCode).toBe(303)
    expect((await a.post('/panel/pixels', { kind: 'ga4', pixel_id: 'malo', name: 'GA' })).statusCode).toBe(422)
    expect((await a.post('/panel/pixels', { kind: 'gtm', pixel_id: 'GTM-AB12CD', name: 'GTM' })).statusCode).toBe(303)
    expect((await a.post('/panel/pixels', { kind: 'gtm', pixel_id: 'G-123', name: 'mal' })).statusCode).toBe(422)
    const px = t.deps.db.prepare("SELECT id FROM pixels WHERE kind = 'meta'").pluck().get() as number
    await a.get('/panel/splashes')
    await a.postMultipart('/panel/splashes', { name: 'Promo', title: 'Antes de seguir…', seconds: '3' })
    const sp = t.deps.db.prepare('SELECT id FROM splashes').pluck().get() as number
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'spl', target_url: 'https://destino.mx', is_enabled: '1', splash_id: String(sp), px: String(px) })
    const page = await new Agent(t.app).get('/spl', { 'user-agent': MAC })
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('Antes de seguir…')
    expect(page.body).toContain('data-go="https://destino.mx/"')
    expect(page.body).toContain('data-px=')
    expect(String(page.headers['content-security-policy'])).toContain('https://connect.facebook.net')
    // sin splash, con píxel: redirect directo si no hay consentimiento; página intermedia si sí
    const id = findByAlias(t.deps.db, 'spl')!.id
    t.deps.db.prepare('UPDATE links SET splash_id = NULL WHERE id = ?').run(id)
    expect((await new Agent(t.app).get('/spl', { 'user-agent': MAC })).statusCode).toBe(302)
    const withConsent = await new Agent(t.app).get('/spl', { 'user-agent': MAC, cookie: 'tb_px=1' })
    expect(withConsent.statusCode).toBe(200)
    expect(withConsent.body).toContain('Redirigiendo')
  })

  it('ocultar destino: marco con el destino y frame-src sólo de ese origen', async () => {
    const { t, a } = await setup()
    await a.get('/panel/links/new?kind=short')
    await a.postMultipart('/panel/links?kind=short', { alias: 'oculto', target_url: 'https://sitio.mx/pagina', is_enabled: '1', cloak: '1' })
    // sin correo verificado: redirect normal
    expect((await new Agent(t.app).get('/oculto', { 'user-agent': MAC })).statusCode).toBe(302)
    t.deps.db.prepare('UPDATE users SET email_verified_at = 1').run()
    const page = await new Agent(t.app).get('/oculto', { 'user-agent': MAC })
    expect(page.body).toContain('<iframe class="cloak" src="https://sitio.mx/pagina"')
    expect(String(page.headers['content-security-policy'])).toContain('frame-src https://sitio.mx')
  })

  it('plan gratis: no ve la sección ni se aplican reglas guardadas', async () => {
    const { t, a } = await setup('free')
    const form = await a.get('/panel/links/new?kind=short')
    expect(form.body).toContain('vienen con los planes Pro y Negocio')
    await a.postMultipart('/panel/links?kind=short', { alias: 'gratis', target_url: 'https://base.mx', is_enabled: '1', cloak: '1', tg__0__type: 'device', tg__0__value: 'mobile', tg__0__url: 'https://m.mx' })
    expect((await new Agent(t.app).get('/gratis', { 'user-agent': IPHONE })).headers.location).toBe('https://base.mx/')
    expect((await a.get('/panel/pixels')).body).toContain('vienen con los planes Pro')
  })
})
