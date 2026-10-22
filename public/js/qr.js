// tubio — vista previa en vivo del QR. Sin JS el botón «Vista previa» hace lo mismo recargando la página.
const form = document.querySelector('[data-qr-form]')
const box = document.querySelector('[data-qr-preview]')
let timer = 0
let lastUrl = ''
let seq = 0

async function refresh() {
  if (!(form instanceof HTMLFormElement) || !box) return
  const my = ++seq
  const fd = new FormData(form)
  fd.delete('_preview')
  try {
    const res = await fetch(form.dataset.previewUrl, { method: 'POST', body: fd })
    if (my !== seq || !res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.alt = ''
    img.src = url
    box.replaceChildren(img)
    if (lastUrl) URL.revokeObjectURL(lastUrl)
    lastUrl = url
  } catch { /* sin red: se queda la anterior */ }
}

if (form) {
  form.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(refresh, 300)
  })
  form.addEventListener('change', () => {
    clearTimeout(timer)
    timer = setTimeout(refresh, 100)
  })
  const btn = form.querySelector('[data-preview-btn]')
  btn?.addEventListener('click', (e) => {
    e.preventDefault()
    refresh()
  })
  refresh()
}
