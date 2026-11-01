import { html, raw, type SafeHtml } from '../../lib/html.ts'
import { renderMarkdown } from '../../lib/markdown.ts'
import type { Ctx } from '../../web/context.ts'
import { siteShell } from './shell-site.ts'

/**
 * Páginas de texto largo (ayuda y legales) con el diseño del sitio (bloque 6): título con kicker, índice lateral y prosa.
 * `renderMarkdown` entrega «#» como h2 y «##» como h3: el primero es el título de la página y cada h3 pasa a ser un h2 del artículo con índice.
 */
export function docPage(ctx: Ctx, o: { md: string; path: string; kicker: string; nav?: 'help'; crumb?: SafeHtml; tocLabel: string; description?: string; footer?: SafeHtml; extra?: SafeHtml }): SafeHtml {
  const rendered = renderMarkdown(o.md)
  const first = /^<h2>(.*?)<\/h2>/.exec(rendered)
  const title = first?.[1] ?? 'túbio'
  const rest = first ? rendered.slice(first[0].length) : rendered
  const toc: { id: string; text: string }[] = []
  let n = 0
  const body = rest
    .replace(/<h3>(.*?)<\/h3>/g, (_m, text: string) => {
      const id = `s${n++}`
      toc.push({ id, text })
      return `<h2 id="${id}">${text}</h2>`
    })
    .replace(/<h4>(.*?)<\/h4>/g, '<h3>$1</h3>')
  const plain = title.replace(/<[^>]+>/g, '')
  const content = html`
<section class="hero" style="padding-bottom:${o.crumb ? '16px' : '8px'}"><div class="wrap" style="${toc.length ? '' : 'max-width:46em'}">${o.crumb ?? html`<span class="k">${o.kicker}</span>`}</div></section>
<section class="sec" style="border-top:0;padding-top:0"><div class="wrap${toc.length ? ' doc' : ''}" style="${toc.length ? '' : 'max-width:46em'}">
${toc.length ? html`<nav class="toc" aria-label="${o.tocLabel}"><span class="k" style="margin-bottom:6px">${o.tocLabel}</span>${toc.map((x) => html`<a href="#${x.id}">${raw(x.text)}</a>`)}</nav>` : ''}
<article class="prose"><h1 class="h1" style="font-size:clamp(32px,7vw,48px);margin-bottom:16px">${raw(title)}</h1>${raw(body)}${o.extra ?? ''}</article></div></section>`
  return siteShell(ctx, {
    title: `${plain} · túbio`,
    description: o.description ?? plain,
    path: o.path,
    body: content,
    mainHref: ctx.user ? '/panel' : '/register',
    nav: o.nav,
  })
}
