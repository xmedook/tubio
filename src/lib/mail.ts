import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer, { type Transporter } from 'nodemailer'

import { esc } from './html.ts'

/** button: texto del botón para la línea que sea sólo una URL */
export type Mail = { to: string; subject: string; text: string; button?: string; replyTo?: string }

/**
 * Versión HTML a partir del texto: párrafos escapados y la línea que sea sólo una URL se vuelve botón.
 * Estilos en línea y tabla: lo que entienden los clientes de correo.
 */
export function mailHtml(mail: Mail): string {
  const blocks = mail.text.split(/\n{2,}/).map((para) => {
    const lines = para.split('\n')
    if (lines.length === 1 && /^https?:\/\/\S+$/.test(lines[0] ?? '')) {
      const url = esc(lines[0])
      return `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#A3163F;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${esc(mail.button ?? 'Abrir')}</a></p><p style="margin:0 0 16px;font-size:12px;color:#5E5559;word-break:break-all">${url}</p>`
    }
    return `<p style="margin:0 0 16px">${lines.map((l) => (/^https?:\/\/\S+$/.test(l) ? `<a href="${esc(l)}" style="color:#A3163F">${esc(l)}</a>` : esc(l))).join('<br>')}</p>`
  })
  return `<!doctype html><html><body style="margin:0;background:#F2F0EE;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1F1A1C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F0EE;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #D6CFCC;border-radius:12px">
<tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:800;letter-spacing:-0.03em">tu<span style="color:#A3163F">bio</span></td></tr>
<tr><td style="padding:8px 28px 20px;font-size:15px;line-height:1.55">${blocks.join('')}</td></tr>
</table>
<p style="font-size:12px;color:#5E5559;margin:16px 0 0">tubio.link</p>
</td></tr></table></body></html>`
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
