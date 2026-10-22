// tubio — resuelve la prueba de trabajo de <form data-pow='{"salt":…}'> antes de enviar. Sin terceros.
async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function solve(c) {
  for (let n = 0; n <= c.maxnumber; n++) {
    if ((await sha256hex(c.salt + n)) === c.challenge) return n
  }
  return null
}

for (const form of document.querySelectorAll('form[data-pow]')) {
  const c = JSON.parse(form.dataset.pow)
  const field = form.querySelector('input[name="_pow"]')
  const status = form.querySelector('[data-pow-status]')
  let done = false
  const work = solve(c).then((n) => {
    if (n === null) return
    field.value = btoa(JSON.stringify({ algorithm: c.algorithm, salt: c.salt, number: n, challenge: c.challenge, signature: c.signature }))
    done = true
    if (status) status.textContent = status.dataset.ok ?? ''
  })
  form.addEventListener('submit', async (e) => {
    if (done) return
    e.preventDefault()
    if (status) status.textContent = status.dataset.wait ?? '…'
    await work
    if (done) form.requestSubmit()
  })
}
