import type { AppDeps } from '../../app.ts'
import { aliasError, normalizeAlias, randomAlias } from '../../lib/alias.ts'
import { hashPassword } from '../../lib/crypto.ts'
import { eventSchema } from '../../lib/ical.ts'
import { storeFile, UploadError, type MultipartData } from '../../lib/uploads.ts'
import { checkTarget, UTM_KEYS, type Utm } from '../../lib/urls.ts'
import { vcardSchema } from '../../lib/vcard.ts'
import type { Errors } from '../../views/ui.ts'
import { fromLocalInput, toLocalInput } from '../../views/ui.ts'
import { checked, field } from '../../web/forms.ts'
import { getOwnProject } from '../projects/repo.ts'
import type { User } from '../users/repo.ts'
import { aliasTaken, type Link, type LinkInput, type LinkKind } from './repo.ts'

export type FormValues = Record<string, string>

export const VCARD_FIELDS = Object.keys(vcardSchema.shape) as (keyof typeof vcardSchema.shape)[]

/** Valores para pintar el formulario a partir de un enlace guardado */
export function valuesFromLink(link: Link, tz: string): FormValues {
  const v: FormValues = {
    alias: link.alias,
    title: link.title,
    project_id: link.project_id ? String(link.project_id) : '',
    target_url: link.target_url ?? '',
    redirect_code: String(link.redirect_code),
    is_enabled: link.is_enabled ? '1' : '',
    starts_at: toLocalInput(link.starts_at, tz),
    ends_at: toLocalInput(link.ends_at, tz),
    expired_url: link.expired_url ?? '',
    click_limit: link.click_limit ? String(link.click_limit) : '',
    limit_url: link.limit_url ?? '',
    has_password: link.password_hash ? '1' : '',
    is_sensitive: link.is_sensitive ? '1' : '',
    forward_query: link.forward_query ? '1' : '',
    public_stats: link.public_stats ? '1' : '',
  }
  for (const k of UTM_KEYS) v[k] = link.utm[k] ?? ''
  const d = link.data
  if (link.kind === 'vcard') for (const k of VCARD_FIELDS) v[`vc_${k}`] = String(d[k] ?? '')
  if (link.kind === 'event') {
    const etz = String(d.timezone ?? tz)
    v.ev_name = String(d.name ?? '')
    v.ev_description = String(d.description ?? '')
    v.ev_location = String(d.location ?? '')
    v.ev_url = String(d.url ?? '')
    v.ev_all_day = d.all_day ? '1' : ''
    v.ev_starts_at = toLocalInput(Number(d.starts_at) || null, etz)
    v.ev_ends_at = toLocalInput(Number(d.ends_at) || null, etz)
  }
  if (link.kind === 'file') v.file_name = String(d.file_name ?? '')
  return v
}

export function defaultValues(): FormValues {
  return { is_enabled: '1', redirect_code: '302' }
}

function optionalUrl(deps: AppDeps, raw: string, key: string, errors: Errors): string | null {
  if (!raw.trim()) return null
  const r = checkTarget(deps.db, raw)
  if (!r.ok) {
    errors[key] = r.error
    return null
  }
  return r.url
}

export type ParsedLink = { ok: true; input: LinkInput } | { ok: false; errors: Errors; values: FormValues }

/**
 * Valida el formulario de enlace (cualquier tipo). Para "archivo" guarda la subida.
 * `existing` = edición.
 */
export async function parseLinkForm(
  deps: AppDeps,
  user: User,
  kind: LinkKind,
  mp: MultipartData,
  existing?: Link,
): Promise<ParsedLink> {
  const body = mp.fields
  const f = (k: string) => field(body, k)
  const errors: Errors = {}
  const values: FormValues = {}
  for (const [k, v] of Object.entries(body)) if (k !== '_csrf' && k !== 'password') values[k] = Array.isArray(v) ? (v[0] ?? '') : v
  if (existing?.password_hash) values.has_password = '1'
  const tz = user.timezone

  // alias
  let alias = normalizeAlias(f('alias'))
  if (!alias && !existing) {
    do alias = randomAlias()
    while (aliasTaken(deps.db, alias))
  } else {
    const err = aliasError(alias)
    if (err) errors.alias = err
    else if (aliasTaken(deps.db, alias, existing?.id)) errors.alias = 'err.alias_taken'
  }
  values.alias = alias

  const title = f('title').trim()
  if (title.length > 120) errors.title = 'err.too_long'

  let projectId: number | null = null
  if (f('project_id')) {
    const p = getOwnProject(deps.db, Number(f('project_id')), user.id)
    if (p) projectId = p.id
  }

  // por tipo
  let target: string | null = null
  let redirect: LinkInput['redirect_code'] = 302
  let data: Record<string, unknown> = existing?.data ?? {}
  if (kind === 'short') {
    const r = checkTarget(deps.db, f('target_url'))
    if (!r.ok) errors.target_url = r.error
    else target = r.url
    const code = Number(f('redirect_code'))
    redirect = code === 301 || code === 307 || code === 308 ? code : 302
  } else if (kind === 'vcard') {
    const raw: Record<string, string> = {}
    for (const k of VCARD_FIELDS) raw[k] = f(`vc_${k}`)
    const r = vcardSchema.safeParse(raw)
    if (!r.success) for (const i of r.error.issues) errors[`vc_${String(i.path[0])}`] = 'err.too_long'
    else {
      if (!r.data.first_name && !r.data.last_name && !r.data.org) errors.vc_first_name = 'err.vcard_name'
      if (r.data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.data.email)) errors.vc_email = 'err.email'
      if (r.data.url) {
        const u = checkTarget(deps.db, r.data.url)
        if (!u.ok) errors.vc_url = u.error
        else r.data.url = u.url
      }
      data = r.data
    }
  } else if (kind === 'event') {
    const etz = existing && typeof existing.data.timezone === 'string' ? existing.data.timezone : tz
    const starts = fromLocalInput(f('ev_starts_at'), etz)
    const ends = fromLocalInput(f('ev_ends_at'), etz) ?? starts
    if (!starts) errors.ev_starts_at = 'err.required'
    else if (ends !== null && ends < starts) errors.ev_ends_at = 'err.end_before_start'
    let url = f('ev_url').trim()
    if (url) {
      const u = checkTarget(deps.db, url)
      if (!u.ok) errors.ev_url = u.error
      else url = u.url
    }
    const r = eventSchema.safeParse({
      name: f('ev_name'),
      description: f('ev_description'),
      location: f('ev_location'),
      url,
      starts_at: starts ?? 0,
      ends_at: ends ?? 0,
      all_day: checked(body, 'ev_all_day'),
      timezone: etz,
    })
    if (!r.success) for (const i of r.error.issues) errors[`ev_${String(i.path[0])}`] ??= i.message.startsWith('err.') ? i.message : 'err.invalid'
    else data = r.data
  } else if (kind === 'bio') {
    data = existing?.data ?? {}
  }

  // opciones comunes
  const startsAt = fromLocalInput(f('starts_at'), tz)
  const endsAt = fromLocalInput(f('ends_at'), tz)
  if (startsAt && endsAt && endsAt <= startsAt) errors.ends_at = 'err.end_before_start'
  const expiredUrl = optionalUrl(deps, f('expired_url'), 'expired_url', errors)
  let clickLimit: number | null = null
  if (f('click_limit').trim()) {
    const n = Number(f('click_limit'))
    if (!Number.isInteger(n) || n < 1 || n > 1e9) errors.click_limit = 'err.positive_int'
    else clickLimit = n
  }
  const limitUrl = optionalUrl(deps, f('limit_url'), 'limit_url', errors)
  const utm: Utm = {}
  for (const k of UTM_KEYS) {
    const v = f(k).trim()
    if (v.length > 100) errors[k] = 'err.too_long'
    else if (v) utm[k] = v
  }
  let passwordHash: string | null | undefined
  const pw = f('password')
  if (checked(body, 'remove_password')) passwordHash = null
  else if (pw) {
    if (pw.length > 100) errors.password = 'err.too_long'
    else passwordHash = await hashPassword(pw)
  }

  // archivo al final: sólo se guarda si todo lo demás está bien
  if (kind === 'file') {
    const up = mp.files.find((x) => x.field === 'file')
    if (!up && !existing) errors.file = 'err.file_required'
    if (up && Object.keys(errors).length === 0) {
      try {
        const stored = await storeFile(deps, user.id, up.buffer, up.filename)
        data = { file_id: stored.id, file_name: stored.original_name, mime: stored.mime, size: stored.size }
      } catch (e) {
        errors.file = e instanceof UploadError ? e.key : 'err.invalid'
      }
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors, values }
  return {
    ok: true,
    input: {
      project_id: projectId,
      alias,
      kind,
      title,
      target_url: target,
      redirect_code: redirect,
      data,
      is_enabled: checked(body, 'is_enabled'),
      starts_at: startsAt,
      ends_at: endsAt,
      expired_url: expiredUrl,
      click_limit: clickLimit,
      limit_url: limitUrl,
      ...(passwordHash !== undefined ? { password_hash: passwordHash } : {}),
      is_sensitive: checked(body, 'is_sensitive'),
      utm,
      forward_query: checked(body, 'forward_query'),
      public_stats: checked(body, 'public_stats'),
    },
  }
}
