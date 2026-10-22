import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../app.ts'
import { registerAuth } from './auth/routes.ts'
import { registerHome } from './home/routes.ts'
import { registerLinks } from './links/routes.ts'

/** Orden importa: el resolvedor público /:alias va al final. */
export function registerModules(app: FastifyInstance, deps: AppDeps): void {
  registerHome(app, deps)
  registerAuth(app, deps)
  registerLinks(app, deps)
}
