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
