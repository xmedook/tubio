// Home: «Prueba cómo se verá tu liga». Repite lo que la persona escribe en la vista previa y en la dirección de muestra, y lo lleva a los botones
// que van a «lo armamos por ti» o al registro. No envía nada a ningún lado.
const input = document.getElementById('neg')
if (input) {
  const url = document.getElementById('slug')
  const nombre = document.getElementById('nm')
  const links = [...document.querySelectorAll('[data-negocio-href]')]
  const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 24)
  const porDefecto = { url: url.textContent, nombre: nombre.textContent }
  input.addEventListener('input', () => {
    const v = input.value.trim()
    url.textContent = slug(v) || porDefecto.url
    nombre.textContent = v || porDefecto.nombre
    for (const a of links) {
      const base = a.getAttribute('data-negocio-href')
      const param = a.getAttribute('data-negocio-param') || 'negocio'
      a.setAttribute('href', v ? `${base}${base.includes('?') ? '&' : '?'}${param}=${encodeURIComponent(param === 'alias' ? slug(v) : v)}` : base)
    }
  })
}
