// tubio — carga los píxeles de medición sólo si el visitante aceptó (cookie tb_px=1).
// <div id="tb-px" data-px='[{"k":"meta","id":"123"}]'>; la barra de aviso es <div class="px-bar">.
const holder = document.getElementById('tb-px')
const list = holder ? JSON.parse(holder.dataset.px || '[]') : []
const consent = () => (document.cookie.match(/(?:^|; )tb_px=([01])/) || [])[1]
const add = (src) => { const s = document.createElement('script'); s.async = true; s.src = src; document.head.append(s); return s }

function load() {
  for (const { k, id } of list) {
    if (k === 'meta') {
      const f = (window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments) })
      window._fbq = f; f.push = f; f.loaded = true; f.version = '2.0'; f.queue = []
      add('https://connect.facebook.net/en_US/fbevents.js'); window.fbq('init', id); window.fbq('track', 'PageView')
    } else if (k === 'ga4') {
      window.dataLayer = window.dataLayer || []
      window.gtag = function () { window.dataLayer.push(arguments) }
      window.gtag('js', new Date()); window.gtag('config', id, { anonymize_ip: true })
      add(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`)
    } else if (k === 'gtm') {
      window.dataLayer = window.dataLayer || []
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
      add(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`)
    } else if (k === 'tiktok') {
      const q = (window.ttq = window.ttq || []); q.methods = ['page', 'track']
      for (const m of q.methods) q[m] = function () { q.push([m, ...arguments]) }
      add(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`); q.page()
    } else if (k === 'linkedin') {
      window._linkedin_partner_id = id; window._linkedin_data_partner_ids = [id]; add('https://snap.licdn.com/li.lms-analytics/insight.min.js')
    } else if (k === 'pinterest') {
      const p = (window.pintrk = function () { p.queue.push(Array.prototype.slice.call(arguments)) }); p.queue = []; p.version = '3.0'
      add('https://s.pinimg.com/ct/core.js'); window.pintrk('load', id); window.pintrk('page')
    } else if (k === 'x') {
      const t = (window.twq = function () { t.exe ? t.exe.apply(t, arguments) : t.queue.push(arguments) }); t.version = '1.1'; t.queue = []
      add('https://static.ads-twitter.com/uwt.js'); window.twq('config', id)
    } else if (k === 'snapchat') {
      const s = (window.snaptr = function () { s.handleRequest ? s.handleRequest.apply(s, arguments) : s.queue.push(arguments) }); s.queue = []
      add('https://sc-static.net/scevent.min.js'); window.snaptr('init', id); window.snaptr('track', 'PAGE_VIEW')
    } else if (k === 'quora') {
      const q = (window.qp = function () { q.qp ? q.qp.apply(q, arguments) : q.queue.push(arguments) }); q.queue = []
      add('https://a.quora.com/qevents.js'); window.qp('init', id); window.qp('track', 'ViewContent')
    }
  }
}

function set(v) { document.cookie = `tb_px=${v}; path=/; max-age=${180 * 86400}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}` }

if (list.length) {
  const bar = document.querySelector('.px-bar')
  const c = consent()
  if (c === '1') load()
  else if (c !== '0' && bar) {
    bar.hidden = false
    bar.querySelector('[data-px-yes]')?.addEventListener('click', () => { set(1); bar.hidden = true; load() })
    bar.querySelector('[data-px-no]')?.addEventListener('click', () => { set(0); bar.hidden = true })
  }
}
