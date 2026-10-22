// npm run backup-db — copia consistente de la BD (API de respaldo de SQLite, sirve con la app corriendo)
// a $TUBIO_DATA_DIR/backups/tubio-AAAA-MM-DD.sqlite; conserva los últimos 14.
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { loadConfig } from '../config.ts'

const config = loadConfig()
const dir = join(config.dataDir, 'backups')
mkdirSync(dir, { recursive: true })
const file = join(dir, `tubio-${new Date().toISOString().slice(0, 10)}.sqlite`)
const db = new Database(config.dbPath, { readonly: true })
await db.backup(file)
db.close()
const old = readdirSync(dir).filter((f) => /^tubio-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().slice(0, -14)
for (const f of old) rmSync(join(dir, f))
console.log(`respaldo: ${file}${old.length ? ` (borrados ${old.length} viejos)` : ''}`)
