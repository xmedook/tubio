/**
 * CSS por bloque, a prueba de abusos: sólo declaraciones «propiedad: valor» de una lista blanca, sin url(), @import,
 * expresiones, escapes, ni nada que pueda salirse de la regla (llaves, etiquetas, comentarios). Lo que no pasa se tira
 * en silencio. El resultado se aplica sólo dentro del bloque (#b<id> > *), así que tampoco puede tapar el resto de la
 * página: position fixed/absolute y z-index no están permitidos.
 */
const PROPS = new Set([
  'color', 'background', 'background-color', 'background-image', 'opacity',
  'border', 'border-color', 'border-width', 'border-style', 'border-radius', 'border-top', 'border-bottom', 'border-left', 'border-right',
  'outline', 'outline-offset',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'padding-inline', 'padding-block',
  'margin-top', 'margin-bottom', 'margin-inline', 'margin-block',
  'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height', 'text-align', 'text-transform', 'text-decoration', 'text-shadow', 'word-spacing',
  'box-shadow', 'filter', 'backdrop-filter', 'mix-blend-mode',
  'transform', 'rotate', 'scale', 'translate', 'transition',
  'max-width', 'min-height', 'width', 'aspect-ratio', 'object-fit', 'overflow',
  'display', 'gap', 'justify-content', 'align-items', 'flex-direction', 'flex-wrap', 'grid-template-columns',
  'animation-duration', 'animation-delay',
])
const DISPLAY = /^(block|flex|grid|inline-flex|inline-block|none)$/
const BAD = /url\s*\(|expression|javascript:|@|\\|<|>|\/\*|\*\/|var\s*\(\s*--(?!b-|btn-|text|bg|font)|attr\s*\(|image-set|element\s*\(/i
const MAX_DECLS = 30
const MAX_LEN = 2000

export function sanitizeCss(input: string): string {
  if (typeof input !== 'string') return ''
  const src = input.slice(0, MAX_LEN).replace(/[{}]/g, ';')
  const out: string[] = []
  for (const part of src.split(';')) {
    const i = part.indexOf(':')
    if (i < 1) continue
    const prop = part.slice(0, i).trim().toLowerCase()
    let value = part.slice(i + 1).trim().replace(/\s*!important\s*$/i, '')
    if (!PROPS.has(prop) || !value || value.length > 300) continue
    if (BAD.test(value) || /[;"'`]/.test(value)) continue
    if (prop === 'display' && !DISPLAY.test(value)) continue
    if ((prop === 'width' || prop === 'max-width') && /^-/.test(value)) continue
    value = value.replace(/\s+/g, ' ')
    out.push(`${prop}:${value}`)
    if (out.length >= MAX_DECLS) break
  }
  return out.join(';')
}
