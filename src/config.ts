import { resolve } from 'node:path'

export type Config = {
  env: 'development' | 'production' | 'test'
  host: string
  port: number
  /** URL pública sin barra final, p. ej. https://tubio.link */
  baseUrl: string
  /** Directorio de datos: BD, subidas, correo de desarrollo, base geo */
  dataDir: string
  /** Ruta de la BD; ':memory:' en tests */
  dbPath: string
  /** Secreto para firmar cookies (≥32 caracteres en producción) */
  secret: string
  /** smtp://usuario:clave@host:587 — vacío = escribir .eml en dataDir/mail */
  smtpUrl: string
  mailFrom: string
  /** Tamaño máximo de subida en bytes */
  maxUploadBytes: number
  /** Confiar en X-Forwarded-For (detrás de nginx) */
  trustProxy: boolean
}

function num(v: string | undefined, d: number): number {
  const n = Number(v)
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : d
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const e = process.env
  const env = (e.NODE_ENV === 'production' || e.NODE_ENV === 'test' ? e.NODE_ENV : 'development') as Config['env']
  const dataDir = resolve(overrides.dataDir ?? e.TUBIO_DATA_DIR ?? 'data')
  const cfg: Config = {
    env,
    host: e.TUBIO_HOST ?? '127.0.0.1',
    port: num(e.TUBIO_PORT, 3095),
    baseUrl: (e.TUBIO_BASE_URL ?? 'http://127.0.0.1:3095').replace(/\/+$/, ''),
    dataDir,
    dbPath: e.TUBIO_DB ?? resolve(dataDir, 'tubio.sqlite'),
    secret: e.TUBIO_SECRET ?? 'dev-secret-change-me-dev-secret-change-me',
    smtpUrl: e.TUBIO_SMTP_URL ?? '',
    mailFrom: e.TUBIO_MAIL_FROM ?? 'tubio <no-reply@tubio.link>',
    maxUploadBytes: num(e.TUBIO_MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
    trustProxy: e.TUBIO_TRUST_PROXY === '1',
    ...overrides,
  }
  if (cfg.env === 'production' && (cfg.secret.length < 32 || cfg.secret.startsWith('dev-secret'))) {
    throw new Error('TUBIO_SECRET debe tener al menos 32 caracteres en producción')
  }
  return cfg
}
