import type { FastifyBaseLogger } from 'fastify'
import type { AppDeps } from './app.ts'
import { deleteStoredFile, type StoredFile } from './lib/uploads.ts'
import { purgeExpiredSessions } from './modules/auth/sessions.ts'
import { imageKeysInUse } from './modules/bio/repo.ts'
import { getSetting } from './modules/settings/repo.ts'
import { purgeStats } from './modules/stats/record.ts'
import { runQueue } from './modules/capture/notify.ts'

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

/** Tareas periódicas dentro del proceso (un solo host) */
export function runJobs(deps: AppDeps): Record<string, number> {
  const stats = purgeStats(deps, getSetting(deps.db, 'stats_retention_days'))
  return {
    sessions: purgeExpiredSessions(deps.db, deps.now()),
    stat_events: stats.events,
    stat_salts: stats.salts,
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
      last = { at: deps.now(), result, error: null }
      log.info({ jobs: result }, 'tareas periódicas')
    } catch (err) {
      last = { at: deps.now(), result: null, error: String(err) }
      log.error(err, 'tareas periódicas fallaron')
    }
  }
  const first = setTimeout(tick, 10_000)
  const every = setInterval(tick, 6 * 3600 * 1000)
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
