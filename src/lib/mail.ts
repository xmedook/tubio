import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer, { type Transporter } from 'nodemailer'

export type Mail = { to: string; subject: string; text: string }

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
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text })
  }
}
