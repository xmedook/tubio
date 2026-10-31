// tubio — menú / carta de servicios: buscador, carrito sin cobro (el pedido sale por WhatsApp) y visor de PDF. Sin dependencias.
const lang = document.documentElement.lang || 'es'
const money = (sym, n) => `${sym}${n.toLocaleString(lang, { maximumFractionDigits: 2 })}`

// ------------------------------------------------------------ buscador (se muestra sólo con JS)
for (const root of document.querySelectorAll('[data-mnu]')) {
  const q = root.querySelector('[data-mnu-q]')
  if (!q) continue
  q.hidden = false
  q.addEventListener('input', () => {
    const term = q.value.trim().toLowerCase()
    for (const g of root.querySelectorAll('[data-mnu-g]')) {
      let any = false
      for (const li of g.querySelectorAll('[data-mnu-i]')) {
        const hit = !term || li.dataset.text.includes(term)
        li.hidden = !hit
        any ||= hit
      }
      g.hidden = !any
    }
  })
}

// ------------------------------------------------------------ carrito
const carts = []
window.__tbCartText = () =>
  carts
    .map((c) => c.text())
    .filter(Boolean)
    .join('\n')

for (const root of document.querySelectorAll('[data-mnu][data-cart]')) {
  const d = root.dataset
  const sym = d.moneda || '$'
  const bar = root.querySelector('[data-cart-open]')
  const sheet = root.querySelector('[data-cart-sheet]')
  const list = root.querySelector('[data-cart-list]')
  const totalEl = root.querySelector('[data-cart-total]')
  const storeKey = `tb-cart-${root.dataset.mnu}`
  /** key -> { name, price, qty, note } */
  let lines = new Map()
  try {
    lines = new Map(JSON.parse(sessionStorage.getItem(storeKey) || '[]'))
  } catch {
    /* sin almacenamiento */
  }
  const save = () => {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify([...lines]))
    } catch {
      /* ok */
    }
  }
  const count = () => [...lines.values()].reduce((a, l) => a + l.qty, 0)
  const total = () => {
    let t = 0
    let all = true
    for (const l of lines.values()) {
      if (l.price === null) all = false
      else t += l.price * l.qty
    }
    return { t, all: all && lines.size > 0 }
  }
  const lineText = (l) => `${l.qty}× ${l.name}${l.price !== null ? ` — ${money(sym, l.price * l.qty)}` : ''}${l.note ? ` (${l.note})` : ''}`
  const text = () => {
    if (!lines.size) return ''
    const { t, all } = total()
    return [...lines.values()].map(lineText).join('\n') + (all ? `\n${d.lTotal}: ${money(sym, t)}` : '')
  }
  carts.push({ text })

  function paint() {
    for (const li of root.querySelectorAll('[data-mnu-i][data-key]')) {
      const l = lines.get(li.dataset.key)
      const qty = li.querySelector('[data-qty]')
      const add = li.querySelector('[data-add]')
      if (!qty || !add) continue
      qty.hidden = !l
      add.hidden = !!l
      if (l) qty.querySelector('output').textContent = String(l.qty)
    }
    const n = count()
    if (n) {
      const { t, all } = total()
      bar.textContent = `${d.lView} (${n})${all ? ` · ${money(sym, t)}` : ''}`
    }
    bar.hidden = !n
    document.body.classList.toggle('has-cart', n > 0)
  }

  function paintSheet() {
    list.replaceChildren(
      ...[...lines].map(([key, l]) => {
        const li = document.createElement('li')
        li.className = 'cart-li'
        li.innerHTML = '<div class="cart-r"><span class="cart-n"></span><span class="cart-p"></span></div><div class="cart-c"><div class="mnu-q2"><button type="button" data-d>−</button><output></output><button type="button" data-u>+</button></div><input class="wa-in cart-note" maxlength="80"></div>'
        li.querySelector('.cart-n').textContent = l.name
        li.querySelector('.cart-p').textContent = l.price !== null ? money(sym, l.price * l.qty) : ''
        li.querySelector('output').textContent = String(l.qty)
        const note = li.querySelector('.cart-note')
        note.placeholder = d.lNote
        note.value = l.note || ''
        note.addEventListener('input', () => {
          l.note = note.value.trim()
          save()
        })
        li.querySelector('[data-u]').addEventListener('click', () => change(key, +1, true))
        li.querySelector('[data-d]').addEventListener('click', () => change(key, -1, true))
        return li
      }),
    )
    const { t, all } = total()
    totalEl.textContent = all ? `${d.lTotal}: ${money(sym, t)}` : ''
    if (!lines.size) totalEl.textContent = d.lEmpty
  }

  function change(key, delta, inSheet) {
    const li = root.querySelector(`[data-mnu-i][data-key="${CSS.escape(key)}"]`)
    const cur = lines.get(key)
    if (!cur && delta > 0 && li) {
      const price = li.dataset.price !== undefined ? Number(li.dataset.price) : null
      lines.set(key, { name: li.dataset.name, price, qty: 1, note: '' })
    } else if (cur) {
      cur.qty += delta
      if (cur.qty <= 0) lines.delete(key)
      else if (cur.qty > 99) cur.qty = 99
    }
    save()
    paint()
    if (inSheet) {
      paintSheet()
      if (!lines.size) sheet.close()
    }
  }

  root.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null
    const li = t?.closest('[data-mnu-i][data-key]')
    if (!li || !root.contains(li)) return
    if (t.closest('[data-add]') || t.closest('[data-inc]')) change(li.dataset.key, +1, false)
    else if (t.closest('[data-dec]')) change(li.dataset.key, -1, false)
  })
  bar.addEventListener('click', () => {
    paintSheet()
    sheet.showModal()
  })
  root.querySelector('[data-cart-close]').addEventListener('click', () => sheet.close())
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.close()
  })
  root.querySelector('[data-cart-clear]').addEventListener('click', () => {
    lines.clear()
    save()
    paint()
    sheet.close()
  })
  // continuar: la hoja de «Pedido» (o la primera de WhatsApp de la página) con el resumen ya dentro del mensaje
  root.querySelector('[data-cart-go]').addEventListener('click', () => {
    sheet.close()
    const wa = document.querySelector('[data-wa][data-preset="pedido"]') ?? document.querySelector('[data-wa]')
    if (wa) {
      wa.dispatchEvent(new CustomEvent('tb:wa-open'))
      return
    }
    const num = d.num
    if (!num) return
    const msg = `${d.lHello}\n${d.lOrder}\n${text()}`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener')
  })
  paint()
}

// ------------------------------------------------------------ servicio → «Agendar» abre la hoja de cita con el servicio puesto
document.addEventListener('click', (e) => {
  const b = e.target instanceof Element ? e.target.closest('[data-wa-book]') : null
  if (!b) return
  const wa = document.querySelector('[data-wa][data-preset="cita"]') ?? document.querySelector('[data-wa][data-preset="clase"]') ?? document.querySelector('[data-wa]')
  if (wa) wa.dispatchEvent(new CustomEvent('tb:wa-open', { detail: { servicio: b.dataset.waBook } }))
})

// ------------------------------------------------------------ menú en PDF: visor a pantalla completa
for (const root of document.querySelectorAll('[data-mpdf]')) {
  const dlg = root.querySelector('[data-mpdf-dlg]')
  const open = root.querySelector('[data-mpdf-open]')
  if (!dlg || !open || typeof dlg.showModal !== 'function') continue
  open.addEventListener('click', (e) => {
    e.preventDefault()
    const f = dlg.querySelector('iframe')
    if (!f.src) f.src = f.dataset.src
    dlg.showModal()
  })
  root.querySelector('[data-mpdf-close]').addEventListener('click', () => dlg.close())
}
