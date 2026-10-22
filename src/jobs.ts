import type { FastifyBaseLogger } from 'fastify'
import type { AppDeps } from './app.ts'
import { purgeExpiredSessions } from './modules/auth/sessions.ts'

/** Tareas periódicas dentro del proceso (un solo host). Devuelve la función para detenerlas. */
export function runJobs(deps: AppDeps): Record<string, number> {
  const now = deps.now()
  return {
    sessions: purgeExpiredSessions(deps.db, now),
  }
}

export function startJobs(deps: AppDeps, log: FastifyBaseLogger): () => void {
  const tick = () => {
    try {
      const r = runJobs(deps)
      log.info({ jobs: r }, 'tareas periódicas')
    } catch (err) {
      log.error(err, 'tareas periódicas fallaron')
    }
  }
  const first = setTimeout(tick, 10_000)
  const every = setInterval(tick, 6 * 3600 * 1000)
  return () => {
    clearTimeout(first)
    clearInterval(every)
  }
}
