import type { FastifyBaseLogger } from 'fastify'
import type { AppDeps } from './app.ts'
import { deleteStoredFile, type StoredFile } from './lib/uploads.ts'
import { purgeExpiredSessions } from './modules/auth/sessions.ts'
import { imageKeysInUse } from './modules/bio/repo.ts'
import { getSetting } from './modules/settings/repo.ts'
import { purgeStats } from './modules/stats/record.ts'
import { runQueue } from './modules/capture/notify.ts'
import { listPlans } from './modules/plans/limits.ts'
import { translator, type Locale } from './lib/i18n.ts'

/** Imágenes que ya nadie usa (bloque borrado, imagen reemplazada) y con más de un día */
export function purgeOrphanImages(deps: AppDeps): number {
  const cutoff = deps.now() - 86400_000
  const users = deps.db.prepare("SELECT DISTINCT user_id FROM files WHERE kind = 'image' AND created_at < ?").pluck().all(cutoff) as number[]
  let n = 0
  for (const userId of users) {
    const inUse = imageKeysInUse(deps.db, userId)
    const qrLogos = new Set(deps.db.prepare('SELECT logo_file_id FROM qr_codes WHERE user_id = ? AND logo_file_id IS NOT NULL').pluck().all(userId) as number[])
    const files = deps.db.prepare("SELECT * FROM files WHERE user_id = ? AND kind = 'image' AND created_at < ?").all(userId, cutoff) as StoredFile[]
    for (const f of files) {
      if (inUse.has(f.key) || qrLogos.has(f.id)) continue
      deleteStoredFile(deps, f)
      n++
    }
  }
  return n
}

/** Retención por plan: borra eventos más viejos que los días del plan vigente de cada dueño */
export function purgeStatsByPlan(deps: AppDeps): number {
  const now = deps.now()
  let n = 0
  for (const p of listPlans(deps.db)) {
    if (p.limits.stats_days < 0) continue
    const cutoff = now - p.limits.stats_days * 86400_000
    const cond =
      p.slug === 'free'
        ? '(u.plan_id IS NULL OR (u.plan_expires_at IS NOT NULL AND u.plan_expires_at <= @now))'
        : 'u.plan_id = @plan AND (u.plan_expires_at IS NULL OR u.plan_expires_at > @now)'
    n += deps.db
      .prepare(`DELETE FROM stat_events WHERE ts < @cutoff AND link_id IN (SELECT l.id FROM links l JOIN users u ON u.id = l.user_id WHERE u.role != 'admin' AND ${cond})`)
      .run({ cutoff, now, plan: p.id }).changes
  }
  return n
}

/** Aviso por correo 7 días y 1 día antes de que venza un plan (una vez cada uno) */
export async function remindExpiring(deps: AppDeps): Promise<number> {
  const now = deps.now()
  let n = 0
  for (const [days, key] of [[7, 'remind7'], [1, 'remind1']] as const) {
    const rows = deps.db
      .prepare(
        `SELECT u.id, u.email, u.locale, u.plan_expires_at, p.name FROM users u JOIN plans p ON p.id = u.plan_id
         WHERE u.plan_expires_at > @now AND u.plan_expires_at <= @until
         AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.user_id = u.id AND a.action = @action AND a.target = CAST(u.plan_expires_at AS TEXT))`,
      )
      .all({ now, until: now + days * 86400_000, action: `plan.${key}` }) as { id: number; email: string; locale: string; plan_expires_at: number; name: string }[]
    for (const r of rows) {
      const t = translator(r.locale as Locale)
      await deps.mailer.send({
        to: r.email,
        subject: t('mail.plan_expiring_subject', { plan: r.name, n: days }),
        text: t('mail.plan_expiring_body', { plan: r.name, date: new Intl.DateTimeFormat(r.locale, { dateStyle: 'long' }).format(r.plan_expires_at), link: `${deps.config.baseUrl}/panel/plan` }),
        button: t('plan.title'),
      })
      deps.db.prepare("INSERT INTO audit_log (user_id, action, target, meta, ts) VALUES (?, ?, ?, '{}', ?)").run(r.id, `plan.${key}`, String(r.plan_expires_at), now)
      n++
    }
  }
  return n
}

/** Lunes (en la zona de cada quien): resumen de la semana por correo a quien tuvo visitas */
export async function weeklyReports(deps: AppDeps): Promise<number> {
  const now = deps.now()
  const WEEK = 7 * 86400_000
  let n = 0
  const users = deps.db.prepare("SELECT id, email, locale, timezone FROM users WHERE report_weekly = 1 AND status = 'active' AND email_verified_at IS NOT NULL").all() as { id: number; email: string; locale: string; timezone: string }[]
  for (const u of users) {
    const tz = u.timezone || 'America/Mexico_City'
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now)
    if (parts.find((p) => p.type === 'weekday')?.value !== 'Mon' || Number(parts.find((p) => p.type === 'hour')?.value) < 8) continue
    const week = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
    if (deps.db.prepare("SELECT 1 FROM audit_log WHERE user_id = ? AND action = 'report.weekly' AND target = ?").get(u.id, week)) continue
    const tot = (from: number, to: number) => deps.db.prepare("SELECT SUM(e.kind = 'view') AS v, SUM(e.kind = 'click') AS c FROM stat_events e JOIN links l ON l.id = e.link_id WHERE l.user_id = ? AND e.ts >= ? AND e.ts < ?").get(u.id, from, to) as { v: number | null; c: number | null }
    const cur = tot(now - WEEK, now)
    const prev = tot(now - 2 * WEEK, now - WEEK)
    deps.db.prepare("INSERT INTO audit_log (user_id, action, target, meta, ts) VALUES (?, 'report.weekly', ?, '{}', ?)").run(u.id, week, now)
    if (!cur.v && !cur.c) continue // semana sin movimiento: no se escribe
    const top = deps.db.prepare("SELECT COALESCE(NULLIF(l.title, ''), l.alias) AS name, COUNT(*) AS n FROM stat_events e JOIN links l ON l.id = e.link_id WHERE l.user_id = ? AND e.ts >= ? GROUP BY l.id ORDER BY n DESC LIMIT 3").all(u.id, now - WEEK) as { name: string; n: number }[]
    const t = translator(u.locale as Locale)
    const fmt = (x: number | null) => new Intl.NumberFormat(u.locale).format(x ?? 0)
    const delta = prev.v ? Math.round((((cur.v ?? 0) - prev.v) / prev.v) * 100) : null
    await deps.mailer.send({
      to: u.email,
      subject: t('mail.weekly_subject', { views: fmt(cur.v) }),
      text: [
        t('mail.weekly_intro'),
        '',
        `${t('stats.views')}: ${fmt(cur.v)}${delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${delta} %)`}`,
        `${t('stats.clicks')}: ${fmt(cur.c)}`,
        ...(top.length ? ['', t('mail.weekly_top'), ...top.map((x, i) => `${i + 1}. ${x.name} — ${fmt(x.n)}`)] : []),
        '',
        `${deps.config.baseUrl}/panel/stats`,
        '',
        t('mail.weekly_off'),
      ].join('\n'),
      button: t('stats.title'),
    })
    n++
  }
  return n
}

/** Tareas periódicas dentro del proceso (un solo host) */
export function runJobs(deps: AppDeps): Record<string, number> {
  const stats = purgeStats(deps, getSetting(deps.db, 'stats_retention_days'))
  return {
    sessions: purgeExpiredSessions(deps.db, deps.now()),
    stat_events: stats.events,
    stat_salts: stats.salts,
    stat_events_plan: purgeStatsByPlan(deps),
    orphan_images: purgeOrphanImages(deps),
  }
}

let last: { at: number | null; result: Record<string, number> | null; error: string | null } = { at: null, result: null, error: null }
/** Última corrida de las tareas (para el panel de admin) */
export function jobStatus() {
  return last
}

export function startJobs(deps: AppDeps, log: FastifyBaseLogger): () => void {
  const tick = () => {
    try {
      const result = runJobs(deps)
      void remindExpiring(deps).catch((err) => log.error(err, 'recordatorios de plan fallaron'))
      void weeklyReports(deps).catch((err) => log.error(err, 'reportes semanales fallaron'))
      last = { at: deps.now(), result, error: null }
      log.info({ jobs: result }, 'tareas periódicas')
    } catch (err) {
      last = { at: deps.now(), result: null, error: String(err) }
      log.error(err, 'tareas periódicas fallaron')
    }
  }
  const first = setTimeout(tick, 10_000)
  // cada hora: el reporte semanal sale el lunes desde las 8:00 de cada zona
  const every = setInterval(tick, 3600 * 1000)
  // cola de avisos: cada 10 s
  let busy = false
  const queue = setInterval(() => {
    if (busy) return
    busy = true
    runQueue(deps)
      .catch((err) => log.error(err, 'cola de avisos falló'))
      .finally(() => (busy = false))
  }, 10_000)
  return () => {
    clearTimeout(first)
    clearInterval(every)
    clearInterval(queue)
  }
}
