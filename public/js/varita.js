// Varita: manda la descripción, muestra el avance real que llega en líneas JSON y abre el sitio terminado.
const root = document.querySelector('[data-varita]')
const form = root?.querySelector('[data-varita-form]')
const desc = root?.querySelector('[data-varita-desc]')
const steps = root?.querySelector('[data-varita-steps]')
const err = root?.querySelector('[data-varita-err]')
const live = root?.querySelector('[data-varita-live]')

/** Pinta en el teléfono lo que ya se sabe del sitio (todo con textContent y colores validados en el servidor) */
function peek(p) {
  if (!live || !p) return
  if (p.nombre) live.querySelector('[data-vm-name]').textContent = p.nombre
  if (p.c1 && p.c2) {
    live.style.setProperty('--vm-c1', p.c1)
    live.style.setProperty('--vm-c2', p.c2)
    root.style.setProperty('--vm-c1', p.c1)
    root.style.setProperty('--vm-c2', p.c2)
    live.classList.add('has-color')
  }
  if (p.titulo) {
    const el = live.querySelector('[data-vm-title]')
    el.textContent = ''
    let i = 0
    const tick = () => { if (i <= p.titulo.length) { el.textContent = p.titulo.slice(0, i++); setTimeout(tick, 22) } }
    tick()
    live.classList.add('has-title')
  }
  if (p.seccion) {
    const sec = document.createElement('div')
    sec.className = 'vm-sec'
    const h = document.createElement('b')
    h.textContent = p.seccion
    sec.append(h, document.createElement('i'), document.createElement('i'))
    live.querySelector('[data-vm-secs]').append(sec)
  }
}

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
  if (live) {
    live.hidden = false
    live.className = 'varita-live'
    live.querySelector('[data-vm-name]').textContent = ''
    live.querySelector('[data-vm-title]').textContent = ''
    live.querySelector('[data-vm-secs]').replaceChildren()
  }
  (live ?? steps).scrollIntoView({ block: 'start', behavior: 'smooth' })
  stage('reading')
  const fd = new FormData(form)
  const fail = (msg) => {
    root.classList.remove('working')
    steps.hidden = true
    if (live) live.hidden = true
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
        if (m.peek) peek(m.peek)
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

// Lo que ayuda: se marca conforme la persona lo menciona
const HINTS = {
  que: (s) => s.trim().split(/\s+/).length >= 8,
  donde: (s) => /\b(en|colonia|col\.|av\.|avenida|calle|centro|zona)\s+[A-ZÁÉÍÓÚÑ0-9]/.test(s) || /\b(cdmx|guadalajara|monterrey|zapopan|puebla|quer[eé]taro|m[eé]rida|tijuana|le[oó]n)\b/i.test(s),
  horario: (s) => /\b(\d{1,2}\s*(am|pm|hrs?|h)\b|\d{1,2}:\d{2}|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|diario|24 ?h)/i.test(s),
  precios: (s) => /\$\s?\d|\d+\s?(pesos|mxn)\b/i.test(s),
  wa: (s) => /\d[\d\s-]{9,}/.test(s) || !!document.querySelector('#v-wa')?.value.replace(/\D/g, '').match(/^\d{10,}$/),
}
const hintBox = root?.querySelector('.varita-hints')
function hints() {
  if (!hintBox || !desc) return
  const s = desc.value
  for (const li of hintBox.querySelectorAll('[data-hint]')) li.classList.toggle('on', !!HINTS[li.dataset.hint]?.(s))
}
desc?.addEventListener('input', hints)
document.querySelector('#v-wa')?.addEventListener('input', hints)
root?.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('[data-varita-ex]')) setTimeout(hints) })
hints()

// Dictado (Web Speech API, si el navegador la tiene)
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
const mic = root?.querySelector('[data-varita-mic]')
if (Rec && mic && desc) {
  mic.hidden = false
  let rec = null
  mic.addEventListener('click', () => {
    if (rec) return rec.stop()
    rec = new Rec()
    rec.lang = document.documentElement.lang?.startsWith('en') ? 'en-US' : 'es-MX'
    rec.interimResults = true
    rec.continuous = true
    const base = desc.value ? desc.value.replace(/\s*$/, ' ') : ''
    rec.onresult = (ev) => {
      let txt = ''
      for (const r of ev.results) txt += r[0].transcript
      desc.value = (base + txt).slice(0, 2000)
      hints()
    }
    rec.onend = () => { rec = null; mic.setAttribute('aria-pressed', 'false'); mic.classList.remove('rec') }
    mic.setAttribute('aria-pressed', 'true')
    mic.classList.add('rec')
    rec.start()
  })
}
