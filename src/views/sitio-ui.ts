import { html, type SafeHtml } from '../lib/html.ts'
import type { Ctx } from '../web/context.ts'
import { ic } from './sprite.ts'

export type Fld = { ctx: Ctx; name: string; label: string; type?: string; value?: string; error?: string; hint?: string; placeholder?: string; autocomplete?: string; maxlength?: number; inputmode?: string; pattern?: string; autofocus?: boolean; required?: boolean }

const describedBy = (id: string, c: { hint?: string; error?: string }) => [c.hint ? `${id}-h` : '', c.error ? `${id}-e` : ''].filter(Boolean).join(' ')
const hintErr = (id: string, c: { hint?: string; error?: string; ctx: Ctx }): SafeHtml =>
  html`${c.hint ? html`<p class="hint" id="${id}-h">${c.hint}</p>` : ''}${c.error ? html`<p class="msg-e" id="${id}-e">${ic('alert')}<span>${c.ctx.t(c.error)}</span></p>` : ''}`

/** Campo del diseño nuevo (`.fld`): etiqueta, ayuda y error con texto e ícono (nunca solo color). */
export function fld(c: Fld): SafeHtml {
  const id = `f-${c.name}`
  const d = describedBy(id, c)
  return html`<div class="fld${c.error ? ' err' : ''}"><label for="${id}">${c.label}</label><input class="in" id="${id}" name="${c.name}" type="${c.type ?? 'text'}"${c.value && c.type !== 'password' ? html` value="${c.value}"` : ''}${c.placeholder ? html` placeholder="${c.placeholder}"` : ''}${c.required === false ? '' : html` required`}${c.autocomplete ? html` autocomplete="${c.autocomplete}"` : ''}${c.maxlength ? html` maxlength="${c.maxlength}"` : ''}${c.inputmode ? html` inputmode="${c.inputmode}"` : ''}${c.pattern ? html` pattern="${c.pattern}"` : ''}${c.autofocus ? html` autofocus` : ''}${d ? html` aria-describedby="${d}"` : ''}${c.error ? html` aria-invalid="true"` : ''}>${hintErr(id, c)}</div>`
}

export function fldSelect(c: Omit<Fld, 'type' | 'placeholder'> & { options: { value: string; label: string }[] }): SafeHtml {
  const id = `f-${c.name}`
  const d = describedBy(id, c)
  return html`<div class="fld${c.error ? ' err' : ''}"><label for="${id}">${c.label}</label><select class="sel" id="${id}" name="${c.name}"${d ? html` aria-describedby="${d}"` : ''}${c.error ? html` aria-invalid="true"` : ''}>${c.options.map((o) => html`<option value="${o.value}"${o.value === c.value ? html` selected` : ''}>${o.label}</option>`)}</select>${hintErr(id, c)}</div>`
}

export function fldTextarea(c: Omit<Fld, 'type'> & { rows?: number }): SafeHtml {
  const id = `f-${c.name}`
  const d = describedBy(id, c)
  return html`<div class="fld${c.error ? ' err' : ''}"><label for="${id}">${c.label}</label><textarea class="ta" id="${id}" name="${c.name}" rows="${c.rows ?? 5}"${c.placeholder ? html` placeholder="${c.placeholder}"` : ''}${c.required === false ? '' : html` required`}${c.maxlength ? html` maxlength="${c.maxlength}"` : ''}${d ? html` aria-describedby="${d}"` : ''}${c.error ? html` aria-invalid="true"` : ''}>${c.value ?? ''}</textarea>${hintErr(id, c)}</div>`
}
