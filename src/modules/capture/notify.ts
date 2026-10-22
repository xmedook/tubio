import { createHmac } from 'node:crypto'
import { ownerLimits } from '../plans/limits.ts'
import type { AppDeps } from '../../app.ts'
import { safeFetch } from '../../lib/safe-fetch.ts'
import { findUserById } from '../users/repo.ts'

export const TARGET_KINDS = ['email', 'webhook', 'slack', 'discord', 'telegram'] as const
export type TargetKind = (typeof TARGET_KINDS)[number]

export type Target = {
  id: number
  user_id: number
  kind: TargetKind
  name: string
  config: Record<string, string>
  is_enabled: number
  last_ok_at: number | null
  last_error: string | null
  created_at: number
}

type Raw = Omit<Target, 'config'> & { config: string }
const hydrate = (r: Raw): Target => {
  let config: Record<string, string> = {}
  try {
    config = JSON.parse(r.config)
  } catch {
    /* vacío */
  }
  return { ...r, config }
}

export function listTargets(deps: AppDeps, userId: number): Target[] {
  return (deps.db.prepare('SELECT * FROM notify_targets WHERE user_id = ? ORDER BY id').all(userId) as Raw[]).map(hydrate)
}

export function getOwnTarget(deps: AppDeps, id: number, userId: number): Target | undefined {
  const r = deps.db.prepare('SELECT * FROM notify_targets WHERE id = ? AND user_id = ?').get(id, userId) as Raw | undefined
  return r ? hydrate(r) : undefined
}

/** Valida la configuración de un destino. Devuelve la config limpia o la clave de error. */
export function validateTarget(kind: TargetKind, raw: Record<string, string>): { config: Record<string, string> } | { error: string; field: string } {
  const url = (raw.url ?? '').trim()
  switch (kind) {
    case 'email':
      return { config: {} } // siempre al correo de la cuenta (evita usar tubio para mandar spam)
    case 'webhook': {
      if (!/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) return { error: 'err.webhook_url', field: 'url' }
      return { config: { url, secret: (raw.secret ?? '').trim().slice(0, 200) } }
    }
    case 'slack':
      if (!/^https:\/\/hooks\.slack\.com\/services\/[\w/]+$/.test(url)) return { error: 'err.slack_url', field: 'url' }
      return { config: { url } }
    case 'discord':
      if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) return { error: 'err.discord_url', field: 'url' }
      return { config: { url } }
    case 'telegram': {
      const token = (raw.token ?? '').trim()
      const chat = (raw.chat_id ?? '').trim()
      if (!/^\d{5,15}:[\w-]{30,60}$/.test(token)) return { error: 'err.telegram_token', field: 'token' }
      if (!/^(-?\d{3,20}|@\w{5,32})$/.test(chat)) return { error: 'err.telegram_chat', field: 'chat_id' }
      return { config: { token, chat_id: chat } }
    }
  }
}

export type Notice = { title: string; lines: [string, string][]; url: string; at: number; payload: Record<string, unknown> }

function plain(n: Notice): string {
  return [n.title, '', ...n.lines.map(([k, v]) => `${k}: ${v}`), '', n.url].join('\n')
}

/** Entrega un aviso a un destino. Lanza si falla (la cola reintenta). */
export async function deliver(deps: AppDeps, t: Target, n: Notice): Promise<void> {
  const json = (body: unknown) => ({ method: 'POST' as const, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), timeoutMs: 10000 })
  const ok = (status: number) => {
    if (status < 200 || status >= 300) throw new Error(`http_${status}`)
  }
  // el plan pudo vencer después de configurar el destino: sólo se entrega lo que incluye hoy
  if (t.kind !== 'email' && !(ownerLimits(deps.db, t.user_id, deps.now())?.capture_targets ?? []).includes(t.kind)) throw new Error('plan_lapsed')
  switch (t.kind) {
    case 'email': {
      const u = findUserById(deps.db, t.user_id)
      if (!u) return
      await deps.mailer.send({ to: u.email, subject: `tubio: ${n.title}`, text: plain(n), button: 'Ver en tubio' })
      return
    }
    case 'webhook': {
      const body = JSON.stringify({ event: 'data.created', at: new Date(n.at).toISOString(), ...n.payload })
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (t.config.secret) headers['x-tubio-signature'] = 'sha256=' + createHmac('sha256', t.config.secret).update(body).digest('hex')
      const r = await safeFetch(t.config.url as string, { method: 'POST', headers, body, timeoutMs: 10000 })
      ok(r.status)
      return
    }
    case 'slack': {
      const r = await safeFetch(t.config.url as string, json({ text: plain(n) }))
      ok(r.status)
      return
    }
    case 'discord': {
      const r = await safeFetch(t.config.url as string, json({ content: plain(n).slice(0, 1900), allowed_mentions: { parse: [] } }))
      ok(r.status)
      return
    }
    case 'telegram': {
      const r = await safeFetch(`https://api.telegram.org/bot${t.config.token}/sendMessage`, json({ chat_id: t.config.chat_id, text: plain(n).slice(0, 4000), disable_web_page_preview: true }))
      ok(r.status)
      return
    }
  }
}

// --- cola ---

const BACKOFF = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 12 * 3600_000]

export function enqueue(deps: AppDeps, kind: string, payload: object, delayMs = 0): void {
  const now = deps.now()
  deps.db.prepare('INSERT INTO jobs (kind, payload, run_at, created_at) VALUES (?, ?, ?, ?)').run(kind, JSON.stringify(payload), now + delayMs, now)
}

/** Corre los trabajos vencidos; devuelve cuántos terminó */
export async function runQueue(deps: AppDeps, limit = 20): Promise<number> {
  const now = deps.now()
  const due = deps.db.prepare('SELECT * FROM jobs WHERE done_at IS NULL AND run_at <= ? ORDER BY run_at LIMIT ?').all(now, limit) as { id: number; kind: string; payload: string; attempts: number }[]
  let done = 0
  for (const j of due) {
    // reservar: evita que otra pasada lo tome mientras se entrega
    const claimed = deps.db.prepare('UPDATE jobs SET run_at = ? WHERE id = ? AND done_at IS NULL AND run_at <= ?').run(now + 10 * 60_000, j.id, now).changes
    if (!claimed) continue
    try {
      const p = JSON.parse(j.payload) as { target_id: number; notice: Notice }
      if (j.kind === 'notify') {
        const t = deps.db.prepare('SELECT * FROM notify_targets WHERE id = ?').get(p.target_id) as Raw | undefined
        if (t && t.is_enabled) {
          await deliver(deps, hydrate(t), p.notice)
          deps.db.prepare('UPDATE notify_targets SET last_ok_at = ?, last_error = NULL WHERE id = ?').run(deps.now(), t.id)
        }
      }
      deps.db.prepare('UPDATE jobs SET done_at = ?, attempts = attempts + 1, last_error = NULL WHERE id = ?').run(deps.now(), j.id)
      done++
    } catch (e) {
      const err = String((e as Error)?.message ?? e).slice(0, 200)
      const attempts = j.attempts + 1
      const p = JSON.parse(j.payload) as { target_id?: number }
      if (p.target_id) deps.db.prepare('UPDATE notify_targets SET last_error = ? WHERE id = ?').run(err, p.target_id)
      if (attempts > BACKOFF.length) deps.db.prepare('UPDATE jobs SET done_at = ?, attempts = ?, last_error = ? WHERE id = ?').run(deps.now(), attempts, `abandonado: ${err}`, j.id)
      else deps.db.prepare('UPDATE jobs SET run_at = ?, attempts = ?, last_error = ? WHERE id = ?').run(deps.now() + (BACKOFF[attempts - 1] as number), attempts, err, j.id)
    }
  }
  deps.db.prepare('DELETE FROM jobs WHERE done_at IS NOT NULL AND done_at < ?').run(now - 14 * 86400_000)
  return done
}
