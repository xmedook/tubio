/**
 * Plantillas HTML con escape obligatorio.
 *
 *   html`<p>${texto}</p>`        → texto escapado
 *   html`<div>${raw(seguro)}</div>` → sin escapar (sólo para HTML ya generado por nosotros)
 *   html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>` → los arrays se concatenan
 *
 * null, undefined y false no imprimen nada.
 */

export class SafeHtml {
  readonly value: string
  constructor(value: string) {
    this.value = value
  }
  toString(): string {
    return this.value
  }
}

export type HtmlValue = SafeHtml | string | number | boolean | null | undefined | HtmlValue[]

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"'`]/g, (c) => ESC[c] as string)
}

export function raw(s: string): SafeHtml {
  return new SafeHtml(s)
}

function render(v: HtmlValue): string {
  if (v === null || v === undefined || v === false || v === true) return ''
  if (v instanceof SafeHtml) return v.value
  if (Array.isArray(v)) return v.map(render).join('')
  return esc(v)
}

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let out = strings[0] ?? ''
  for (let i = 0; i < values.length; i++) out += render(values[i]) + (strings[i + 1] ?? '')
  return new SafeHtml(out)
}

/** Atributos opcionales: attrs({ disabled: true, value: 'x', hidden: false }) → ` disabled value="x"` */
export function attrs(a: Record<string, string | number | boolean | null | undefined>): SafeHtml {
  let out = ''
  for (const [k, v] of Object.entries(a)) {
    if (v === null || v === undefined || v === false) continue
    out += v === true ? ` ${k}` : ` ${k}="${esc(v)}"`
  }
  return new SafeHtml(out)
}

/** Sólo colores #rgb/#rrggbb/#rrggbbaa: lo que puede ir dentro de CSS generado. */
export function cssColor(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : fallback
}

export function cssNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
