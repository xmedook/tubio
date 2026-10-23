// tubio — editor de bloques: ordenar arrastrando (SortableJS) y refrescar la vista previa.
const list = document.querySelector('[data-sortable]')
const frame = document.querySelector('[data-preview]')

function refreshPreview() {
  if (frame instanceof HTMLIFrameElement) frame.contentWindow?.location.reload()
}

function init() {
  if (!list || !('Sortable' in window)) return
  window.Sortable.create(list, {
    handle: '.handle',
    animation: 150,
    // en táctil: presión breve sobre la agarradera para no arrastrar al hacer scroll
    delay: 120,
    delayOnTouchOnly: true,
    ghostClass: 'drag-ghost',
    async onEnd() {
      const ids = [...list.querySelectorAll('li[data-id]')].map((li) => Number(li.getAttribute('data-id')))
      try {
        const res = await fetch(list.getAttribute('data-order-url'), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': list.getAttribute('data-csrf') ?? '' },
          body: JSON.stringify({ ids }),
        })
        if (!res.ok) throw new Error(String(res.status))
        refreshPreview()
      } catch {
        location.reload()
      }
    },
  })
}

// Sortable se carga con defer; los módulos corren después, pero por si acaso:
if (document.readyState === 'complete' || 'Sortable' in window) init()
else window.addEventListener('load', init, { once: true })

// Interruptor «Editar | Vista previa» (móvil). Sin JS queda oculto y se ven ambas partes.
const toggle = document.querySelector('[data-view-toggle]')
const editor = document.querySelector('[data-editor]')
if (toggle && editor) {
  toggle.hidden = false
  editor.classList.add('has-toggle')
  toggle.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-view]') : null
    if (!btn) return
    const view = btn.getAttribute('data-view')
    editor.dataset.view = view
    for (const b of toggle.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b === btn))
    if (view === 'preview') refreshPreview()
  })
}

// Buscar en «Añadir bloque»
const q = document.querySelector('[data-pick-search]')
if (q instanceof HTMLInputElement) {
  q.addEventListener('input', () => {
    const term = q.value.trim().toLowerCase()
    for (const pick of document.querySelectorAll('.add-block .pick')) pick.hidden = !!term && !pick.textContent.toLowerCase().includes(term)
    for (const h of document.querySelectorAll('[data-pick-group]')) {
      const grid = h.nextElementSibling
      const any = grid && [...grid.querySelectorAll('.pick')].some((p) => !p.hidden)
      h.hidden = !any
      if (grid) grid.hidden = !any
    }
  })
}

// Interruptor «Mostrar» de cada bloque: sin recargar (sin JS es un formulario normal)
for (const form of document.querySelectorAll('form[data-toggle]')) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('[role="switch"]')
    const on = btn?.getAttribute('aria-checked') !== 'true'
    btn?.setAttribute('aria-checked', String(on))
    form.closest('li')?.classList.toggle('off', !on)
    try {
      const res = await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)), redirect: 'manual' })
      if (res.status >= 400) throw new Error(String(res.status))
      refreshPreview()
    } catch {
      location.reload()
    }
  })
}
