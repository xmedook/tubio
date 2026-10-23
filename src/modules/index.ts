import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../app.ts'
import { registerAbuse } from './abuse/routes.ts'
import { registerAccount } from './account/routes.ts'
import { registerApi } from './api/routes.ts'
import { registerAdmin } from './admin/routes.ts'
import { registerGoogle } from './auth/google.ts'
import { registerAuth } from './auth/routes.ts'
import { registerBio } from './bio/routes.ts'
import { registerCapture } from './capture/routes.ts'
import { registerDomains } from './domains/routes.ts'
import { registerHome } from './home/routes.ts'
import { registerLegal } from './legal/routes.ts'
import { registerLinks } from './links/routes.ts'
import { registerPlans } from './plans/routes.ts'
import { registerMarketing } from './marketing/routes.ts'
import { registerCheckout } from './plans/checkout.ts'
import { registerProjects } from './projects/routes.ts'
import { registerPublic } from './public/routes.ts'
import { registerQr } from './qr/routes.ts'
import { registerStats } from './stats/routes.ts'
import { registerSite } from './site/routes.ts'
import { registerGrowth } from './growth/routes.ts'
import { registerHelp } from './help/routes.ts'
import { registerBulk } from './links/bulk.ts'
import { registerTemplates } from './templates/routes.ts'
import { registerTeam } from './team/routes.ts'

/** Orden importa: el resolvedor público /:alias va al final. */
export function registerModules(app: FastifyInstance, deps: AppDeps): void {
  registerHome(app, deps)
  registerLegal(app, deps)
  registerSite(app, deps)
  registerGrowth(app, deps)
  registerHelp(app, deps)
  registerBulk(app, deps)
  registerTemplates(app, deps)
  registerAuth(app, deps)
  registerGoogle(app, deps)
  registerAccount(app, deps)
  registerLinks(app, deps)
  registerProjects(app, deps)
  registerPlans(app, deps)
  registerMarketing(app, deps)
  registerCheckout(app, deps)
  registerBio(app, deps)
  registerCapture(app, deps)
  registerDomains(app, deps, deps.dnsResolver)
  registerStats(app, deps)
  registerTeam(app, deps)
  registerQr(app, deps)
  registerAdmin(app, deps)
  registerApi(app, deps)
  registerAbuse(app, deps)
  registerPublic(app, deps)
}
