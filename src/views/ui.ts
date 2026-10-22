import { attrs, html, type HtmlValue, type SafeHtml } from '../lib/html.ts'
import type { Ctx } from '../web/context.ts'

export type Errors = Record<string, string>

let fieldSeq = 0
function fid(name: string): string {
  fieldSeq = (fieldSeq + 1) % 1e6
  return `f-${name.replace(/[^\w-]/g, '_')}-${fieldSeq}`
}

export function csrfField(ctx: Ctx): SafeHtml {
  return html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`
}

type Common = {
  name: string
  label: string
  hint?: string | undefined
  error?: string | undefined
  ctx: Ctx
}

function wrap(c: Common, id: string, control: SafeHtml, extraClass = ''): SafeHtml {
  const hintId = c.hint ? `${id}-hint` : ''
  const errId = c.error ? `${id}-err` : ''
  return html`<div class="field${extraClass}${c.error ? ' has-error' : ''}">
  <label for="${id}">${c.label}</label>
  ${control}
  ${c.hint ? html`<p class="hint" id="${hintId}">${c.hint}</p>` : ''}
  ${c.error ? html`<p class="error" id="${errId}" role="alert">${c.ctx.t(c.error)}</p>` : ''}
</div>`
}

function describedBy(id: string, c: Common): string | undefined {
  const ids = [c.hint ? `${id}-hint` : '', c.error ? `${id}-err` : ''].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

export function input(
  c: Common & {
    type?: string
    value?: string | number | null | undefined
    required?: boolean
    placeholder?: string
    autocomplete?: string
    min?: string | number
    max?: string | number
    step?: string | number
    pattern?: string
    maxlength?: number
    inputmode?: string
    accept?: string
    autofocus?: boolean
  },
): SafeHtml {
  const id = fid(c.name)
  const control = html`<input${attrs({
    id,
    name: c.name,
    type: c.type ?? 'text',
    value: c.type === 'file' || c.type === 'password' ? undefined : (c.value ?? undefined),
    required: c.required,
    placeholder: c.placeholder,
    autocomplete: c.autocomplete,
    min: c.min,
    max: c.max,
    step: c.step,
    pattern: c.pattern,
    maxlength: c.maxlength,
    inputmode: c.inputmode,
    accept: c.accept,
    autofocus: c.autofocus,
    'aria-invalid': c.error ? 'true' : undefined,
    'aria-describedby': describedBy(id, c),
  })}>`
  return wrap(c, id, control, c.type === 'color' ? ' field-color' : '')
}

export function textarea(
  c: Common & { value?: string | null | undefined; rows?: number; maxlength?: number; required?: boolean },
): SafeHtml {
  const id = fid(c.name)
  const control = html`<textarea${attrs({
    id,
    name: c.name,
    rows: c.rows ?? 4,
    maxlength: c.maxlength,
    required: c.required,
    'aria-invalid': c.error ? 'true' : undefined,
    'aria-describedby': describedBy(id, c),
  })}>${c.value ?? ''}</textarea>`
  return wrap(c, id, control)
}

export type Option = { value: string; label: string }

export function select(c: Common & { options: Option[]; value?: string | number | null | undefined }): SafeHtml {
  const id = fid(c.name)
  const v = c.value === null || c.value === undefined ? '' : String(c.value)
  const control = html`<select${attrs({ id, name: c.name, 'aria-describedby': describedBy(id, c) })}>
    ${c.options.map((o) => html`<option${attrs({ value: o.value, selected: o.value === v })}>${o.label}</option>`)}
  </select>`
  return wrap(c, id, control)
}

export function checkbox(c: { name: string; label: string; checked?: boolean; hint?: string; value?: string }): SafeHtml {
  const id = fid(c.name)
  return html`<div class="field field-check">
  <input${attrs({ id, type: 'checkbox', name: c.name, value: c.value ?? '1', checked: c.checked })}>
  <label for="${id}">${c.label}</label>
  ${c.hint ? html`<p class="hint">${c.hint}</p>` : ''}
</div>`
}

export function flashBox(ctx: Ctx): SafeHtml {
  if (!ctx.flash) return html``
  return html`<div class="flash flash-${ctx.flash.type}" role="status">${ctx.t(ctx.flash.key, ctx.flash.vars)}</div>`
}

export function postButton(
  ctx: Ctx,
  action: string,
  label: string,
  opts: { cls?: string; confirm?: string; hidden?: Record<string, string> } = {},
): SafeHtml {
  return html`<form method="post" action="${action}" class="inline"${attrs({ 'data-confirm': opts.confirm })}>
    ${csrfField(ctx)}
    ${Object.entries(opts.hidden ?? {}).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
    <button type="submit" class="${opts.cls ?? 'btn'}">${label}</button>
  </form>`
}

export function emptyState(title: string, body: HtmlValue): SafeHtml {
  return html`<div class="empty"><p class="empty-title">${title}</p>${body}</div>`
}

/** Fecha/hora local para <input type="datetime-local"> en la zona del usuario */
export function toLocalInput(ts: number | null | undefined, timeZone: string): string {
  if (!ts) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ts)
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

/** Inverso de toLocalInput: interpreta "YYYY-MM-DDTHH:mm" en la zona dada */
export function fromLocalInput(v: string | undefined, timeZone: string): number | null {
  if (!v) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number]
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  // desfase de la zona en ese instante (dos pasadas por cambios de horario)
  let ts = asUtc
  for (let i = 0; i < 2; i++) {
    const local = toLocalInput(ts, timeZone)
    const lm = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
    if (!lm) break
    const [, ly, lmo, ld, lh, lmi] = lm.map(Number) as [number, number, number, number, number, number]
    ts += asUtc - Date.UTC(ly, lmo - 1, ld, lh, lmi)
  }
  return ts
}
