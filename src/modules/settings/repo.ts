import type { DB } from '../../db/index.ts'

/** Ajustes globales con sus valores por defecto. */
export const SETTING_DEFAULTS = {
  site_name: 'tubio',
  registration_open: true,
  stats_retention_days: 365,
  /** Muestra "hecho con tubio" en las páginas bio (el usuario puede ocultarlo si esto es false) */
  branding_forced: false,
  /** Aviso del sistema arriba del panel (vacío = ninguno) */
  announcement: '',
  announcement_level: 'info' as 'info' | 'warn',
  /** Mantenimiento: el panel se cierra a no-admins; los enlaces públicos siguen funcionando */
  maintenance: false,
  /** Comisión de afiliados (% del pago) */
  referral_percent: 20,
  /** Temas que ya no se ofrecen al elegir diseño (quien ya lo usa lo conserva) */
  themes_hidden: [] as string[],
  /** Tema de las páginas nuevas ('' = el del sistema) */
  default_theme: '',
  /** Fundadores: un año del plan más alto para las primeras N cuentas con correo confirmado */
  founders_open: true,
  founders_max: 100,
  founders_plan: 'business',
  founders_days: 365,
  /** WhatsApp de ventas de tubio (E.164 sin +): botón de la portada; vacío = sin botón */
  sales_whatsapp: '',
}
export type Settings = typeof SETTING_DEFAULTS
export type SettingKey = keyof Settings

export function getSetting<K extends SettingKey>(db: DB, key: K): Settings[K] {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key) as string | undefined
  if (row === undefined) return SETTING_DEFAULTS[key]
  try {
    return JSON.parse(row) as Settings[K]
  } catch {
    return SETTING_DEFAULTS[key]
  }
}

export function getSettings(db: DB): Settings {
  const out = { ...SETTING_DEFAULTS }
  for (const k of Object.keys(SETTING_DEFAULTS) as SettingKey[]) (out as Record<string, unknown>)[k] = getSetting(db, k)
  return out
}

export function setSetting<K extends SettingKey>(db: DB, key: K, value: Settings[K]): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  )
}

export function audit(
  db: DB,
  e: { actorId?: number | null; userId?: number | null; action: string; target?: string; meta?: object },
  now = Date.now(),
): void {
  db.prepare('INSERT INTO audit_log (actor_id, user_id, action, target, meta, ts) VALUES (?, ?, ?, ?, ?, ?)').run(
    e.actorId ?? null,
    e.userId ?? null,
    e.action,
    e.target ?? '',
    JSON.stringify(e.meta ?? {}),
    now,
  )
}
