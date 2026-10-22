// tubio — cuenta regresiva de la página intermedia y botón continuar
const el = document.querySelector('[data-go]')
if (el) {
  const url = el.getAttribute('data-go')
  let n = Number(el.getAttribute('data-secs') || 0)
  const btn = document.querySelector('[data-go-btn]')
  const tick = () => {
    if (n <= 0) { location.replace(url); return }
    el.textContent = el.textContent.replace(/\d+/, String(n))
    n -= 1
    setTimeout(tick, 1000)
  }
  tick()
  btn?.addEventListener('click', () => { n = 0 })
}
