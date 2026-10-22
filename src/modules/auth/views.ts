import { html } from '../../lib/html.ts'
import { authLayout } from '../../views/layout.ts'
import { csrfField, input, type Errors } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'

type V = Record<string, string>

export function registerPage(ctx: Ctx, values: V = {}, errors: Errors = {}) {
  const { t } = ctx
  return authLayout(ctx, {
    title: t('auth.register_title'),
    path: '/register',
    body: html`<h1>${t('auth.register_title')}</h1>
<form method="post" action="/register" novalidate>
  ${csrfField(ctx)}
  ${errors._form ? html`<p class="error" role="alert">${t(errors._form)}</p>` : ''}
  ${input({ ctx, name: 'name', label: t('auth.name'), value: values.name, error: errors.name, autocomplete: 'name', maxlength: 80 })}
  ${input({ ctx, name: 'email', type: 'email', label: t('auth.email'), value: values.email, error: errors.email, required: true, autocomplete: 'email' })}
  ${input({ ctx, name: 'password', type: 'password', label: t('auth.password'), hint: t('auth.password_hint'), error: errors.password, required: true, autocomplete: 'new-password' })}
  <button class="btn btn-primary btn-block" type="submit">${t('auth.register_submit')}</button>
</form>
<p class="auth-alt">${t('auth.have_account')} <a href="/login">${t('auth.login_link')}</a></p>`,
  })
}

export function loginPage(ctx: Ctx, values: V = {}, errors: Errors = {}, next = '') {
  const { t } = ctx
  return authLayout(ctx, {
    title: t('auth.login_title'),
    path: '/login',
    body: html`<h1>${t('auth.login_title')}</h1>
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
  return authLayout(ctx, {
    title: t('auth.forgot_title'),
    path: '/forgot',
    body: html`<h1>${t('auth.forgot_title')}</h1>
${sent
  ? html`<p role="status">${t('auth.forgot_sent')}</p>`
  : html`<p>${t('auth.forgot_body')}</p>
<form method="post" action="/forgot" novalidate>
  ${csrfField(ctx)}
  ${input({ ctx, name: 'email', type: 'email', label: t('auth.email'), value: values.email, error: errors.email, required: true, autocomplete: 'email' })}
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
