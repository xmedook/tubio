import { esc } from './html.ts'

/**
 * Markdown mínimo y seguro: todo el texto se escapa PRIMERO y luego se aplican reglas
 * que sólo generan etiquetas fijas. No hay forma de inyectar HTML ni atributos.
 *
 * Soporta: # títulos (h2–h4), **negritas**, *cursivas*, ~~tachado~~, `código`,
 * [texto](https://url), listas con - o 1., > citas y párrafos separados por línea en blanco.
 */

function safeHref(url: string): string | null {
  // url llega escapada; se desescapa sólo &amp; para validar
  const u = url.replace(/&amp;/g, '&')
  if (/^(https?:\/\/|mailto:)/i.test(u)) return esc(u)
  return null
}

function inline(s: string): string {
  // código primero para no tocar su contenido
  const codes: string[] = []
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${c}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
    const href = safeHref(url)
    return href ? `<a href="${href}" rel="nofollow noopener" target="_blank">${text}</a>` : m
  })
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)] ?? '')
}

export function renderMarkdown(src: string): string {
  const lines = esc(src.replace(/\r\n?/g, '\n')).split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null
  let quote: string[] = []

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`)
    list = null
  }
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`)
    quote = []
  }
  const flushAll = () => {
    flushPara()
    flushList()
    flushQuote()
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      flushAll()
      continue
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(t)
    if (h) {
      flushAll()
      const level = (h[1] as string).length + 1
      out.push(`<h${level}>${inline(h[2] as string)}</h${level}>`)
      continue
    }
    const ul = /^[-*]\s+(.+)$/.exec(t)
    const ol = /^\d+[.)]\s+(.+)$/.exec(t)
    if (ul || ol) {
      flushPara()
      flushQuote()
      const type = ul ? 'ul' : 'ol'
      if (!list || list.type !== type) {
        flushList()
        list = { type, items: [] }
      }
      list.items.push(((ul ?? ol) as RegExpExecArray)[1] as string)
      continue
    }
    const q = /^&gt;\s?(.*)$/.exec(t)
    if (q) {
      flushPara()
      flushList()
      quote.push(q[1] as string)
      continue
    }
    flushList()
    flushQuote()
    para.push(t)
  }
  flushAll()
  return out.join('')
}
