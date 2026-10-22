import type { AppDeps } from '../../app.ts'
import { html, type SafeHtml } from '../../lib/html.ts'
import { imageUrl, storeImage, UploadError, type MultipartData } from '../../lib/uploads.ts'
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
    if (f.kind === 'socials') {
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
      return select({ ctx, name: f.name, label, value: v[f.name] ?? f.default, options: f.options.map((o) => ({ value: o, label: t(`bio.o.${type}.${f.name}.${o}`) })) })
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
    case 'socials':
      return html`<fieldset><legend>${label}</legend><p class="hint">${t('bio.f.socials_hint')}</p>
  <div class="grid-2">${NETWORKS.map((n) =>
    input({ ctx, name: `social_${n.id}`, label: n.name, value: v[`social_${n.id}`], error: e[`social_${n.id}`], placeholder: n.placeholder, autocomplete: 'off' }),
  )}</div></fieldset>`
  }
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
      case 'socials': {
        const links: Record<string, string> = {}
        for (const n of NETWORKS) {
          const v = f(`social_${n.id}`).trim()
          if (!v) continue
          const url = normalizeSocial(n.id, v)
          if (!url) errors[`social_${n.id}`] = 'err.social'
          else links[n.id] = url
        }
        if (!Object.keys(links).length && !Object.keys(errors).some((k) => k.startsWith('social_'))) errors.social_instagram = 'err.socials_empty'
        data[spec.name] = links
        break
      }
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
  }
  if (existing) for (const spec of def.fields) if (spec.kind === 'image' && !(spec.name in data)) data[spec.name] = existing.data[spec.name] ?? null
  if (Object.keys(errors).length) {
    for (const spec of def.fields) if (spec.kind === 'image') values[spec.name] = typeof existing?.data[spec.name] === 'string' ? (existing.data[spec.name] as string) : ''
    return { ok: false, errors, values }
  }
  return { ok: true, input: { type: def.type, is_enabled: checked(body, 'is_enabled'), starts_at: startsAt, ends_at: endsAt, data, style } }
}
