// tubio — página bio: compartir. < 1 KB, sin dependencias.
const col = document.querySelector('main.col')
function toast(msg) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.setAttribute('role', 'status')
  t.textContent = msg
  document.body.append(t)
  setTimeout(() => t.remove(), 1800)
}
document.addEventListener('click', async (e) => {
  const btn = e.target instanceof Element ? e.target.closest('[data-share]') : null
  if (!btn || !col) return
  const url = col.dataset.url || location.href
  const title = col.dataset.title || document.title
  if (navigator.share) {
    try { await navigator.share({ title, url }) } catch { /* cancelado */ }
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    toast(col.dataset.copied || '✓')
  } catch { /* sin portapapeles */ }
})

// copiar códigos de cupón
document.addEventListener('click', async (e) => {
  const btn = e.target instanceof Element ? e.target.closest('[data-copy]') : null
  if (!btn) return
  try { await navigator.clipboard.writeText(btn.getAttribute('data-copy') ?? ''); toast(btn.getAttribute('data-copied') || '✓') } catch { /* sin portapapeles */ }
})

// cuentas regresivas: el servidor pinta el valor inicial; aquí sólo avanza
for (const el of document.querySelectorAll('[data-countdown]')) {
  const target = Number(el.getAttribute('data-countdown'))
  const tick = () => {
    const left = Math.max(0, target - Date.now())
    if (left === 0) {
      const units = el.querySelector('.cd-units')
      if (units) units.outerHTML = ''
      if (!el.querySelector('.cd-done')) { const p = document.createElement('p'); p.className = 'cd-done'; p.textContent = el.getAttribute('data-done') ?? ''; el.append(p) }
      return
    }
    const set = (k, v) => { const b = el.querySelector(`[data-cd="${k}"]`); if (b) b.textContent = String(v).padStart(2, '0') }
    set('d', Math.floor(left / 864e5)); set('h', Math.floor((left % 864e5) / 36e5)); set('m', Math.floor((left % 36e5) / 6e4)); set('s', Math.floor((left % 6e4) / 1e3))
    setTimeout(tick, 1000)
  }
  tick()
}

// antes y después
for (const fig of document.querySelectorAll('[data-ba]')) {
  const r = fig.querySelector('.ba-range')
  r?.addEventListener('input', () => fig.style.setProperty('--pos', `${r.value}%`))
}
