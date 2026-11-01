import { html, raw, type SafeHtml } from '../../lib/html.ts'
import { ic } from '../../views/sprite.ts'
import { fld } from '../../views/sitio-ui.ts'
import { csrfField, powAttr, powField, type Errors } from '../../views/ui.ts'
import type { Ctx } from '../../web/context.ts'
import { authSite } from '../home/shell-site.ts'

type V = Record<string, string>

export type Claim = { alias: string; error: string | null } | null

const arrow = () => ic('ar')

export function registerPage(ctx: Ctx, values: V = {}, errors: Errors = {}, claim: Claim = null) {
  const { t } = ctx
  const pow = ctx.pow()
  return authSite(ctx, {
    title: t('auth.register_title'),
    path: '/register',
    h1: html`${t('s3.reg_h')} <span class="hl-lima">${t('s3.reg_hl')}</span>.`,
    sub: t('s3.reg_sub'),
    body: html`${googleButton(ctx)}
${claim ? html`<div class="al ${claim.error ? 'crit' : 'ok'}" role="status">${ic(claim.error ? 'alert' : 'check')}<div>${claim.error ? t(claim.error, { alias: claim.alias }) : t('claim.free', { url: `${new URL(ctx.baseUrl).host}/${claim.alias}` })}</div></div>` : ''}
<form class="form" method="post" action="/register" novalidate${powAttr(pow)}>
  ${csrfField(ctx)}
  ${claim && !claim.error ? html`<input type="hidden" name="claim" value="${claim.alias}">` : ''}
  ${values.giro ? html`<input type="hidden" name="giro" value="${values.giro}">` : ''}
  ${errors._form ? html`<div class="al crit" role="alert">${ic('alert')}<div>${t(errors._form)}</div></div>` : ''}
  ${fld({ ctx, name: 'name', label: t('s3.name'), value: values.name, error: errors.name, placeholder: t('s3.name_ph'), autocomplete: 'name', maxlength: 80 })}
  ${fld({ ctx, name: 'email', type: 'email', label: t('s3.email'), value: values.email, error: errors.email, placeholder: t('s3.email_ph'), autocomplete: 'email' })}
  ${fld({ ctx, name: 'password', type: 'password', label: t('s3.pass'), hint: t('s3.pass_hint'), error: errors.password, autocomplete: 'new-password' })}
  <div class="fld${errors.accept ? ' err' : ''}"><label class="opt" for="f-accept"><input id="f-accept" type="checkbox" name="accept" value="1"${values.accept ? html` checked` : ''} required${errors.accept ? html` aria-invalid="true" aria-describedby="f-accept-e"` : ''}><span><b>${raw(t('auth.accept_terms_html'))}</b></span></label>${errors.accept ? html`<p class="msg-e" id="f-accept-e">${ic('alert')}<span>${t(errors.accept)}</span></p>` : ''}</div>
  ${powField(ctx, pow)}
  <button class="btn btn-b" type="submit">${t('s3.reg_btn')} ${arrow()}</button>
</form>
<p class="p sm">${t('s3.has_acct')} <a href="/login"><b>${t('s3.has_acct_l')}</b></a></p>`,
  })
}

/** Botón de Google: solo texto, sin logo de marca (design). Va si Google está configurado. */
function googleButton(ctx: Ctx, next = '') {
  if (!ctx.googleEnabled) return ''
  return html`<a class="btn btn-s btn-b" href="/login/google${next ? `?next=${encodeURIComponent(next)}` : ''}">${ctx.t('auth.google')}</a>
<div class="or" role="separator">${ctx.t('auth.or')}</div>`
}

export function loginPage(ctx: Ctx, values: V = {}, errors: Errors = {}, next = '') {
  const { t } = ctx
  return authSite(ctx, {
    title: t('auth.login_title'),
    path: '/login',
    h1: html`${t('s3.login_h')} <span class="hl-lima">${t('s3.login_hl')}</span>`,
    sub: t('s3.login_sub'),
    body: html`${googleButton(ctx, next)}
${errors._form ? html`<div class="al crit" role="alert">${ic('alert')}<div><b>${t('s3.login_err')}</b> ${t(errors._form)}</div></div>` : ''}
<form class="form" method="post" action="/login" novalidate>
  ${csrfField(ctx)}
  <input type="hidden" name="next" value="${next}">
  ${fld({ ctx, name: 'email', type: 'email', label: t('s3.email'), value: values.email, error: errors.email, placeholder: t('s3.email_ph'), autocomplete: 'username' })}
  ${fld({ ctx, name: 'password', type: 'password', label: t('s3.pass'), error: errors.password, autocomplete: 'current-password' })}
  <p style="text-align:right"><a href="/forgot" style="display:inline-flex;min-height:44px;align-items:center">${t('s3.forgot_q')}</a></p>
  <button class="btn btn-b" type="submit">${t('s3.login_btn')} ${arrow()}</button>
</form>
<p class="p sm">${t('s3.no_acct')} <a href="/register"><b>${t('s3.no_acct_l')}</b></a></p>`,
  })
}

export function twoFactorPage(ctx: Ctx, errors: Errors = {}, next = '') {
  const { t } = ctx
  return authSite(ctx, {
    title: t('auth.2fa_title'),
    path: '/login/2fa',
    h1: html`${t('s3.tfa_h')} <span class="hl-azul">${t('s3.tfa_hl')}</span>`,
    sub: t('auth.2fa_body'),
    body: html`<form class="form" method="post" action="/login/2fa" novalidate>
  ${csrfField(ctx)}
  <input type="hidden" name="next" value="${next}">
  ${fld({ ctx, name: 'code', label: t('auth.2fa_code'), error: errors.code, autocomplete: 'one-time-code', inputmode: 'numeric', pattern: '[0-9 ]{6,7}', maxlength: 7, autofocus: true })}
  <button class="btn btn-b" type="submit">${t('auth.2fa_submit')} ${arrow()}</button>
</form>
<form method="post" action="/logout">${csrfField(ctx)}<button class="btn btn-t" type="submit">${t('auth.2fa_cancel')}</button></form>`,
  })
}

export function forgotPage(ctx: Ctx, values: V = {}, errors: Errors = {}, sent = false, sentTo = '') {
  const { t } = ctx
  const pow = ctx.pow()
  return authSite(ctx, {
    title: t('auth.forgot_title'),
    path: '/forgot',
    h1: sent ? html`${t('s3.sent_h')} <span class="hl-verde">${t('s3.sent_hl')}</span>` : html`${t('s3.for_h')} <span class="hl-azul">${t('s3.for_hl')}</span>`,
    sub: sent ? t('s3.sent_sub') : t('s3.for_sub'),
    body: sent
      ? html`<div class="al ok" role="status">${ic('mail')}<div>${sentTo ? html`<b>${t('s3.sent_to')} ${sentTo}.</b> ` : ''}${t('s3.sent_spam')}</div></div>
<a class="btn btn-s btn-b" href="/forgot">${t('s3.sent_other')}</a>
<p class="p sm">${t('s3.sent_have')} <a href="/login"><b>${t('s3.sent_enter')}</b></a></p>`
      : html`<form class="form" method="post" action="/forgot" novalidate${powAttr(pow)}>
  ${csrfField(ctx)}
  ${fld({ ctx, name: 'email', type: 'email', label: t('s3.email'), value: values.email, error: errors.email, placeholder: t('s3.email_ph'), autocomplete: 'email' })}
  ${powField(ctx, pow)}
  <button class="btn btn-b" type="submit">${t('s3.for_btn')} ${arrow()}</button>
</form>
<p class="p sm">${t('s3.for_rem')} <a href="/login"><b>${t('s3.for_back')}</b></a></p>`,
  })
}

export function resetPage(ctx: Ctx, token: string, errors: Errors = {}) {
  const { t } = ctx
  return authSite(ctx, {
    title: t('auth.reset_title'),
    path: '/login',
    h1: html`${t('s3.rst_h')} <span class="hl-lima">${t('s3.rst_hl')}</span>${t('s3.rst_h2')}`,
    sub: t('s3.rst_sub'),
    body: html`<form class="form" method="post" action="/reset/${token}" novalidate>
  ${csrfField(ctx)}
  ${fld({ ctx, name: 'password', type: 'password', label: t('s3.rst_pass'), hint: t('s3.rst_pass_hint'), error: errors.password, autocomplete: 'new-password' })}
  ${fld({ ctx, name: 'password2', type: 'password', label: t('s3.rst_pass2'), error: errors.password2, autocomplete: 'new-password' })}
  <button class="btn btn-b" type="submit">${t('s3.rst_btn')} ${arrow()}</button>
</form>`,
  })
}
