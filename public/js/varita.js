// Varita: manda la descripción, muestra el avance real que llega en líneas JSON y abre el sitio terminado.
const root = document.querySelector('[data-varita]')
const form = root?.querySelector('[data-varita-form]')
const desc = root?.querySelector('[data-varita-desc]')
const steps = root?.querySelector('[data-varita-steps]')
const err = root?.querySelector('[data-varita-err]')

root?.addEventListener('click', (e) => {
  const chip = e.target instanceof Element ? e.target.closest('[data-varita-ex]') : null
  if (!chip || !desc) return
  desc.value = chip.getAttribute('data-varita-ex') ?? ''
  desc.focus()
})

/** Marca la etapa activa y deja hechas las anteriores */
function stage(name, n) {
  if (!steps) return
  const items = [...steps.querySelectorAll('li')]
  const idx = items.findIndex((li) => li.dataset.stage === name)
  items.forEach((li, i) => {
    li.classList.toggle('done', i < idx)
    li.classList.toggle('now', i === idx)
  })
  if (n && items[idx]) items[idx].querySelector('[data-n]').textContent = String(n)
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!desc || desc.value.trim().length < 20) {
    desc?.focus()
    return
  }
  err.hidden = true
  root.classList.add('working')
  form.querySelector('button[type=submit]').disabled = true
  steps.hidden = false
  steps.scrollIntoView({ block: 'center', behavior: 'smooth' })
  stage('reading')
  const fd = new FormData(form)
  const fail = (msg) => {
    root.classList.remove('working')
    steps.hidden = true
    err.textContent = msg
    err.hidden = false
    err.scrollIntoView({ block: 'center', behavior: 'smooth' })
    form.querySelector('button[type=submit]').disabled = false
  }
  try {
    const res = await fetch('/panel/varita', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': root.dataset.csrf ?? '' },
      body: JSON.stringify(Object.fromEntries(fd)),
    })
    if (!res.body) return fail('…')
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += value
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line) continue
        const m = JSON.parse(line)
        if (m.s) stage(m.s, m.n)
        if (m.error) return fail(m.msg || m.error)
        if (m.ok && m.go) {
          stage('done')
          location.assign(m.go)
          return
        }
      }
    }
    fail(err.dataset.generic || '…')
  } catch {
    fail(err.dataset.generic || '…')
  }
})
