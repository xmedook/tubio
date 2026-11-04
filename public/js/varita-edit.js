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

  // pedido libre: el agente (estructura, estilo y textos)
  async function agent(q) {
    if (busy) return
    busy = true
    bar.classList.add('busy')
    status.textContent = msg('wait')
    try {
      const res = await post('/agent', { instruction: q, ...(page ? { page: Number(page) } : {}) })
      status.textContent = ''
      showAgent(res)
    } catch (e) {
      status.textContent = e.message
    } finally {
      busy = false
      bar.classList.remove('busy')
    }
  }

  function showAgent(res) {
    body.replaceChildren()
    const ok = res.steps.filter((s) => s.ok)
    const art = document.createElement('article')
    art.className = 'vopt vagent'
    const p = document.createElement('p')
    p.className = 'vopt-sum'
    p.textContent = res.mensaje || res.resumen
    art.append(p)
    const ol = document.createElement('ol')
    ol.className = 'vsteps'
    for (const s of res.steps) {
      const li = document.createElement('li')
      li.className = s.ok ? `vs vs-${s.op}` : 'vs vs-fail'
      const h = document.createElement('b')
      h.textContent = `${s.verb} · ${s.label}`
      li.append(h)
      if (s.detalle) { const d = document.createElement('small'); d.textContent = s.detalle; li.append(d) }
      if (s.antes) { const a = document.createElement('del'); a.textContent = s.antes; li.append(a) }
      if (s.despues) { const b = document.createElement('ins'); b.textContent = s.despues; li.append(b) }
      if (s.error) { const er = document.createElement('small'); er.className = 'vs-err'; er.textContent = s.error; li.append(er) }
      ol.append(li)
    }
    art.append(ol)
    if (ok.some((s) => s.op !== 'falta_archivo')) {
      const go = document.createElement('button')
      go.type = 'button'
      go.className = 'btn btn-primary vopt-go'
      go.textContent = tpl.content.querySelector('.vopt-go')?.textContent ?? 'OK'
      go.addEventListener('click', async () => {
        go.disabled = true
        try {
          const r = await post('/agent/apply', { token: res.token })
          sessionStorage.setItem('tubio-varita-undo', `agent:${r.undo}`)
          if (r.upload) sessionStorage.setItem('tubio-varita-upload', r.upload)
          location.reload()
        } catch (e) {
          status.textContent = e.message
          dlg.close()
        }
      })
      art.append(go)
    }
    body.append(art)
    dlg.showModal()
  }

  bar.querySelector('[data-vbar-form]')?.addEventListener('submit', (e) => {
    e.preventDefault()
    const q = e.target.instruction.value.trim()
    if (q) agent(q)
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
  let upload = null
  try {
    upload = sessionStorage.getItem('tubio-varita-upload')
    sessionStorage.removeItem('tubio-varita-upload')
  } catch {}
  if (undo && upload && /^\/panel\/blocks\/\d+$/.test(upload)) {
    const a = toast.querySelector('[data-vupload]')
    if (a) { a.href = upload; a.hidden = false }
  }
  if (undo) {
    toast.hidden = false
    const hide = setTimeout(() => (toast.hidden = true), upload ? 30000 : 12000)
    toast.querySelector('[data-vundo]').addEventListener('click', async () => {
      clearTimeout(hide)
      try {
        if (undo.startsWith('agent:')) await post('/agent/undo', { undo: Number(undo.slice(6)) })
        else await post('/undo', { undo: Number(undo) })
        location.reload()
      } catch (e) {
        status.textContent = e.message
        toast.hidden = true
      }
    })
  }
}
