import { describe, expect, it } from 'vitest'
import { enqueue, runQueue, validateTarget } from '../src/modules/capture/notify.ts'
import { listBlocks } from '../src/modules/bio/repo.ts'
import { findByAlias } from '../src/modules/links/repo.ts'
import { Agent, loginAgent, makeApp, seedUser, type TestApp } from './helpers.ts'

const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36' }

async function setup() {
  const t = await makeApp()
  await seedUser(t)
  const a = await loginAgent(t)
  await a.get('/panel/links/new?kind=bio')
  await a.postMultipart('/panel/links?kind=bio', { alias: 'tienda', title: 'Tienda', is_enabled: '1' })
  const id = findByAlias(t.deps.db, 'tienda')!.id
  return { t, a, id }
}

async function visitorPost(t: TestApp, blockId: number, form: Record<string, string>) {
  const v = new Agent(t.app)
  await v.get('/tienda', UA)
  return { v, res: await v.post(`/_/f/${blockId}`, form, UA) }
}

describe('destinos de aviso', () => {
  it('valida cada tipo', () => {
    expect('error' in validateTarget('slack', { url: 'https://evil.com/x' })).toBe(true)
    expect('config' in validateTarget('slack', { url: 'https://hooks.slack.com/services/T0/B0/xyz' })).toBe(true)
    expect('config' in validateTarget('discord', { url: 'https://discord.com/api/webhooks/123/abc-DEF' })).toBe(true)
    expect('error' in validateTarget('telegram', { token: 'malo', chat_id: '1' })).toBe(true)
    expect('config' in validateTarget('telegram', { token: '123456:ABCdefGHIjklMNOpqrSTUvwxYZ0123456789', chat_id: '-100123456' })).toBe(true)
    expect('error' in validateTarget('webhook', { url: 'http://no-https.com' })).toBe(true)
  })
})

describe('captura de datos', () => {
  it('formulario de contacto: guarda, avisa por correo y aparece en Datos y CSV', async () => {
    const { t, a, id } = await setup()
    await a.get('/panel/notifications?kind=email')
    expect((await a.post('/panel/notifications?kind=email', { name: 'Mi correo', test: '' })).statusCode).toBe(303)
    const target = t.deps.db.prepare('SELECT id FROM notify_targets').pluck().get() as number
    await a.get(`/panel/links/${id}/blocks/new?type=contact_form`)
    expect((await a.postMultipart(`/panel/links/${id}/blocks?type=contact_form`, { title: 'Escríbeme', targets: String(target), is_enabled: '1' })).statusCode).toBe(303)
    const block = listBlocks(t.deps.db, id).find((b) => b.type === 'contact_form')!
    expect(block.data.targets).toEqual([target])
    const page = (await new Agent(t.app).get('/tienda', UA)).body
    expect(page).toContain(`action="/_/f/${block.id}"`)
    expect(page).toContain('name="consent"')
    // sin consentimiento → error
    const { res: noConsent } = await visitorPost(t, block.id, { name: 'Luis', email: 'luis@example.com', message: 'Hola' })
    expect(noConsent.headers.location).toContain('err=consent')
    // honeypot lleno: finge éxito pero no guarda
    await visitorPost(t, block.id, { name: 'Bot', email: 'bot@example.com', message: 'spam', consent: '1', website: 'http://spam' })
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM collected').pluck().get()).toBe(0)
    const { res, v } = await visitorPost(t, block.id, { name: 'Luis', email: 'Luis@Example.com', message: 'Quiero una cotización', consent: '1' })
    expect(res.headers.location).toBe(`/tienda?sent=${block.id}#b${block.id}`)
    expect((await v.get(`/tienda?sent=${block.id}`, UA)).body).toContain('¡Gracias! Lo recibimos.')
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM collected').pluck().get()).toBe(1)
    // doble clic no duplica
    await v.post(`/_/f/${block.id}`, { name: 'Luis', email: 'luis@example.com', message: 'otra vez', consent: '1' }, UA)
    expect(t.deps.db.prepare('SELECT COUNT(*) FROM collected').pluck().get()).toBe(1)
    // la cola entrega el aviso
    expect(await runQueue(t.deps)).toBe(1)
    const mail = t.mailer.sent.at(-1)!
    expect(mail.to).toBe('ana@example.com')
    expect(mail.text).toContain('Quiero una cotización')
    const data = await a.get('/panel/data')
    expect(data.body).toContain('luis@example.com')
    expect(data.body).toContain('Quiero una cotización')
    const csv = await a.get('/panel/data.csv')
    expect(csv.body).toContain('luis@example.com')
    // otro usuario no ve nada
    await seedUser(t, 'beto@example.com')
    const b = await loginAgent(t, 'beto@example.com')
    expect((await b.get('/panel/data')).body).not.toContain('luis@example.com')
  })

  it('encuesta: un voto por visitante por día y resultados', async () => {
    const { t, a, id } = await setup()
    await a.get(`/panel/links/${id}/blocks`)
    await a.postMultipart(`/panel/links/${id}/blocks?type=poll`, { question: '¿Qué sabor?', options__0__text: 'Vainilla', options__1__text: 'Chocolate', show_results: '1', is_enabled: '1' })
    const poll = listBlocks(t.deps.db, id).find((b) => b.type === 'poll')!
    const v = new Agent(t.app)
    await v.get('/tienda', UA)
    await v.post(`/_/f/${poll.id}`, { option: '1' }, UA)
    await v.post(`/_/f/${poll.id}`, { option: '0' }, UA)
    expect(t.deps.db.prepare("SELECT COUNT(*) FROM collected WHERE kind = 'poll'").pluck().get()).toBe(1)
    const page = (await v.get('/tienda', UA)).body
    expect(page).toContain('Chocolate')
    expect(page).toContain('<progress value="100"')
  })

  it('webhook: reintentos con espera creciente y error visible en el destino', async () => {
    const { t } = await setup()
    t.deps.db.prepare("UPDATE users SET plan_id = (SELECT id FROM plans WHERE slug = 'business') WHERE id = 1").run()
    t.deps.db.prepare("INSERT INTO notify_targets (user_id, kind, name, config, created_at) VALUES (1, 'webhook', 'wh', ?, 0)").run(JSON.stringify({ url: 'https://127.0.0.1/hook', secret: 's3' }))
    const tid = t.deps.db.prepare('SELECT id FROM notify_targets').pluck().get() as number
    enqueue(t.deps, 'notify', { target_id: tid, notice: { title: 'x', lines: [], url: '', at: 0, payload: { a: 1 } } })
    expect(await runQueue(t.deps)).toBe(0) // IP interna bloqueada → falla
    const job = t.deps.db.prepare('SELECT attempts, run_at, last_error FROM jobs').get() as { attempts: number; run_at: number; last_error: string }
    expect(job.attempts).toBe(1)
    expect(job.run_at).toBe(t.clock.now + 60_000)
    expect(job.last_error).toContain('blocked_ip')
    expect(t.deps.db.prepare('SELECT last_error FROM notify_targets').pluck().get()).toContain('blocked_ip')
  })

  it('un destino ajeno no se puede elegir en un bloque', async () => {
    const { t, a, id } = await setup()
    t.deps.db.prepare("INSERT INTO users (email, password_hash, created_at, updated_at) VALUES ('otro@x.com', 'x', 0, 0)").run()
    t.deps.db.prepare("INSERT INTO notify_targets (user_id, kind, name, config, created_at) VALUES (2, 'email', 'ajeno', '{}', 0)").run()
    await a.get(`/panel/links/${id}/blocks`)
    await a.postMultipart(`/panel/links/${id}/blocks?type=email_capture`, { targets: '1', is_enabled: '1' })
    expect(listBlocks(t.deps.db, id).find((b) => b.type === 'email_capture')!.data.targets).toEqual([])
  })
})
