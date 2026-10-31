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

// portada: el video sólo se carga si la persona no pidió menos movimiento ni ahorro de datos; con póster de respaldo
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const net = navigator.connection
const saver = !!net && (net.saveData || /(^|-)2g$/.test(net.effectiveType || ''))
for (const v of document.querySelectorAll('video[data-hero-src]')) {
  if (reduce || saver) continue
  const src = document.createElement('source')
  src.src = v.dataset.heroSrc
  src.type = v.dataset.heroType || 'video/mp4'
  v.append(src)
  v.load()
  v.play().then(() => v.classList.add('on')).catch(() => {})
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      for (const e of es) e.isIntersecting ? v.play().catch(() => {}) : v.pause()
    }).observe(v)
  }
  const btn = v.closest('.hero')?.querySelector('[data-hero-sound]')
  if (btn) {
    btn.hidden = false
    btn.addEventListener('click', () => {
      v.muted = !v.muted
      btn.setAttribute('aria-pressed', String(!v.muted))
      btn.firstElementChild.textContent = v.muted ? '🔇' : '🔊'
      v.play().catch(() => {})
    })
  }
}

// ubicación: el mapa de Google sólo se pide cuando alguien lo toca
for (const m of document.querySelectorAll('[data-loc]')) {
  const btn = m.querySelector('[data-loc-load]')
  if (!btn) continue
  btn.hidden = false
  btn.addEventListener('click', () => {
    const f = document.createElement('iframe')
    f.src = m.dataset.src
    f.title = m.dataset.title || 'Mapa'
    f.loading = 'lazy'
    f.referrerPolicy = 'no-referrer'
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups')
    m.replaceChildren(f)
  })
}
