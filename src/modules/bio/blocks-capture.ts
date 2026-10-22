import { html, raw, type SafeHtml } from '../../lib/html.ts'
import type { BlockDef, BlockRow, RenderCtx } from './blocks.ts'

/** Bloques que recogen datos de visitantes. El envío lo atiende capture/routes.ts (POST /_/f/:id). */

const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const targets = { name: 'targets', kind: 'targets' as const, label: 'bio.f.targets' }

function sentBox(rc: RenderCtx, b: BlockRow): SafeHtml | null {
  return rc.sent === b.id ? html`<p class="cap-ok" role="status">${s(b.data.thanks) || rc.t('bio.cap_thanks')}</p>` : null
}

function formShell(rc: RenderCtx, b: BlockRow, inner: SafeHtml, consent = true): SafeHtml {
  const pow = rc.pow()
  return html`<form class="cap" method="post" action="/_/f/${b.id}"${pow ? html` data-pow="${JSON.stringify(pow)}"` : ''}>
  <input type="hidden" name="_csrf" value="${rc.csrf}">
  ${pow ? html`<input type="hidden" name="_pow" value="">` : ''}
  <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
  ${b.data.title ? html`<p class="cap-title">${s(b.data.title)}</p>` : ''}
  ${b.data.description ? html`<p class="cap-desc">${s(b.data.description)}</p>` : ''}
  ${rc.formError?.id === b.id ? html`<p class="cap-err" role="alert">${rc.t(`bio.cap_err_${rc.formError.key}`)}</p>` : ''}
  ${inner}
  ${consent
    ? html`<label class="cap-consent"><input type="checkbox" name="consent" value="1" required> <span>${raw(rc.t('bio.cap_consent_html', { owner: escapeText(rc.ownerName) }))}</span></label>`
    : ''}
  <p class="cap-status" data-pow-status data-wait="${rc.t('pow.wait')}" data-ok="" aria-live="polite"></p>
  <button class="btn" type="submit">${s(b.data.button) || rc.t('bio.cap_send')}</button>
</form>`
}

function escapeText(v: string): string {
  return v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

const common = (button = true): BlockDef['fields'] => [
  { name: 'title', kind: 'text', label: 'bio.f.title', max: 120 },
  { name: 'description', kind: 'text', label: 'bio.f.description', max: 240 },
  ...(button ? [{ name: 'button', kind: 'text' as const, label: 'bio.f.button_label', max: 40 }] : []),
  { name: 'thanks', kind: 'text', label: 'bio.f.thanks', max: 200 },
  targets,
]

export const CAPTURE_BLOCKS: BlockDef[] = [
  {
    type: 'email_capture',
    group: 'capture',
    fields: common(),
    render: (rc, b) =>
      sentBox(rc, b) ??
      formShell(rc, b, html`<label class="sr-only" for="cap-${b.id}">${rc.t('auth.email')}</label><input id="cap-${b.id}" class="cap-in" type="email" name="email" required autocomplete="email" placeholder="${rc.t('home.waitlist_placeholder')}">`),
    summary: (b) => s(b.data.title) || 'correo',
  },
  {
    type: 'phone_capture',
    group: 'capture',
    fields: common(),
    render: (rc, b) =>
      sentBox(rc, b) ??
      formShell(rc, b, html`<label class="sr-only" for="cap-${b.id}">${rc.t('bio.cap_phone')}</label><input id="cap-${b.id}" class="cap-in" type="tel" name="phone" required autocomplete="tel" placeholder="+52 55 1234 5678">`),
    summary: (b) => s(b.data.title) || 'teléfono',
  },
  {
    type: 'contact_form',
    group: 'capture',
    fields: [...common(), { name: 'ask_phone', kind: 'checkbox', label: 'bio.f.ask_phone', default: false }],
    render: (rc, b) =>
      sentBox(rc, b) ??
      formShell(rc, b, html`<input class="cap-in" name="name" required maxlength="100" autocomplete="name" placeholder="${rc.t('auth.name')}" aria-label="${rc.t('auth.name')}">
<input class="cap-in" type="email" name="email" required autocomplete="email" placeholder="${rc.t('auth.email')}" aria-label="${rc.t('auth.email')}">
${b.data.ask_phone ? html`<input class="cap-in" type="tel" name="phone" autocomplete="tel" placeholder="${rc.t('bio.cap_phone')}" aria-label="${rc.t('bio.cap_phone')}">` : ''}
<textarea class="cap-in" name="message" required maxlength="3000" rows="4" placeholder="${rc.t('bio.cap_message')}" aria-label="${rc.t('bio.cap_message')}"></textarea>`),
    summary: (b) => s(b.data.title) || 'contacto',
  },
  {
    type: 'subscribe',
    group: 'capture',
    fields: common(),
    render: (rc, b) =>
      sentBox(rc, b) ??
      formShell(rc, b, html`<label class="sr-only" for="cap-${b.id}">${rc.t('auth.email')}</label><input id="cap-${b.id}" class="cap-in" type="email" name="email" required autocomplete="email" placeholder="${rc.t('home.waitlist_placeholder')}">`),
    summary: (b) => s(b.data.title) || 'suscripción',
  },
  {
    type: 'poll',
    group: 'capture',
    fields: [
      { name: 'question', kind: 'text', label: 'bio.f.question', max: 200, required: true },
      { name: 'options', kind: 'rows', label: 'bio.f.poll_options', maxRows: 10, minRows: 2, columns: [{ name: 'text', label: 'bio.f.option', type: 'text', max: 120, required: true }] },
      { name: 'show_results', kind: 'checkbox', label: 'bio.f.show_results', default: true },
    ],
    render: (rc, b) => {
      const opts = (Array.isArray(b.data.options) ? (b.data.options as { text?: string }[]) : []).map((o) => s(o.text)).filter(Boolean)
      const voted = !!rc.cookies[`tb_poll_${b.id}`] || rc.sent === b.id
      if (voted) {
        if (!b.data.show_results) return html`<div class="poll"><p class="cap-title">${s(b.data.question)}</p><p class="cap-ok" role="status">${rc.t('bio.poll_thanks')}</p></div>`
        const counts = new Map<string, number>()
        for (const r of rc.db.prepare("SELECT json_extract(data, '$.option') AS o, COUNT(*) AS n FROM collected WHERE block_id = ? AND kind = 'poll' GROUP BY o").all(b.id) as { o: string; n: number }[]) counts.set(r.o, r.n)
        const total = [...counts.values()].reduce((a, n) => a + n, 0)
        return html`<div class="poll"><p class="cap-title">${s(b.data.question)}</p>${opts.map((o) => {
          const pct = total ? Math.round(((counts.get(o) ?? 0) / total) * 100) : 0
          return html`<div class="poll-r"><span>${o}</span><b>${pct}%</b><progress value="${pct}" max="100" aria-label="${o}: ${pct}%"></progress></div>`
        })}<p class="poll-n">${rc.t('bio.poll_votes', { n: total })}</p></div>`
      }
      const pow = rc.pow()
      return html`<form class="poll cap" method="post" action="/_/f/${b.id}"${pow ? html` data-pow="${JSON.stringify(pow)}"` : ''}>
  <input type="hidden" name="_csrf" value="${rc.csrf}">${pow ? html`<input type="hidden" name="_pow" value="">` : ''}
  <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
  <fieldset><legend class="cap-title">${s(b.data.question)}</legend>
  ${opts.map((o, i) => html`<label class="poll-o"><input type="radio" name="option" value="${String(i)}" required> <span>${o}</span></label>`)}</fieldset>
  <p class="cap-status" data-pow-status data-wait="${rc.t('pow.wait')}" data-ok="" aria-live="polite"></p>
  <button class="btn" type="submit">${rc.t('bio.poll_vote')}</button>
</form>`
    },
    summary: (b) => s(b.data.question),
  },
]
