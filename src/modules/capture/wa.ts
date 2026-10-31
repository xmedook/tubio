import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { sha256 } from '../../lib/crypto.ts'
import { visibleBlocks } from '../bio/render.ts'
import { getBlock } from '../bio/repo.ts'
import { waKeys } from '../bio/wa-request.ts'
import { notifyUser } from '../inbox/repo.ts'
import { getLink } from '../links/repo.ts'
import { availability, isConfirmed, isUnlocked } from '../public/gate.ts'
import { dailySalt } from '../stats/record.ts'
import { enqueue, getOwnTarget, type Notice } from './notify.ts'

type Body = { ev?: unknown; fields?: unknown; message?: unknown; touched?: unknown }

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '')

/**
 * Solicitudes por WhatsApp (bloque wa_request). El mensaje lo arma el navegador y la persona lo envía por su cuenta a wa.me;
 * aquí sólo se cuentan aperturas / envíos / abandonos y, si el negocio lo activó, se guarda una copia como dato capturado.
 */
export function registerWaRequest(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const bump = (blockId: number, col: 'opens' | 'sends' | 'abandons', now: number) => {
    const day = new Date(now).toISOString().slice(0, 10)
    db.prepare(`INSERT INTO wa_stats (block_id, day, ${col}) VALUES (?, ?, 1) ON CONFLICT(block_id, day) DO UPDATE SET ${col} = ${col} + 1`).run(blockId, day)
  }

  app.post('/_/wa/:id', { config: { rateLimit: { max: 40, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const b = getBlock(db, Number((req.params as { id: string }).id))
    const link = b ? getLink(db, b.link_id) : undefined
    if (!b || b.type !== 'wa_request' || !link || availability(deps, link) !== 'ok' || !isUnlocked(deps, req, link) || !isConfirmed(deps, req, link) || !visibleBlocks([b], deps.now()).length) {
      return reply.callNotFound()
    }
    reply.header('Cache-Control', 'no-store')
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Body
    const ev = body.ev
    const now = deps.now()
    // el dueño probando su página no es estadística
    const own = req.ctx.user?.id === link.user_id
    if (ev === 'open' || ev === 'abandon') {
      if (!own) bump(b.id, ev === 'open' ? 'opens' : 'abandons', now)
      return reply.code(204).send()
    }
    if (ev !== 'send') return reply.code(422).send()
    if (!own) bump(b.id, 'sends', now)
    if (b.data.guardar_copia === false) return reply.code(204).send()

    const allowed = new Set(waKeys(b))
    const input = (body.fields && typeof body.fields === 'object' ? body.fields : {}) as Record<string, unknown>
    const fields: Record<string, string> = {}
    for (const k of Object.keys(input)) {
      if (!allowed.has(k)) continue
      const v = clean(input[k], 300)
      if (v) fields[k] = v
    }
    const message = clean(body.message, 1500)
    if (!message && !Object.keys(fields).length) return reply.code(422).send()
    const visitor = sha256(dailySalt(deps, new Date(now).toISOString().slice(0, 10)) + '|' + req.ip + '|' + String(req.headers['user-agent'] ?? '')).slice(0, 32)
    // doble toque en menos de un minuto: no se duplica
    if (db.prepare('SELECT 1 FROM collected WHERE block_id = ? AND visitor = ? AND created_at > ?').get(b.id, visitor, now - 60_000)) return reply.code(204).send()
    const data = {
      preset: String(b.data.preset ?? ''),
      ...(fields.nombre ? { name: fields.nombre } : {}),
      ...(fields.telefono ? { phone: fields.telefono } : {}),
      message,
      fields,
    }
    const id = Number(db.prepare("INSERT INTO collected (user_id, link_id, block_id, kind, data, visitor, created_at) VALUES (?, ?, ?, 'whatsapp', ?, ?, ?)").run(link.user_id, link.id, b.id, JSON.stringify(data), visitor, now).lastInsertRowid)
    const notice: Notice = {
      title: `Nueva solicitud por WhatsApp en /${link.alias}`,
      lines: [['solicitud', message], ...Object.entries(fields).map(([k, v]) => [k, v] as [string, string])],
      url: `${deps.config.baseUrl}/panel/data`,
      at: now,
      payload: { id, page: link.alias, block: b.type, kind: 'whatsapp', data },
    }
    notifyUser(db, link.user_id, { kind: 'capture', title: notice.title, body: message.slice(0, 300), url: '/panel/data' }, now)
    for (const tid of Array.isArray(b.data.targets) ? (b.data.targets as number[]) : []) {
      const t = getOwnTarget(deps, tid, link.user_id)
      if (t?.is_enabled) enqueue(deps, 'notify', { target_id: t.id, notice })
    }
    return reply.code(204).send()
  })
}

/** Aperturas / envíos / abandonos de un bloque en los últimos N días */
export function waTotals(db: AppDeps['db'], blockId: number, days: number, now: number): { opens: number; sends: number; abandons: number } {
  const since = new Date(now - days * 86400_000).toISOString().slice(0, 10)
  return (db.prepare('SELECT COALESCE(SUM(opens),0) AS opens, COALESCE(SUM(sends),0) AS sends, COALESCE(SUM(abandons),0) AS abandons FROM wa_stats WHERE block_id = ? AND day >= ?').get(blockId, since) as { opens: number; sends: number; abandons: number })
}
