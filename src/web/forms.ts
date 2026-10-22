import type { z } from 'zod'
import type { Errors } from '../views/ui.ts'

export type FormBody = Record<string, string | string[] | undefined>

export type FormResult<T> = { ok: true; data: T } | { ok: false; errors: Errors }

/**
 * Valida el cuerpo de un formulario con zod. Los mensajes de zod son claves de i18n ("err.*");
 * los que no lo son se cambian por "err.invalid".
 */
export function parseForm<S extends z.ZodType>(schema: S, body: unknown): FormResult<z.infer<S>> {
  const r = schema.safeParse(body ?? {})
  if (r.success) return { ok: true, data: r.data }
  const errors: Errors = {}
  for (const issue of r.error.issues) {
    const key = issue.path.map(String).join('.') || '_form'
    if (!errors[key]) errors[key] = issue.message.startsWith('err.') ? issue.message : 'err.invalid'
  }
  return { ok: false, errors }
}

/** Primer valor de un campo como string */
export function field(body: unknown, key: string): string {
  const v = (body as FormBody | undefined)?.[key]
  if (Array.isArray(v)) return v[0] ?? ''
  return typeof v === 'string' ? v : ''
}

/** Todos los valores de un campo repetido */
export function fieldAll(body: unknown, key: string): string[] {
  const v = (body as FormBody | undefined)?.[key]
  if (Array.isArray(v)) return v
  return typeof v === 'string' ? [v] : []
}

export function checked(body: unknown, key: string): boolean {
  const v = field(body, key)
  return v === '1' || v === 'on' || v === 'true'
}
