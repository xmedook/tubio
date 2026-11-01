import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer, { type Transporter } from 'nodemailer'

import { esc } from './html.ts'
import { WORDMARK_RATIO } from './wordmark.ts'

/** button: texto del botón para la línea que sea sólo una URL */
export type Mail = { to: string; subject: string; text: string; button?: string; replyTo?: string }

/**
 * Versión HTML a partir del texto: párrafos escapados y la línea que sea sólo una URL se vuelve botón.
 * Estilos en línea y tabla: lo que entienden los clientes de correo.
 */
/** Logo del encabezado de los correos (design: el PNG del wordmark v4, servido por el propio sitio): PNG (los clientes de correo no pintan SVG) servido por el propio sitio */
const LOGO_URL = `${(process.env.TUBIO_BASE_URL ?? 'https://tubio.link').replace(/\/$/, '')}/_/static/img/brand/tubio-logotipo-papel.png`

export function mailHtml(mail: Mail): string {
  const F = 'font-family:Arial,Helvetica,sans-serif'
  const base = (process.env.TUBIO_BASE_URL ?? 'https://tubio.link').replace(/\/$/, '')
  const blocks = mail.text.split(/\n{2,}/).map((para) => {
    const lines = para.split('\n')
    if (lines.length === 1 && /^https?:\/\/\S+$/.test(lines[0] ?? '')) {
      const url = esc(lines[0])
      return `</td></tr><tr><td style="padding:8px 32px 28px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" bgcolor="#d6f23a" style="border:2px solid #10120d;border-radius:6px"><a href="${url}" style="display:block;padding:15px 24px;${F};font-size:17px;font-weight:700;color:#10120d;text-decoration:none">${esc(mail.button ?? 'Abrir')}</a></td></tr></table><p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#4f5448;${F};word-break:break-all">${url}</p></td></tr><tr><td style="padding:4px 32px 0;${F};color:#10120d">`
    }
    return `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#33372d;${F}">${lines.map((l) => (/^https?:\/\/\S+$/.test(l) ? `<a href="${esc(l)}" style="color:#10120d">${esc(l)}</a>` : esc(l))).join('<br>')}</p>`
  })
  // diseño de design (1-nov-2026, bloque 3): tablas, estilos en línea, 600 px y solo Arial; botón lima con borde tinta
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(mail.subject)}</title></head><body style="margin:0;background:#eceee6;${F}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceee6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fbfaf6;border:1px solid #d8dbd0;border-radius:8px">
<tr><td style="padding:28px 32px 8px"><img src="${LOGO_URL}" width="150" height="${Math.round(150 / WORDMARK_RATIO)}" alt="túbio" style="display:block;border:0;outline:none;font-size:24px;font-weight:700;color:#10120d"></td></tr>
<tr><td style="padding:12px 32px 4px;${F};color:#10120d"><h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;letter-spacing:-.5px;color:#10120d;${F}">${esc(mail.subject)}</h1>${blocks.join('')}</td></tr>
<tr><td style="padding:18px 32px 26px;border-top:1px solid #d8dbd0;font-size:13px;line-height:1.5;color:#4f5448;${F}">Este correo lo envía túbio. <a href="${base}/privacy" style="color:#10120d">Aviso de privacidad</a> · <a href="${base}/help" style="color:#10120d">Ayuda</a></td></tr></table></td></tr></table></body></html>`
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/** Desarrollo: cada correo queda como .eml en un directorio; nada sale del servidor. */
export class FileMailer implements Mailer {
  readonly dir: string
  readonly from: string
  constructor(dir: string, from: string) {
    this.dir = dir
    this.from = from
  }
  async send(mail: Mail): Promise<void> {
    mkdirSync(this.dir, { recursive: true })
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}.eml`
    const body = `From: ${this.from}\nTo: ${mail.to}\nSubject: ${mail.subject}\nContent-Type: text/plain; charset=utf-8\n\n${mail.text}\n`
    writeFileSync(join(this.dir, name), body)
  }
}

/** Tests: guarda los correos en memoria. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = []
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail)
  }
}

export class SmtpMailer implements Mailer {
  readonly transport: Transporter
  readonly from: string
  constructor(url: string, from: string) {
    this.transport = nodemailer.createTransport(url)
    this.from = from
  }
  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text, html: mailHtml(mail), ...(mail.replyTo ? { replyTo: mail.replyTo } : {}) })
  }
}
