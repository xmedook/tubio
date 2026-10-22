// npm run create-admin -- correo@dominio "contraseña"  — crea un admin o promueve una cuenta existente
import { loadConfig } from '../config.ts'
import { migrate, openDb } from '../db/index.ts'
import { hashPassword } from '../lib/crypto.ts'
import { createUser, findUserByEmail, updateUser } from '../modules/users/repo.ts'

const [email, password] = process.argv.slice(2)
if (!email) {
  console.error('uso: npm run create-admin -- correo@dominio [contraseña]')
  process.exit(1)
}
const db = openDb(loadConfig().dbPath)
migrate(db)
const existing = findUserByEmail(db, email)
if (existing) {
  updateUser(db, existing.id, { role: 'admin', ...(password ? { password_hash: await hashPassword(password) } : {}) })
  console.log(`promovido a admin: ${existing.email}`)
} else {
  if (!password || password.length < 10) {
    console.error('para una cuenta nueva hace falta contraseña de al menos 10 caracteres')
    process.exit(1)
  }
  const u = createUser(db, { email, passwordHash: await hashPassword(password), role: 'admin' })
  updateUser(db, u.id, { email_verified_at: Date.now() })
  console.log(`admin creado: ${u.email}`)
}
db.close()
