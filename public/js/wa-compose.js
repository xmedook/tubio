// tubio — arma el mensaje de WhatsApp a partir de la plantilla (módulo puro, sin DOM: lo prueba vitest)
/** Rellena la plantilla; una frase cuyas variables quedaron TODAS vacías se descarta (no deja «Ocasión: .») */
export function compose(tpl, vals, extra) {
  const all = { ...extra, ...vals }
  return tpl
    .split('\n')
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .map((part) => {
          const vars = [...part.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
          if (vars.length && vars.every((k) => !all[k])) return ''
          return part.replace(/\{(\w+)\}/g, (_, k) => all[k] ?? '')
        })
        .filter(Boolean)
        .join(' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n')
}

