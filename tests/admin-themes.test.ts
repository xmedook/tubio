import { describe, expect, it } from 'vitest'
import { findByAlias } from '../src/modules/links/repo.ts'
import { loginAgent, makeApp, seedUser } from './helpers.ts'

describe('admin: temas y resumen', () => {
  it('ocultar un tema y fijar el de páginas nuevas', async () => {
    const t = await makeApp()
    await seedUser(t)
    await seedUser(t, 'admin@example.com', 'contrasena-segura', 'admin')
    const adm = await loginAgent(t, 'admin@example.com')
    const ov = await adm.get('/admin')
    expect(ov.statusCode).toBe(200)
    expect(ov.body).toContain('Personas por plan')
    await adm.get('/admin/settings')
    await adm.post('/admin/settings', { site_name: 'tubio', stats_retention_days: '365', referral_percent: '20', registration_open: '1', default_theme: 'tinta', theme_off_nube: '1' })
    const a = await loginAgent(t)
    await a.get('/panel/links/new?kind=bio')
    await a.postMultipart('/panel/links?kind=bio', { alias: 'nueva', title: 'N', is_enabled: '1' })
    const link = findByAlias(t.deps.db, 'nueva')!
    expect(link.data.theme).toBe('tinta')
    const design = await a.get(`/panel/links/${link.id}/design`)
    expect(design.body).not.toContain('value="nube"')
    expect((await a.postMultipart(`/panel/links/${link.id}/design`, { theme: 'nube' })).statusCode).toBe(422)
    // no se puede dejar por defecto uno oculto
    await adm.post('/admin/settings', { site_name: 'tubio', stats_retention_days: '365', referral_percent: '20', registration_open: '1', default_theme: 'nube', theme_off_nube: '1' })
    expect(t.deps.db.prepare("SELECT value FROM settings WHERE key = 'default_theme'").pluck().get()).toBe('""')
  })
})
