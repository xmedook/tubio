// tubio — carrusel de videos: sólo uno reproduce a la vez; el video se carga al tocar (póster mientras tanto). Sin dependencias.
for (const root of document.querySelectorAll('[data-vcar]')) {
  const stopAll = (except) => {
    for (const li of root.querySelectorAll('[data-vs].on')) {
      if (li === except) continue
      li.querySelector('iframe, video')?.remove()
      li.querySelector('[data-vs-snd]')?.setAttribute('hidden', '')
      li.querySelector('[data-vs-play]').hidden = false
      li.classList.remove('on')
    }
  }
  root.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null
    const play = t?.closest('[data-vs-play]')
    const snd = t?.closest('[data-vs-snd]')
    const li = (play ?? snd)?.closest('[data-vs]')
    if (!li) return
    if (snd) {
      const v = li.querySelector('video')
      if (!v) return
      v.muted = !v.muted
      snd.setAttribute('aria-pressed', String(!v.muted))
      snd.textContent = v.muted ? snd.dataset.on : snd.dataset.off
      return
    }
    stopAll(li)
    li.classList.add('on')
    play.hidden = true
    if (li.dataset.kind === 'embed') {
      const u = new URL(li.dataset.src)
      u.searchParams.set('autoplay', '1')
      const f = document.createElement('iframe')
      f.src = u.href
      f.title = play.getAttribute('aria-label') ?? ''
      f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'
      f.setAttribute('allowfullscreen', '')
      f.referrerPolicy = 'strict-origin-when-cross-origin'
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups')
      li.prepend(f)
    } else {
      const v = document.createElement('video')
      v.src = li.dataset.src
      v.muted = true
      v.loop = true
      v.playsInline = true
      v.autoplay = true
      v.controls = false
      li.prepend(v)
      v.play().catch(() => {})
      const b = li.querySelector('[data-vs-snd]')
      if (b) {
        b.hidden = false
        b.dataset.on = b.textContent
        b.dataset.off = b.dataset.offText ?? b.textContent
      }
    }
  })
}
