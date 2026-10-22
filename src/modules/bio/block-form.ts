import type { AppDeps } from '../../app.ts'
import { html, type SafeHtml } from '../../lib/html.ts'
import { imageUrl, storeFile, storeImage, UploadError, type MultipartData } from '../../lib/uploads.ts'
import { BUTTON_SCHEMES, checkTarget, WEB_SCHEMES } from '../../lib/urls.ts'
import { checkbox, fromLocalInput, input, select, textarea, toLocalInput, type Errors } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import { checked, field } from '../../web/forms.ts'
import type { User } from '../users/repo.ts'
import { type BlockDef, type BlockRow, type BlockStyle, type FieldSpec } from './blocks.ts'
import { mediaUrl } from './embeds.ts'
import { NETWORKS, normalizeSocial } from './socials.ts'
import type { BlockInput } from './repo.ts'

export type BlockValues = Record<string, string>

const HEX = /^#[0-9a-f]{6}$/i

export function valuesFromBlock(def: BlockDef, b: BlockRow | undefined, tz: string): BlockValues {
  const v: BlockValues = { is_enabled: !b || b.is_enabled ? '1' : '' }
  for (const f of def.fields) {
    const d = b?.data[f.name]
    if (f.kind === 'rows') {
      const rows = Array.isArray(d) ? (d as Record<string, unknown>[]) : []
      rows.forEach((r, i) => {
        for (const c of f.columns) v[`${f.name}__${i}__${c.name}`] = r[c.name] === undefined || r[c.name] === null ? '' : String(r[c.name])
      })
      v[`${f.name}__count`] = String(rows.length)
    } else if (f.kind === 'images') v[f.name] = JSON.stringify(Array.isArray(d) ? d : [])
    else if (f.kind === 'datetime') v[f.name] = toLocalInput(typeof d === 'number' ? d : null, tz)
    else if (f.kind === 'number') v[f.name] = typeof d === 'number' ? String(d) : ''
    else if (f.kind === 'file') v[f.name] = d && typeof d === 'object' ? String((d as { name?: string }).name ?? '') : ''
    else if (f.kind === 'socials') {
      const links = (d ?? {}) as Record<string, string>
      for (const n of NETWORKS) v[`social_${n.id}`] = links[n.id] ?? ''
    } else if (f.kind === 'checkbox') v[f.name] = (b ? d : f.default) ? '1' : ''
    else if (f.kind === 'select') v[f.name] = typeof d === 'string' ? d : f.default
    else v[f.name] = typeof d === 'string' ? d : ''
  }
  v.starts_at = toLocalInput(b?.starts_at, tz)
  v.ends_at = toLocalInput(b?.ends_at, tz)
  v.style_text_color = b?.style.text_color ?? ''
  v.style_bg_color = b?.style.bg_color ?? ''
  v.style_border_color = b?.style.border_color ?? ''
  v.style_align = b?.style.align ?? 'inherit'
  return v
}

function fieldHtml(ctx: Ctx, f: FieldSpec, v: BlockValues, e: Errors, type: string): SafeHtml {
  const { t } = ctx
  const label = t(f.label)
  switch (f.kind) {
    case 'text':
      return input({ ctx, name: f.name, label, value: v[f.name], error: e[f.name], required: f.required, maxlength: f.max, placeholder: f.placeholder })
    case 'textarea':
      return textarea({ ctx, name: f.name, label, value: v[f.name], error: e[f.name], required: f.required, maxlength: f.max, rows: f.rows, hint: f.hint ? t(f.hint) : undefined })
    case 'url':
      return input({ ctx, name: f.name, label, value: v[f.name], error: e[f.name], required: f.required, placeholder: f.placeholder, inputmode: 'url', hint: f.schemes === 'button' ? t('bio.f.url_hint') : undefined })
    case 'embed':
      return input({ ctx, name: f.name, type: 'url', label, value: v[f.name], error: e[f.name], required: true, placeholder: f.placeholder, inputmode: 'url' })
    case 'media':
      return input({ ctx, name: f.name, type: 'url', label, value: v[f.name], error: e[f.name], required: true, placeholder: 'https://…', hint: t(f.media === 'video' ? 'bio.f.video_hint' : 'bio.f.audio_hint') })
    case 'select':
      return select({ ctx, name: f.name, label, value: v[f.name] ?? f.default, options: f.options.map((o) => ({ value: o, label: optLabel(t, `bio.o.${type}.${f.name}.${o}`, o) })) })
    case 'checkbox':
      return checkbox({ name: f.name, label, checked: !!v[f.name] })
    case 'image': {
      const cur = v[f.name]
      return html`<div class="img-field">
  ${cur ? html`<img class="img-preview" src="${imageUrl(cur)}" alt="">` : ''}
  ${input({ ctx, name: f.name, type: 'file', label: cur ? t('bio.f.replace_image') : label, error: e[f.name], required: f.required && !cur, accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif', hint: t('bio.f.image_hint') })}
  ${cur && !f.required ? checkbox({ name: `${f.name}__remove`, label: t('bio.f.remove_image') }) : ''}
</div>`
    }
    case 'rows': {
      const count = Number(v[`${f.name}__count`] ?? 0)
      const shown = Math.min(f.maxRows, Math.max(count + 2, f.minRows ?? 1, 3))
      return html`<fieldset class="rows"><legend>${label}</legend>
  <p class="hint">${t('bio.f.rows_hint', { n: f.maxRows })}</p>
  ${e[f.name] ? html`<p class="error" role="alert">${t(e[f.name] as string)}</p>` : ''}
  <ol class="rows-list">${Array.from({ length: shown }, (_, i) => html`<li class="row-item"><div class="grid-${Math.min(f.columns.length, 3)}">${f.columns.map((c) => {
        const name = `${f.name}__${i}__${c.name}`
        const lab = t(c.label)
        if (c.type === 'textarea') return textarea({ ctx, name, label: lab, value: v[name], maxlength: c.max, rows: 2, error: e[name] })
        if (c.type === 'select') return select({ ctx, name, label: lab, value: v[name], options: (c.options ?? []).map((o) => ({ value: o, label: optLabel(t, `bio.o.${type}.${c.name}.${o}`, o) })) })
        return input({ ctx, name, label: lab, value: v[name], maxlength: c.max, type: c.type === 'time' ? 'time' : c.type === 'number' ? 'number' : c.type === 'url' ? 'url' : 'text', error: e[name] })
      })}</div></li>`)}</ol>
</fieldset>`
    }
    case 'images': {
      let keys: string[] = []
      try {
        keys = JSON.parse(v[f.name] || '[]') as string[]
      } catch {
        keys = []
      }
      return html`<fieldset><legend>${label}</legend>
  ${keys.length ? html`<ul class="thumbs">${keys.map((k) => html`<li><img src="${imageUrl(k)}" alt="">${checkbox({ name: `${f.name}__remove__${k}`, label: t('bio.f.remove_image') })}</li>`)}</ul>` : ''}
  <input type="hidden" name="${f.name}__keep" value="${keys.join(',')}">
  <div class="field${e[f.name] ? ' has-error' : ''}"><label for="f-${f.name}-up">${t('bio.f.add_images', { n: f.max })}</label>
  <input id="f-${f.name}-up" type="file" name="${f.name}" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/avif">
  ${e[f.name] ? html`<p class="error" role="alert">${t(e[f.name] as string)}</p>` : ''}</div>
</fieldset>`
    }
    case 'datetime':
      return input({ ctx, name: f.name, type: 'datetime-local', label, value: v[f.name], error: e[f.name], required: f.required, hint: t('bio.f.tz_hint', { tz: ctx.user?.timezone ?? '' }) })
    case 'number':
      return input({ ctx, name: f.name, type: 'number', label, value: v[f.name], error: e[f.name], required: f.required, min: f.min, max: f.max, step: f.step ?? 1 })
    case 'file':
      return html`${v[f.name] ? html`<p>${t('links.current_file')}: <strong>${v[f.name]}</strong></p>` : ''}${input({ ctx, name: f.name, type: 'file', label: v[f.name] ? t('links.replace_file') : label, error: e[f.name], required: f.required && !v[f.name] })}`
    case 'socials':
      return html`<fieldset><legend>${label}</legend><p class="hint">${t('bio.f.socials_hint')}</p>
  <div class="grid-2">${NETWORKS.map((n) =>
    input({ ctx, name: `social_${n.id}`, label: n.name, value: v[`social_${n.id}`], error: e[`social_${n.id}`], placeholder: n.placeholder, autocomplete: 'off' }),
  )}</div></fieldset>`
  }
}

/** Opciones que son códigos (zonas horarias, monedas) no tienen traducción: se muestran tal cual */
function optLabel(t: Ctx['t'], key: string, raw: string): string {
  const v = t(key)
  return v === key ? raw.replace(/_/g, ' ') : v
}

export function blockFields(ctx: Ctx, def: BlockDef, v: BlockValues, e: Errors): SafeHtml {
  const { t } = ctx
  const isButton = def.clickable && def.type !== 'socials' && def.type !== 'image'
  return html`<div class="card">${def.fields.map((f) => fieldHtml(ctx, f, v, e, def.type))}
  ${checkbox({ name: 'is_enabled', label: t('bio.f.enabled'), checked: !!v.is_enabled })}
</div>
<details class="opt"${v.starts_at || v.ends_at || e.ends_at ? html` open` : ''}><summary>${t('links.opt_schedule')}</summary><div class="opt-body">
  <div class="grid-2">
    ${input({ ctx, name: 'starts_at', type: 'datetime-local', label: t('links.starts_at'), value: v.starts_at, error: e.starts_at })}
    ${input({ ctx, name: 'ends_at', type: 'datetime-local', label: t('links.ends_at'), value: v.ends_at, error: e.ends_at })}
  </div>
</div></details>
<details class="opt"${v.style_text_color || v.style_bg_color || v.style_border_color || (v.style_align && v.style_align !== 'inherit') ? html` open` : ''}><summary>${t('bio.f.style')}</summary><div class="opt-body">
  <p class="hint">${t('bio.f.style_hint')}</p>
  <div class="grid-3">
    ${colorOpt(ctx, 'style_text_color', t('bio.f.text_color'), v)}
    ${isButton ? colorOpt(ctx, 'style_bg_color', t('bio.f.bg_color'), v) : ''}
    ${isButton ? colorOpt(ctx, 'style_border_color', t('bio.f.border_color'), v) : ''}
  </div>
  ${select({ ctx, name: 'style_align', label: t('bio.f.align'), value: v.style_align, options: ['inherit', 'left', 'center', 'right'].map((a) => ({ value: a, label: t(`bio.align.${a}`) })) })}
</div></details>`
}

/** Color opcional: casilla "usar el del tema" + selector */
function colorOpt(ctx: Ctx, name: string, label: string, v: BlockValues): SafeHtml {
  const val = v[name] ?? ''
  return html`<div class="field color-opt">
  ${input({ ctx, name, type: 'color', label, value: val || '#000000' })}
  ${checkbox({ name: `${name}__theme`, label: ctx.t('bio.f.use_theme'), checked: !val })}
</div>`
}

export type ParsedBlock = { ok: true; input: BlockInput } | { ok: false; errors: Errors; values: BlockValues }

export async function parseBlockForm(
  deps: AppDeps,
  user: User,
  def: BlockDef,
  mp: MultipartData,
  existing: BlockRow | undefined,
  host: string,
): Promise<ParsedBlock> {
  const body = mp.fields
  const f = (k: string) => field(body, k)
  const errors: Errors = {}
  const values: BlockValues = {}
  for (const [k, val] of Object.entries(body)) if (k !== '_csrf') values[k] = Array.isArray(val) ? (val[0] ?? '') : val
  const data: Record<string, unknown> = {}
  const pendingImages: { name: string; buf: Buffer; filename: string; spec: Extract<FieldSpec, { kind: 'image' }> }[] = []
  const pendingMulti: { name: string; buf: Buffer; filename: string; maxDim: number }[] = []
  let pendingFile: { name: string; buf: Buffer; filename: string } | null = null

  for (const spec of def.fields) {
    const raw = f(spec.name).trim()
    switch (spec.kind) {
      case 'text':
      case 'textarea': {
        if (spec.required && !raw) errors[spec.name] = 'err.required'
        else if (raw.length > spec.max) errors[spec.name] = 'err.too_long'
        data[spec.name] = spec.kind === 'text' ? raw.replace(/\s+/g, ' ') : raw
        break
      }
      case 'url': {
        if (!raw) {
          if (spec.required) errors[spec.name] = 'err.required'
          data[spec.name] = ''
          break
        }
        const r = checkTarget(deps.db, raw, spec.schemes === 'button' ? BUTTON_SCHEMES : WEB_SCHEMES)
        if (!r.ok) errors[spec.name] = r.error
        else data[spec.name] = r.url
        break
      }
      case 'embed': {
        if (!raw) errors[spec.name] = 'err.required'
        else if (!spec.provider(raw, host)) errors[spec.name] = 'err.embed_url'
        data[spec.name] = raw
        break
      }
      case 'media': {
        const m = mediaUrl(raw, spec.media)
        if (!raw) errors[spec.name] = 'err.required'
        else if (!m) errors[spec.name] = spec.media === 'video' ? 'err.video_url' : 'err.audio_url'
        data[spec.name] = m ?? raw
        break
      }
      case 'select':
        data[spec.name] = spec.options.includes(raw) ? raw : spec.default
        break
      case 'checkbox':
        data[spec.name] = checked(body, spec.name)
        break
      case 'image': {
        const up = mp.files.find((x) => x.field === spec.name)
        const prev = typeof existing?.data[spec.name] === 'string' ? (existing.data[spec.name] as string) : null
        if (up) pendingImages.push({ name: spec.name, buf: up.buffer, filename: up.filename, spec })
        else if (checked(body, `${spec.name}__remove`) && !spec.required) data[spec.name] = null
        else data[spec.name] = prev
        if (spec.required && !up && !prev) errors[spec.name] = 'err.image_required'
        break
      }
      case 'rows': {
        const rows: Record<string, unknown>[] = []
        for (let i = 0; i < spec.maxRows + 3; i++) {
          const row: Record<string, unknown> = {}
          let any = false
          for (const c of spec.columns) {
            const key = `${spec.name}__${i}__${c.name}`
            const val = f(key).trim()
            if (val) any = true
            if (c.max && val.length > c.max) errors[key] = 'err.too_long'
            if (c.type === 'url' && val) {
              const r = checkTarget(deps.db, val, BUTTON_SCHEMES)
              if (!r.ok) errors[key] = r.error
              row[c.name] = r.ok ? r.url : val
            } else if (c.type === 'number') row[c.name] = val === '' ? null : Number(val)
            else if (c.type === 'time') row[c.name] = /^\d{2}:\d{2}$/.test(val) ? val : ''
            else if (c.type === 'select') row[c.name] = c.options?.includes(val) ? val : (c.options?.[0] ?? '')
            else row[c.name] = val
          }
          if (!any) continue
          for (const c of spec.columns) if (c.required && !String(row[c.name] ?? '').trim()) errors[`${spec.name}__${i}__${c.name}`] = 'err.required'
          rows.push(row)
        }
        if (rows.length > spec.maxRows) errors[spec.name] = 'err.too_many_rows'
        if (rows.length < (spec.minRows ?? 1)) errors[spec.name] = 'err.rows_empty'
        data[spec.name] = rows.slice(0, spec.maxRows)
        break
      }
      case 'images': {
        const keep = f(`${spec.name}__keep`).split(',').filter((k) => /^[\w-]+\.webp$/.test(k) && !checked(body, `${spec.name}__remove__${k}`))
        // sólo llaves que ya tenía el bloque (no se pueden "adoptar" imágenes ajenas)
        const prev = Array.isArray(existing?.data[spec.name]) ? (existing?.data[spec.name] as string[]) : []
        const kept = keep.filter((k) => prev.includes(k))
        const ups = mp.files.filter((x) => x.field === spec.name)
        if (kept.length + ups.length > spec.max) errors[spec.name] = 'err.too_many_images'
        else if (kept.length + ups.length === 0) errors[spec.name] = 'err.image_required'
        data[spec.name] = kept
        for (const up of ups) pendingMulti.push({ name: spec.name, buf: up.buffer, filename: up.filename, maxDim: spec.maxDim ?? 1400 })
        break
      }
      case 'datetime': {
        const ts = fromLocalInput(raw, user.timezone)
        if (spec.required && !ts) errors[spec.name] = 'err.required'
        data[spec.name] = ts
        break
      }
      case 'number': {
        if (!raw) {
          if (spec.required) errors[spec.name] = 'err.required'
          data[spec.name] = null
          break
        }
        const n = Number(raw)
        if (!Number.isFinite(n) || n < spec.min || n > spec.max) errors[spec.name] = 'err.invalid'
        data[spec.name] = n
        break
      }
      case 'file': {
        const up = mp.files.find((x) => x.field === spec.name)
        const prev = existing?.data[spec.name] ?? null
        if (up) pendingFile = { name: spec.name, buf: up.buffer, filename: up.filename }
        else data[spec.name] = prev
        if (spec.required && !up && !prev) errors[spec.name] = 'err.file_required'
        break
      }
      case 'socials': {
        const links: Record<string, string> = {}
        for (const n of NETWORKS) {
          const v = f(`social_${n.id}`).trim()
          if (!v) continue
          const url = normalizeSocial(n.id, v)
          const safe = url ? checkTarget(deps.db, url, BUTTON_SCHEMES) : null
          if (!url) errors[`social_${n.id}`] = 'err.social'
          else if (!safe?.ok) errors[`social_${n.id}`] = safe?.error ?? 'err.social'
          else links[n.id] = safe.url
        }
        if (!Object.keys(links).length && !Object.keys(errors).some((k) => k.startsWith('social_'))) errors.social_instagram = 'err.socials_empty'
        data[spec.name] = links
        break
      }
    }
  }

  if (def.prepare && !Object.keys(errors).length) {
    try {
      const r = await def.prepare(data, user.locale)
      if ('error' in r) errors[r.field] = r.error
      else Object.assign(data, r.data)
    } catch {
      errors[def.fields[0]?.name ?? '_form'] = 'err.remote_failed'
    }
  }

  const startsAt = fromLocalInput(f('starts_at'), user.timezone)
  const endsAt = fromLocalInput(f('ends_at'), user.timezone)
  if (startsAt && endsAt && endsAt <= startsAt) errors.ends_at = 'err.end_before_start'

  const style: BlockStyle = {}
  for (const k of ['text_color', 'bg_color', 'border_color'] as const) {
    const name = `style_${k}`
    if (!checked(body, `${name}__theme`) && HEX.test(f(name))) style[k] = f(name).toLowerCase()
  }
  const align = f('style_align')
  if (align === 'left' || align === 'center' || align === 'right') style.align = align
  values.style_text_color = style.text_color ?? ''
  values.style_bg_color = style.bg_color ?? ''
  values.style_border_color = style.border_color ?? ''

  // imágenes al final: sólo se guardan si el resto está bien
  if (!Object.keys(errors).length) {
    for (const p of pendingImages) {
      try {
        const stored = await storeImage(deps, user.id, p.buf, p.filename, { maxDim: p.spec.maxDim ?? 1200, square: p.spec.square ?? false })
        data[p.name] = stored.key
      } catch (e) {
        errors[p.name] = e instanceof UploadError ? e.key : 'err.upload_not_image'
      }
    }
    for (const p of pendingMulti) {
      try {
        const stored = await storeImage(deps, user.id, p.buf, p.filename, { maxDim: p.maxDim })
        ;(data[p.name] as string[]).push(stored.key)
      } catch (e) {
        errors[p.name] = e instanceof UploadError ? e.key : 'err.upload_not_image'
      }
    }
    if (pendingFile && !Object.keys(errors).length) {
      try {
        const stored = await storeFile(deps, user.id, pendingFile.buf, pendingFile.filename)
        data[pendingFile.name] = { file_id: stored.id, name: stored.original_name, size: stored.size, mime: stored.mime }
      } catch (e) {
        errors[pendingFile.name] = e instanceof UploadError ? e.key : 'err.invalid'
      }
    }
  }
  if (existing) for (const spec of def.fields) if (spec.kind === 'image' && !(spec.name in data)) data[spec.name] = existing.data[spec.name] ?? null
  if (Object.keys(errors).length) {
    for (const spec of def.fields) if (spec.kind === 'image') values[spec.name] = typeof existing?.data[spec.name] === 'string' ? (existing.data[spec.name] as string) : ''
    for (const spec of def.fields) if (spec.kind === 'images') values[spec.name] = JSON.stringify(Array.isArray(existing?.data[spec.name]) ? existing?.data[spec.name] : [])
    for (const spec of def.fields) if (spec.kind === 'rows') values[`${spec.name}__count`] = String(spec.maxRows)
    return { ok: false, errors, values }
  }
  return { ok: true, input: { type: def.type, is_enabled: checked(body, 'is_enabled'), starts_at: startsAt, ends_at: endsAt, data, style } }
}
