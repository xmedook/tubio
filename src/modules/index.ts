import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../app.ts'
import { registerAccount } from './account/routes.ts'
import { registerAuth } from './auth/routes.ts'
import { registerBio } from './bio/routes.ts'
import { registerHome } from './home/routes.ts'
import { registerLinks } from './links/routes.ts'
import { registerProjects } from './projects/routes.ts'
import { registerPublic } from './public/routes.ts'

/** Orden importa: el resolvedor público /:alias va al final. */
export function registerModules(app: FastifyInstance, deps: AppDeps): void {
  registerHome(app, deps)
  registerAuth(app, deps)
  registerAccount(app, deps)
  registerLinks(app, deps)
  registerProjects(app, deps)
  registerBio(app, deps)
  registerPublic(app, deps)
}
