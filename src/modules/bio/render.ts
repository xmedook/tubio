import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { html } from '../../lib/html.ts'
import { sendHtml } from '../../web/context.ts'
import type { Link } from '../links/repo.ts'

export async function renderBioPage(_deps: AppDeps, _req: FastifyRequest, reply: FastifyReply, link: Link) {
  return sendHtml(reply, html`<html><head><meta charset="utf-8"><title>${link.title}</title></head><body><h1>${link.title}</h1></body></html>`)
}
