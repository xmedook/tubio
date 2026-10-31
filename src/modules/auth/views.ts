import { html, raw } from '../../lib/html.ts'
import { authLayout } from '../../views/layout.ts'
import { csrfField, input, powAttr, powField, type Errors } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'

type V = Record<string, string>

export type Claim = { alias: string; error: string | null } | null

export function registerPage(ctx: Ctx, values: V = {}, errors: Errors = {}, claim: Claim = null) {
  const { t } = ctx
  const pow = ctx.pow()
  return authLayout(ctx, {
    title: t('auth.register_title'),
    path: '/register',
    body: html`<h1>${t('auth.register_title')}</h1>
${googleButton(ctx)}
${claim ? html`<p class="${claim.error ? 'claim-bad' : 'claim-ok'}" role="status">${claim.error ? t(claim.error, { alias: claim.alias }) : t('claim.free', { url: `${new URL(ctx.baseUrl).host}/${claim.alias}` })}</p>` : ''}
<form method="post" action="/register" novalidate${powAttr(pow)}>
  ${csrfField(ctx)}
  ${claim && !claim.error ? html`<input type="hidden" name="claim" value="${claim.alias}">` : ''}
  ${values.giro ? html`<input type="hidden" name="giro" value="${values.giro}">` : ''}
  ${errors._form ? html`<p class="error" role="alert">${t(errors._form)}</p>` : ''}
  ${input({ ctx, name: 'name', label: t('auth.name'), value: values.name, error: errors.name, autocomplete: 'name', maxlength: 80 })}
  ${input({ ctx, name: 'email', type: 'email', label: t('auth.email'), value: values.email, error: errors.email, required: true, autocomplete: 'email' })}
  ${input({ ctx, name: 'password', type: 'password', label: t('auth.password'), hint: t('auth.password_hint'), error: errors.password, required: true, autocomplete: 'new-password' })}
  <div class="field field-check${errors.accept ? ' has-error' : ''}">
    <input id="f-accept" type="checkbox" name="accept" value="1"${values.accept ? html` checked` : ''} required>
    <label for="f-accept">${raw(t('auth.accept_terms_html'))}</label>
    ${errors.accept ? html`<p class="error" role="alert">${t(errors.accept)}</p>` : ''}
  </div>
  ${powField(ctx, pow)}
  <button class="btn btn-primary btn-block" type="submit">${t('auth.register_submit')}</button>
</form>
<p class="auth-alt">${t('auth.have_account')} <a href="/login">${t('auth.login_link')}</a></p>`,
  })
}

function googleButton(ctx: Ctx, next = '') {
  if (!ctx.googleEnabled) return ''
  return html`<a class="btn btn-block btn-google" href="/login/google${next ? `?next=${encodeURIComponent(next)}` : ''}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z"/></svg>${ctx.t('auth.google')}</a>
<p class="or" aria-hidden="true"><span>${ctx.t('auth.or')}</span></p>`
}

export function loginPage(ctx: Ctx, values: V = {}, errors: Errors = {}, next = '') {
  const { t } = ctx
  return authLayout(ctx, {
    title: t('auth.login_title'),
    path: '/login',
    body: html`<h1>${t('auth.login_title')}</h1>
${googleButton(ctx, next)}
<form method="post" action="/login" novalidate>
  ${csrfField(ctx)}
  <input type="hidden" name="next" value="${next}">
  ${errors._form ? html`<p class="error" role="alert">${t(errors._form)}</p>` : ''}
  ${input({ ctx, name: 'email', type: 'email', label: t('auth.email'), value: values.email, error: errors.email, required: true, autocomplete: 'username' })}
  ${input({ ctx, name: 'password', type: 'password', label: t('auth.password'), error: errors.password, required: true, autocomplete: 'current-password' })}
  <button class="btn btn-primary btn-block" type="submit">${t('auth.login_submit')}</button>
</form>
<p class="auth-alt"><a href="/forgot">${t('auth.forgot_link')}</a></p>
<p class="auth-alt">${t('auth.no_account')} <a href="/register">${t('auth.register_link')}</a></p>`,
  })
}

export function twoFactorPage(ctx: Ctx, errors: Errors = {}, next = '') {
  const { t } = ctx
  return authLayout(ctx, {
    title: t('auth.2fa_title'),
    path: '/login/2fa',
    body: html`<h1>${t('auth.2fa_title')}</h1>
<p>${t('auth.2fa_body')}</p>
<form method="post" action="/login/2fa" novalidate>
  ${csrfField(ctx)}
  <input type="hidden" name="next" value="${next}">
  ${input({ ctx, name: 'code', label: t('auth.2fa_code'), error: errors.code, required: true, autocomplete: 'one-time-code', inputmode: 'numeric', pattern: '[0-9 ]{6,7}', maxlength: 7, autofocus: true })}
  <button class="btn btn-primary btn-block" type="submit">${t('auth.2fa_submit')}</button>
</form>
<form method="post" action="/logout" class="auth-alt">${csrfField(ctx)}<button class="btn-link" type="submit">${t('auth.2fa_cancel')}</button></form>`,
  })
}

export function forgotPage(ctx: Ctx, values: V = {}, errors: Errors = {}, sent = false) {
  const { t } = ctx
  const pow = ctx.pow()
  return authLayout(ctx, {
    title: t('auth.forgot_title'),
    path: '/forgot',
    body: html`<h1>${t('auth.forgot_title')}</h1>
${sent
  ? html`<p role="status">${t('auth.forgot_sent')}</p>`
  : html`<p>${t('auth.forgot_body')}</p>
<form method="post" action="/forgot" novalidate${powAttr(pow)}>
  ${csrfField(ctx)}
  ${input({ ctx, name: 'email', type: 'email', label: t('auth.email'), value: values.email, error: errors.email, required: true, autocomplete: 'email' })}
  ${powField(ctx, pow)}
  <button class="btn btn-primary btn-block" type="submit">${t('auth.forgot_submit')}</button>
</form>`}
<p class="auth-alt"><a href="/login">${t('auth.login_link')}</a></p>`,
  })
}

export function resetPage(ctx: Ctx, token: string, errors: Errors = {}) {
  const { t } = ctx
  return authLayout(ctx, {
    title: t('auth.reset_title'),
    path: '/login',
    body: html`<h1>${t('auth.reset_title')}</h1>
<form method="post" action="/reset/${token}" novalidate>
  ${csrfField(ctx)}
  ${input({ ctx, name: 'password', type: 'password', label: t('auth.new_password'), hint: t('auth.password_hint'), error: errors.password, required: true, autocomplete: 'new-password' })}
  <button class="btn btn-primary btn-block" type="submit">${t('auth.reset_submit')}</button>
</form>`,
  })
}
