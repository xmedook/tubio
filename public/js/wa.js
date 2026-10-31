// tubio — Solicitud por WhatsApp. El mensaje se arma AQUÍ, en el navegador; nada sale hasta que la persona toca «Enviar».
// Mide (sin datos personales) aperturas de la hoja, envíos y abandonos. Sin dependencias.
import { compose } from './wa-compose.js'

const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Line\/|Snapchat/i.test(navigator.userAgent)
const lang = document.documentElement.lang || 'es'

function ping(root, ev, extra) {
  const f = root.querySelector('[data-wa-form]')
  const body = JSON.stringify({ ev, ...(extra ?? {}) })
  try {
    fetch(`/_/wa/${f.dataset.block}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': f.dataset.csrf }, body, keepalive: true }).catch(() => {})
  } catch {
    /* sin red: no pasa nada */
  }
}

/** Lee los valores del formulario como { clave: texto } (varios = unidos con coma) */
function values(form) {
  const out = {}
  for (const el of form.querySelectorAll('input, select, textarea')) {
    if (!el.name) continue
    if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value
    } else if (el.type === 'checkbox') {
      if (el.checked) out[el.name] = out[el.name] ? `${out[el.name]}, ${el.value}` : el.value
    } else if (el.value) {
      out[el.name] = el.type === 'date' ? fmtDate(el.value) : el.value.trim()
    }
  }
  return out
}

function fmtDate(v) {
  const d = new Date(`${v}T12:00:00`)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })
}

for (const root of document.querySelectorAll('[data-wa]')) {
  const open = root.querySelector('[data-wa-open]')
  const sheet = root.querySelector('[data-wa-sheet]')
  const form = root.querySelector('[data-wa-form]')
  if (!open || !sheet || !form || typeof sheet.showModal !== 'function') continue // sin <dialog>: queda el enlace directo
  let sent = false
  let touched = false
  const today = new Date().toISOString().slice(0, 10)
  for (const d of form.querySelectorAll('[data-wa-date]')) d.min = today

  open.addEventListener('click', (e) => {
    e.preventDefault()
    sent = false
    touched = false
    sheet.showModal()
    ping(root, 'open')
  })
  form.addEventListener('input', () => {
    touched = true
    form.querySelector('[data-wa-err]').hidden = true
  })
  const close = () => sheet.close()
  root.querySelector('[data-wa-close]')?.addEventListener('click', close)
  // tocar fuera de la hoja la cierra
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close()
  })
  sheet.addEventListener('close', () => {
    if (!sent) ping(root, 'abandon', { touched })
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const err = form.querySelector('[data-wa-err]')
    // requeridos de grupos de radios (el atributo required va en el primero)
    const missing = [...form.querySelectorAll('[required]')].find((el) => (el.type === 'radio' ? !form.querySelector(`input[name="${el.name}"]:checked`) : !el.value.trim()))
    if (missing) {
      err.textContent = form.dataset.miss
      err.hidden = false
      missing.focus()
      return
    }
    err.hidden = true
    const vals = values(form)
    const message = compose(form.dataset.tpl, vals, { negocio: form.dataset.negocio, pedido: window.__tbCartText?.() ?? '' })
    const num = form.dataset.num
    sent = true
    if (form.dataset.save === '1') ping(root, 'send', { fields: vals, message })
    else ping(root, 'send', {})
    const text = encodeURIComponent(message)
    // dentro de Instagram/TikTok/Facebook: enlace universal en la misma pestaña (las ventanas nuevas se bloquean)
    if (IN_APP) location.href = `https://api.whatsapp.com/send?phone=${num}&text=${text}`
    else if (!window.open(`https://wa.me/${num}?text=${text}`, '_blank', 'noopener')) location.href = `https://wa.me/${num}?text=${text}`
    close()
  })
}
