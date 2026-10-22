import { join } from 'node:path'
import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { migrate, openDb } from './db/index.ts'
import { openGeo } from './lib/geo.ts'
import { FileMailer, SmtpMailer } from './lib/mail.ts'
import { startJobs } from './jobs.ts'

const config = loadConfig()
const db = openDb(config.dbPath)
const applied = migrate(db)
const mailer = config.smtpUrl ? new SmtpMailer(config.smtpUrl, config.mailFrom) : new FileMailer(join(config.dataDir, 'mail'), config.mailFrom)
const geo = await openGeo(process.env.TUBIO_GEO_DB ?? join(config.dataDir, 'geo/dbip-city-lite.mmdb'))
const deps = { config, db, mailer, geo, now: () => Date.now() }
const app = await buildApp(deps)
if (applied.length) app.log.info({ applied }, 'migraciones aplicadas')
const stopJobs = startJobs(deps, app.log)

await app.listen({ host: config.host, port: config.port })

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, async () => {
    stopJobs()
    await app.close()
    db.close()
    process.exit(0)
  })
}
