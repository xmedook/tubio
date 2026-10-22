// npm run migrate — aplica migraciones pendientes a la BD configurada
import { loadConfig } from '../config.ts'
import { migrate, openDb } from './index.ts'

const config = loadConfig()
const db = openDb(config.dbPath)
const applied = migrate(db)
console.log(applied.length ? `aplicadas: ${applied.join(', ')}` : 'sin migraciones pendientes')
db.close()
