// Onboarding: disponibilidad del usuario en vivo, sugerencias que llenan el campo y contador de la descripción.
const alias = document.querySelector('[data-ob-alias]')
if (alias) {
  const msg = document.getElementById('ob-msg')
  const url = alias.getAttribute('data-ob-alias')
  let timer = 0
  let seq = 0
  const check = () => {
    const v = alias.value.trim()
    if (!v) {
      msg.textContent = ''
      msg.classList.remove('error', 'ok')
      return
    }
    const my = ++seq
    fetch(`${url}?alias=${encodeURIComponent(v)}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        if (my !== seq) return
        msg.textContent = d.msg || ''
        msg.classList.toggle('error', !d.ok)
        msg.classList.toggle('ok', !!d.ok)
      })
      .catch(() => {})
  }
  alias.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(check, 250)
  })
  document.querySelectorAll('[data-ob-sug]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault()
      alias.value = a.getAttribute('data-ob-sug')
      check()
      alias.focus()
    }),
  )
  if (alias.value) check()
}
const bio = document.querySelector('[data-ob-count]')
if (bio) {
  const out = document.getElementById('ob-count')
  const upd = () => (out.textContent = String(bio.value.length))
  bio.addEventListener('input', upd)
  upd()
}
