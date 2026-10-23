// tubio — mejoras progresivas del panel. Todo funciona sin JS.

// Confirmación en formularios destructivos: <form data-confirm="¿Seguro?">
document.addEventListener('submit', (e) => {
  const form = e.target
  if (form instanceof HTMLFormElement && form.dataset.confirm && !window.confirm(form.dataset.confirm)) e.preventDefault()
})

// Copiar al portapapeles: <button data-copy="texto">
document.addEventListener('click', async (e) => {
  const btn = e.target instanceof Element ? e.target.closest('[data-copy]') : null
  if (!btn) return
  try {
    await navigator.clipboard.writeText(btn.getAttribute('data-copy') ?? '')
    const old = btn.textContent
    btn.textContent = btn.getAttribute('data-copied') ?? '✓'
    setTimeout(() => { btn.textContent = old }, 1500)
  } catch { /* sin permiso: no pasa nada */ }
})

// lupa de la cabecera: enfocar la búsqueda de enlaces
if (new URLSearchParams(location.search).has('buscar')) {
  document.querySelector('.search-bar')?.removeAttribute('data-collapsed')
  document.querySelector('input[name="q"]')?.focus()
}
