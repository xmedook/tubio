import { describe, expect, it } from 'vitest'
import { html, raw, attrs, cssColor } from '../src/lib/html.ts'
import { dictionary, fromAcceptLanguage, translator } from '../src/lib/i18n.ts'
import { hashPassword, verifyPassword } from '../src/lib/crypto.ts'
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from '../src/lib/totp.ts'
import { fromLocalInput, toLocalInput } from '../src/views/ui.ts'
import { safeNext } from '../src/web/context.ts'

describe('html', () => {
  it('escapa por defecto y respeta raw', () => {
    const evil = '<script>alert("x")</script>'
    expect(html`<p>${evil}</p>`.value).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>')
    expect(html`<p>${raw('<b>ok</b>')}</p>`.value).toBe('<p><b>ok</b></p>')
    expect(html`<ul>${['a', 'b'].map((x) => html`<li>${x}</li>`)}</ul>`.value).toBe('<ul><li>a</li><li>b</li></ul>')
    expect(html`${null}${undefined}${false}${0}`.value).toBe('0')
  })
  it('attrs omite falsos y escapa valores', () => {
    expect(attrs({ a: true, b: false, c: '"x"', d: null }).value).toBe(' a c="&quot;x&quot;"')
  })
  it('cssColor sólo deja pasar hex', () => {
    expect(cssColor('#fff', '#000')).toBe('#fff')
    expect(cssColor('red;background:url(x)', '#000')).toBe('#000')
  })
})

describe('i18n', () => {
  it('es-MX y en tienen exactamente las mismas claves', () => {
    const es = Object.keys(dictionary('es-MX')).sort()
    const en = Object.keys(dictionary('en')).sort()
    expect(en.filter((k) => !es.includes(k))).toEqual([])
    expect(es.filter((k) => !en.includes(k))).toEqual([])
  })
  it('ningún texto queda vacío', () => {
    for (const loc of ['es-MX', 'en'] as const) {
      for (const [k, v] of Object.entries(dictionary(loc))) expect(v.trim(), `${loc}:${k}`).not.toBe('')
    }
  })
  it('Accept-Language', () => {
    expect(fromAcceptLanguage('en-US,en;q=0.9')).toBe('en')
    expect(fromAcceptLanguage('fr-FR,es;q=0.5,en;q=0.4')).toBe('es-MX')
    expect(fromAcceptLanguage(undefined)).toBe('es-MX')
    expect(fromAcceptLanguage('de')).toBe('es-MX')
  })
  it('interpola variables', () => {
    expect(translator('en')('admin.impersonating', { email: 'a@b.c' })).toContain('a@b.c')
  })
})

describe('crypto', () => {
  it('hash y verificación de contraseña', async () => {
    const h = await hashPassword('una contraseña larga')
    expect(h.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('una contraseña larga', h)).toBe(true)
    expect(await verifyPassword('otra', h)).toBe(false)
    expect(await verifyPassword('x', 'basura')).toBe(false)
  })
})

describe('totp', () => {
  it('vectores de RFC 4226/6238', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'))
    expect(base32Decode(secret).toString()).toBe('12345678901234567890')
    expect(hotp(secret, 0)).toBe('755224')
    expect(hotp(secret, 1)).toBe('287082')
    expect(totp(secret, 59_000)).toBe('287082')
    expect(totp(secret, 1111111109_000)).toBe('081804')
  })
  it('acepta ±1 paso y nada más', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'))
    const now = 1111111109_000
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(true)
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBe(false)
    expect(verifyTotp(secret, 'abc', now)).toBe(false)
  })
})

describe('utilidades web', () => {
  it('safeNext evita redirecciones abiertas', () => {
    expect(safeNext('/panel/x')).toBe('/panel/x')
    expect(safeNext('//evil.com')).toBe('/panel')
    expect(safeNext('/\\evil.com')).toBe('/panel')
    expect(safeNext('https://evil.com')).toBe('/panel')
  })
  it('datetime-local ida y vuelta en zona horaria', () => {
    const tz = 'America/Mexico_City'
    const ts = fromLocalInput('2026-10-22T09:30', tz) as number
    expect(new Date(ts).toISOString()).toBe('2026-10-22T15:30:00.000Z')
    expect(toLocalInput(ts, tz)).toBe('2026-10-22T09:30')
    expect(fromLocalInput('', tz)).toBeNull()
  })
})

describe('correo HTML', async () => {
  const { mailHtml } = await import('../src/lib/mail.ts')
  it('escapa el texto y convierte la URL sola en botón', () => {
    const h = mailHtml({ to: 'a@b.c', subject: 's', text: 'Hola <b>Ana</b>:\n\nhttps://tubio.link/verify/abc\n\nGracias', button: 'Verificar' })
    expect(h).toContain('Hola &lt;b&gt;Ana&lt;/b&gt;:')
    expect(h).toContain('href="https://tubio.link/verify/abc"')
    expect(h).toContain('>Verificar</a>')
  })
})
