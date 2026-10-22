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
