// Portada: el teléfono de muestra repite lo que la persona escribe en el campo de dirección (sin enviar nada a ningún lado)
const input = document.querySelector('[data-eco-input]')
if (input) {
  const labels = [...document.querySelectorAll('[data-eco]')]
  const defaults = labels.map((el) => el.textContent)
  const pretty = (v) =>
    v
      .replace(/[-_]+/g, ' ')
      .trim()
      .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
  input.addEventListener('input', () => {
    const v = pretty(input.value)
    labels.forEach((el, i) => {
      el.textContent = v || defaults[i]
    })
  })
}
