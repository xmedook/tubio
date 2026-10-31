// tubio — minisitio: alto real de la cabecera (para los saltos a anclas) y sección visible en la navegación. Sin dependencias.
const bar = document.querySelector('[data-ms-bar]')
if (bar) {
  const set = () => document.body.style.setProperty('--ms-bar-h', bar.offsetHeight + 'px')
  set()
  addEventListener('resize', set)
  const links = [...bar.querySelectorAll('.ms-nav a[href^="#"]')]
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]))
  if ('IntersectionObserver' in window && byId.size) {
    const seen = new Map()
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0)
        let best = null
        for (const [id, r] of seen) if (r > 0 && (!best || r > seen.get(best))) best = id
        for (const [id, a] of byId) a.setAttribute('aria-current', String(id === best))
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.2, 0.5, 1] },
    )
    for (const id of byId.keys()) {
      const s = document.getElementById(id)
      if (s) io.observe(s)
    }
  }
}
