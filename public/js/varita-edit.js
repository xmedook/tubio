// Varita en el editor: pide cambios de texto, muestra antes/después, aplica y permite deshacer.
const bar = document.querySelector('[data-varita-edit]')
if (bar) {
  const url = bar.dataset.url
  const csrf = bar.dataset.csrf ?? ''
  const page = bar.dataset.page
  const status = bar.querySelector('[data-vbar-status]')
  const dlg = bar.querySelector('[data-vdlg]')
  const body = bar.querySelector('[data-vdlg-body]')
  const tpl = bar.querySelector('[data-vtpl-option]')
  const toast = bar.querySelector('[data-vtoast]')
  const msg = (k) => bar.querySelector(`[data-vmsg-${k}]`)?.textContent ?? ''
  const post = async (path, data) => {
    const r = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(data) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.msg || msg('fail'))
    return j
  }
  let busy = false

  async function ask(data, origin) {
    if (busy) return
    busy = true
    bar.classList.add('busy')
    origin?.classList.add('busy')
    status.textContent = msg('wait')
    try {
      const res = await post('/propose', { ...data, ...(page && !data.block ? { page: Number(page) } : {}) })
      status.textContent = ''
      show(res)
    } catch (e) {
      status.textContent = e.message
    } finally {
      busy = false
      bar.classList.remove('busy')
      origin?.classList.remove('busy')
    }
  }

  function show(res) {
    body.replaceChildren()
    const opts = res.options.filter((o) => o.cambios.length)
    if (!opts.length) {
      status.textContent = res.options[0]?.resumen || msg('none')
      return
    }
    opts.forEach((o) => {
      const node = tpl.content.firstElementChild.cloneNode(true)
      node.querySelector('.vopt-sum').textContent = o.resumen
      const list = node.querySelector('.vopt-list')
      for (const c of o.cambios) {
        const li = document.createElement('li')
        const k = document.createElement('small')
        k.textContent = c.label
        const a = document.createElement('del')
        a.textContent = c.antes
        const b = document.createElement('ins')
        b.textContent = c.nuevo
        li.append(k, a, b)
        list.append(li)
      }
      node.querySelector('.vopt-go').addEventListener('click', async (ev) => {
        ev.target.disabled = true
        try {
          const r = await post('/apply', { token: res.token, option: res.options.indexOf(o) })
          sessionStorage.setItem('tubio-varita-undo', String(r.undo))
          location.reload()
        } catch (e) {
          status.textContent = e.message
          dlg.close()
        }
      })
      body.append(node)
    })
    dlg.showModal()
  }

  bar.querySelector('[data-vbar-form]')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const q = e.target.instruction.value.trim()
    if (q) ask({ instruction: q })
  })
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('[data-vq]') : null
    if (!b) return
    b.closest('details')?.removeAttribute('open')
    ask({ quick: b.dataset.vq, ...(b.dataset.block ? { block: Number(b.dataset.block) } : {}) }, b.closest('li') ?? b)
  })

  // después de aplicar: aviso con «Deshacer»
  let undo = null
  try {
    undo = sessionStorage.getItem('tubio-varita-undo')
    sessionStorage.removeItem('tubio-varita-undo')
  } catch {}
  if (undo) {
    toast.hidden = false
    const hide = setTimeout(() => (toast.hidden = true), 12000)
    toast.querySelector('[data-vundo]').addEventListener('click', async () => {
      clearTimeout(hide)
      try {
        await post('/undo', { undo: Number(undo) })
        location.reload()
      } catch (e) {
        status.textContent = e.message
        toast.hidden = true
      }
    })
  }
}
