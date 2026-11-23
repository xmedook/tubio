import type { FastifyInstance } from 'fastify'
import type { AppDeps } from '../../app.ts'
import { aliasError, normalizeAlias } from '../../lib/alias.ts'
import { html, type HtmlValue } from '../../lib/html.ts'
import { readMultipart, storeImage, UploadError } from '../../lib/uploads.ts'
import { checkTarget } from '../../lib/urls.ts'
import { icon } from '../../views/icons.ts'
import { ASSET_VERSION, panelLayout } from '../../views/layout.ts'
import { csrfField } from '../../views/ui.ts'
import { sendHtml, userGuard, type Ctx } from '../../web/context.ts'
import { field, fieldAll } from '../../web/forms.ts'
import { actorOf } from '../auth/routes.ts'
import { defaultBioData, THEME_IDS, THEMES } from '../bio/design.ts'
import { createBlock, listBlocks, reorderBlocks, updateBlock } from '../bio/repo.ts'
import { NETWORK_BY_ID, NETWORKS, normalizeSocial } from '../bio/socials.ts'
import { aliasTaken, createLink, getOwnLink, linkUrl, updateLink, type Link } from '../links/repo.ts'
import { dailyCapHit, limitsOf, usageOf, withinLimit } from '../plans/limits.ts'
import { audit } from '../settings/repo.ts'
import type { User } from '../users/repo.ts'

/**
 * Onboarding guiado (23-nov-2026, peer #5823). Basado en el análisis del flujo de tiny.BIO:
 * usuario → objetivo → «tu liga ya existe» → 4 pasos opcionales (tema, redes, links, perfil) → celebración.
 * La liga se crea al terminar el paso 2 y cada paso guiado la va completando: se puede salir en cualquier momento
 * y lo hecho queda guardado. Quien elige «Negocio» sigue por el asistente de sitio de siempre (/panel/start).
 */
const OB = '/panel/onboarding'
const GOALS = ['personal', 'creador', 'negocio'] as const
type Goal = (typeof GOALS)[number]
const GOAL_THEME: Record<Goal, string> = { personal: 'nube', creador: 'neon', negocio: 'nube' }
const GOAL_ICON: Record<Goal, string> = { personal: 'user', creador: 'play', negocio: 'card' }
const TOTAL = 4
/** Redes que se ofrecen en el paso 2/4 (las genéricas —correo, teléfono, sitio— se agregan en el editor) */
const OFFERED = NETWORKS.filter((n) => !['mail', 'email', 'phone', 'website'].includes(n.id))

function shell(ctx: Ctx, o: { title: string; path: string; body: HtmlValue; step?: number; back?: string; skip?: string }) {
  const { t } = ctx
  const bar = o.step
    ? html`<div class="ob-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${TOTAL}" aria-valuenow="${o.step}" aria-label="${t('ob.progress', { n: o.step, total: TOTAL })}">${Array.from({ length: TOTAL }, (_, i) => html`<i class="${i < (o.step ?? 0) ? 'on' : ''}"></i>`)}</div>`
    : ''
  const nav =
    o.back || o.skip
      ? html`<div class="ob-nav">${o.back ? html`<a href="${o.back}">← ${t('ob.back')}</a>` : html`<span></span>`}${o.skip ? html`<a href="${o.skip}">${t('ob.skip')}</a>` : ''}</div>`
      : ''
  return panelLayout(ctx, {
    title: o.title,
    active: 'links',
    path: o.path,
    head: html`<script type="module" src="/_/static/js/onboarding.js?v=${ASSET_VERSION}" nonce="${ctx.nonce}"></script>`,
    body: html`<section class="ob">${nav}${bar}${o.body}</section>`,
  })
}

/** Teléfono en miniatura con los colores del tema */
function phone(th: (typeof THEMES)[number], label: string) {
  const btn = `background:${th.btnBg};color:${th.btnText};border:${th.btnBorderWidth}px solid ${th.btnBorder};border-radius:${Math.min(th.radius, 12)}px`
  return html`<span class="ob-phone" style="background:${th.bg};color:${th.text}" aria-hidden="true"><i class="ob-av" style="background:${th.text}"></i><b>${label}</b><u style="${btn}"></u><u style="${btn}"></u><u style="${btn}"></u></span>`
}

export function registerOnboarding(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps
  const full = (u: User) => !withinLimit(limitsOf(db, u, deps.now()).bio_pages, usageOf(db, u.id).bio_pages)
  const own = (u: User, id: unknown) => getOwnLink(db, Number(id), u.id)
  const aliasState = (raw: string) => {
    const alias = normalizeAlias(raw).slice(0, 60)
    if (!alias) return { alias, error: null as string | null }
    return { alias, error: aliasError(alias) ?? (aliasTaken(db, alias) ? 'err.alias_taken' : null) }
  }
  /** 3 alias libres a partir del nombre o del correo */
  const suggestions = (u: User, current: string) => {
    const base = normalizeAlias(u.name || u.email.split('@')[0] || '').slice(0, 30) || 'mi-liga'
    const out: string[] = []
    for (const c of [base, `${base}mx`, `${base}-oficial`, `${base}1`, `${base}-${(u.id % 90) + 10}`, `mi-${base}`]) {
      const a = normalizeAlias(c)
      if (a !== current && !out.includes(a) && !aliasError(a) && !aliasTaken(db, a)) out.push(a)
      if (out.length === 3) break
    }
    return out
  }

  /* ---------- paso 1: elige tu usuario ---------- */
  const page1 = (ctx: Ctx, u: User, alias: string, error: string | null, status = 200, fullPlan = false) => {
    const { t } = ctx
    const host = new URL(ctx.baseUrl).host
    const sug = suggestions(u, alias)
    return {
      status,
      body: shell(ctx, {
        title: t('ob.s1_h'),
        path: OB,
        body: html`<h1>${t('ob.s1_h')}</h1><p class="muted">${t('ob.s1_sub')}</p>
${fullPlan ? html`<p class="flash flash-error" role="alert">${t('err.plan_bio_pages')} <a href="/panel/plan">${t('plan.see_plans')}</a></p>` : ''}
<form method="post" action="${OB}" novalidate class="ob-form">
  ${csrfField(ctx)}
  <div class="field${error ? ' has-error' : ''}"><label for="ob-alias">${t('ob.alias_label')}</label>
    <div class="r-fila"><span class="r-host" aria-hidden="true">${host}/</span><input id="ob-alias" name="alias" value="${alias}" required minlength="3" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" data-ob-alias="${OB}/alias" autofocus></div>
    <p class="ob-msg${error ? ' error' : ''}" id="ob-msg" role="status" aria-live="polite">${error ? t(error) : ''}</p></div>
  ${sug.length ? html`<p class="ob-sug"><span>${t('ob.suggest')}</span> ${sug.map((s) => html`<a class="ob-chip" href="${OB}?alias=${s}" data-ob-sug="${s}">${s}</a>`)}</p>` : ''}
  <div class="sticky-actions btn-row"><button class="btn btn-primary btn-lg" type="submit">${t('ob.continue')}</button></div>
</form>`,
      }),
    }
  }

  app.get(OB, { preHandler: userGuard }, async (req, reply) => {
    const u = req.ctx.user as User
    const raw = String((req.query as { alias?: string }).alias ?? '')
    const st = aliasState(raw)
    const r = page1(req.ctx, u, st.alias, st.error && raw ? st.error : null, 200, full(u))
    return sendHtml(reply, r.body)
  })

  /** Disponibilidad en vivo mientras escribe (JSON) */
  app.get(`${OB}/alias`, { preHandler: userGuard, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const st = aliasState(String((req.query as { alias?: string }).alias ?? ''))
    const { t } = req.ctx
    return reply.type('application/json').send({ alias: st.alias, ok: !!st.alias && !st.error, msg: !st.alias ? '' : st.error ? t(st.error) : t('ob.alias_free') })
  })

  app.post(OB, { preHandler: userGuard, config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = req.ctx.user as User
    if (full(u)) return sendHtml(reply, page1(req.ctx, u, normalizeAlias(field(req.body, 'alias')), null, 402, true).body, 402)
    const st = aliasState(field(req.body, 'alias'))
    if (!st.alias || st.error) {
      const r = page1(req.ctx, u, st.alias, st.error ?? 'err.required', 422)
      return sendHtml(reply, r.body, 422)
    }
    return reply.redirect(`${OB}/objetivo?alias=${encodeURIComponent(st.alias)}`, 303)
  })

  /* ---------- paso 2: objetivo (aquí se crea la liga) ---------- */
  const page2 = (ctx: Ctx, alias: string, goal: string, error = '') => {
    const { t } = ctx
    return shell(ctx, {
      title: t('ob.s2_h'),
      path: `${OB}/objetivo`,
      back: `${OB}?alias=${encodeURIComponent(alias)}`,
      body: html`<h1>${t('ob.s2_h')}</h1><p class="muted">${t('ob.s2_sub')}</p>
${error ? html`<p class="flash flash-error" role="alert">${t(error)}</p>` : ''}
<form method="post" action="${OB}/objetivo" class="ob-form" novalidate>
  ${csrfField(ctx)}<input type="hidden" name="alias" value="${alias}">
  <div class="ob-goals">${GOALS.map((g) => html`<label class="ob-goal"><input type="radio" name="goal" value="${g}"${goal === g ? html` checked` : ''} required><span class="ob-goal-ic" aria-hidden="true">${icon(GOAL_ICON[g])}</span><b>${t(`ob.goal_${g}`)}</b><small>${t(`ob.goal_${g}_d`)}</small></label>`)}</div>
  <div class="sticky-actions btn-row"><button class="btn btn-primary btn-lg" type="submit">${t('ob.continue')}</button></div>
</form>`,
    })
  }

  app.get(`${OB}/objetivo`, { preHandler: userGuard }, async (req, reply) => {
    const st = aliasState(String((req.query as { alias?: string }).alias ?? ''))
    if (!st.alias || st.error) return reply.redirect(`${OB}?alias=${encodeURIComponent(st.alias)}`, 303)
    return sendHtml(reply, page2(req.ctx, st.alias, ''))
  })

  app.post(`${OB}/objetivo`, { preHandler: userGuard, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = req.ctx.user as User
    const st = aliasState(field(req.body, 'alias'))
    if (!st.alias || st.error) return reply.redirect(`${OB}?alias=${encodeURIComponent(st.alias)}`, 303)
    const goal = field(req.body, 'goal') as Goal
    if (!GOALS.includes(goal)) return sendHtml(reply, page2(req.ctx, st.alias, '', 'err.required'), 422)
    // Negocio = sitio con secciones (menú, horarios, mapa): sigue por el asistente de sitio de siempre
    if (goal === 'negocio') return reply.redirect(`/panel/start?alias=${encodeURIComponent(st.alias)}`, 303)
    if (full(u)) return sendHtml(reply, page2(req.ctx, st.alias, goal, 'err.plan_bio_pages'), 402)
    if (dailyCapHit(db, u, deps.now())) return sendHtml(reply, page2(req.ctx, st.alias, goal, 'err.daily_cap'), 429)
    const now = deps.now()
    const name = (u.name || st.alias).slice(0, 120)
    const id = db.transaction(() => {
      const link = createLink(
        db,
        u.id,
        { kind: 'bio', alias: st.alias, title: name, target_url: null, redirect_code: 302, data: { ...defaultBioData(name, u.name ?? '', GOAL_THEME[goal]), seo_title: name }, is_enabled: true, starts_at: null, ends_at: null, expired_url: null, click_limit: null, limit_url: null, is_sensitive: false, utm: {}, forward_query: false, public_stats: false, project_id: null },
        now,
      )
      createBlock(db, link.id, { type: 'heading', is_enabled: true, starts_at: null, ends_at: null, data: { text: name, level: 'h1' }, style: {} }, now)
      return link.id
    })()
    audit(db, { actorId: actorOf(req), userId: u.id, action: 'link.create', target: `link:${id}`, meta: { kind: 'bio', onboarding: true, goal } }, now)
    return reply.redirect(`${OB}/listo?id=${id}`, 303)
  })

  /* ---------- «tu liga ya existe» ---------- */
  app.get(`${OB}/listo`, { preHandler: userGuard }, async (req, reply) => {
    const u = req.ctx.user as User
    const link = own(u, (req.query as { id?: string }).id)
    if (!link) return reply.redirect('/panel', 303)
    const { t } = req.ctx
    const url = linkUrl(deps.config.baseUrl, link)
    const initial = (link.title || link.alias).trim().charAt(0).toUpperCase() || '?'
    return sendHtml(
      reply,
      shell(req.ctx, {
        title: t('ob.ready_h'),
        path: `${OB}/listo`,
        body: html`<h1>${t('ob.ready_h')}</h1><p class="muted">${t('ob.ready_sub')}</p>
<div class="ob-card"><span class="ob-av-lg" aria-hidden="true">${initial}</span><div><b>${link.title || link.alias}</b><a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//, '')}</a></div>
  <button type="button" class="btn" data-copy="${url}" data-copied="${t('links.copied')}">${icon('copy')} ${t('links.copy')}</button></div>
<div class="btn-row"><a class="btn btn-primary btn-lg" href="${OB}/tema?id=${link.id}">${t('ob.keep')}</a><a class="btn btn-lg" href="/panel/links/${link.id}/blocks">${t('ob.to_editor')}</a></div>`,
      }),
    )
  })

  /* ---------- guiado 1/4: tema ---------- */
  const themeOf = (l: Link) => String(l.data.theme ?? '')
  app.get(`${OB}/tema`, { preHandler: userGuard }, async (req, reply) => {
    const link = own(req.ctx.user as User, (req.query as { id?: string }).id)
    if (!link) return reply.redirect('/panel', 303)
    const { t } = req.ctx
    const cur = themeOf(link)
    return sendHtml(
      reply,
      shell(req.ctx, {
        title: t('ob.theme_h'),
        path: `${OB}/tema`,
        step: 1,
        back: `${OB}/listo?id=${link.id}`,
        skip: `${OB}/redes?id=${link.id}`,
        body: html`<h1>${t('ob.theme_h')}</h1><p class="muted">${t('ob.theme_sub')}</p>
<form method="post" action="${OB}/tema?id=${link.id}" class="ob-form" novalidate>
  ${csrfField(req.ctx)}
  <div class="ob-themes">${THEMES.map((th) => html`<label class="ob-theme"><input type="radio" name="theme" value="${th.id}"${cur === th.id ? html` checked` : ''}>${phone(th, link.title || link.alias)}<span>${t(`ob.theme_${th.id}`)}</span></label>`)}</div>
  <div class="sticky-actions btn-row"><button class="btn btn-primary btn-lg" type="submit">${t('ob.continue')}</button></div>
</form>`,
      }),
    )
  })

  app.post(`${OB}/tema`, { preHandler: userGuard }, async (req, reply) => {
    const link = own(req.ctx.user as User, (req.query as { id?: string }).id)
    if (!link) return reply.redirect('/panel', 303)
    const theme = field(req.body, 'theme')
    if (THEME_IDS.includes(theme)) updateLink(db, link.id, { data: { ...link.data, theme } }, deps.now())
    return reply.redirect(`${OB}/redes?id=${link.id}`, 303)
  })

  /* ---------- guiado 2/4: plataformas ---------- */
  const existingSocials = (linkId: number): Record<string, string> => {
    const b = listBlocks(db, linkId).find((x) => x.type === 'socials')
    return ((b?.data.links as Record<string, string> | undefined) ?? {}) as Record<string, string>
  }
  app.get(`${OB}/redes`, { preHandler: userGuard }, async (req, reply) => {
    const link = own(req.ctx.user as User, (req.query as { id?: string }).id)
    if (!link) return reply.redirect('/panel', 303)
    const { t } = req.ctx
    const have = Object.keys(existingSocials(link.id))
    return sendHtml(
      reply,
      shell(req.ctx, {
        title: t('ob.nets_h'),
        path: `${OB}/redes`,
        step: 2,
        back: `${OB}/tema?id=${link.id}`,
        skip: `${OB}/links?id=${link.id}`,
        body: html`<h1>${t('ob.nets_h')}</h1><p class="muted">${t('ob.nets_sub')}</p>
<form method="get" action="${OB}/links" class="ob-form" novalidate>
  <input type="hidden" name="id" value="${link.id}">
  <div class="ob-nets">${OFFERED.map((n) => html`<label class="ob-net"><input type="checkbox" name="n" value="${n.id}"${have.includes(n.id) ? html` checked` : ''}><svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="${n.color}"${n.evenodd ? html` fill-rule="evenodd"` : ''}><path d="${n.path}"/></svg><span>${n.name}</span></label>`)}</div>
  <div class="sticky-actions btn-row"><button class="btn btn-primary btn-lg" type="submit">${t('ob.continue')}</button></div>
</form>`,
      }),
    )
  })

  /* ---------- guiado 3/4: links (acepta @usuario o la URL) ---------- */
  const linksPage = (ctx: Ctx, link: Link, picked: string[], values: Record<string, string>, errors: Record<string, string>) => {
    const { t } = ctx
    const nets = picked.map((id) => NETWORK_BY_ID.get(id)).filter((n): n is NonNullable<typeof n> => !!n)
    return shell(ctx, {
      title: t('ob.links_h'),
      path: `${OB}/links`,
      step: 3,
      back: `${OB}/redes?id=${link.id}`,
      skip: `${OB}/perfil?id=${link.id}`,
      body: html`<h1>${t('ob.links_h')}</h1><p class="muted">${t('ob.links_sub')}</p>
<form method="post" action="${OB}/links?id=${link.id}" class="ob-form" novalidate>
  ${csrfField(ctx)}${nets.map((n) => html`<input type="hidden" name="n" value="${n.id}">`)}
  ${nets.length ? html`<h2 class="ob-h2">${t('ob.links_yours')}</h2>${nets.map((n) => html`<div class="field${errors[`s_${n.id}`] ? ' has-error' : ''}"><label for="s-${n.id}">${n.name}</label><input id="s-${n.id}" name="s_${n.id}" value="${values[`s_${n.id}`] ?? ''}" placeholder="${n.placeholder}" autocomplete="off" autocapitalize="off" spellcheck="false">${errors[`s_${n.id}`] ? html`<p class="error">${t(errors[`s_${n.id}`] as string)}</p>` : ''}</div>`)}` : ''}
  <h2 class="ob-h2">${t('ob.links_more')}</h2>
  ${[1, 2, 3].map((i) => html`<div class="field${errors[`x${i}`] ? ' has-error' : ''}"><label for="x-${i}">${t('ob.links_url')} ${i}</label><input id="x-${i}" name="x${i}" value="${values[`x${i}`] ?? ''}" placeholder="https://" inputmode="url" autocomplete="off" autocapitalize="off">${errors[`x${i}`] ? html`<p class="error">${t(errors[`x${i}`] as string)}</p>` : ''}</div>`)}
  <div class="sticky-actions btn-row"><button class="btn btn-primary btn-lg" type="submit">${t('ob.continue')}</button></div>
</form>`,
    })
  }
  const pickedOf = (v: unknown): string[] => {
    const arr = Array.isArray(v) ? v : typeof v === 'string' ? [v] : []
    return [...new Set(arr.map(String).filter((id) => OFFERED.some((n) => n.id === id)))]
  }

  app.get(`${OB}/links`, { preHandler: userGuard }, async (req, reply) => {
    const link = own(req.ctx.user as User, (req.query as { id?: string }).id)
    if (!link) return reply.redirect('/panel', 303)
    const picked = pickedOf((req.query as { n?: unknown }).n)
    const have = existingSocials(link.id)
    const values = Object.fromEntries(picked.map((id) => [`s_${id}`, have[id] ?? '']))
    return sendHtml(reply, linksPage(req.ctx, link, picked, values, {}))
  })

  app.post(`${OB}/links`, { preHandler: userGuard, config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const link = own(req.ctx.user as User, (req.query as { id?: string }).id)
    if (!link) return reply.redirect('/panel', 303)
    const picked = pickedOf(fieldAll(req.body, 'n'))
    const values: Record<string, string> = {}
    const errors: Record<string, string> = {}
    const socials: Record<string, string> = { ...existingSocials(link.id) }
    for (const id of picked) {
      const raw = field(req.body, `s_${id}`).trim()
      values[`s_${id}`] = raw
      if (!raw) continue // sin fricción: dejarlo vacío está bien
      const url = normalizeSocial(id, raw)
      if (!url || !checkTarget(db, url).ok) errors[`s_${id}`] = 'err.social'
      else socials[id] = url
    }
    const extras: string[] = []
    for (const i of [1, 2, 3]) {
      const raw = field(req.body, `x${i}`).trim()
      values[`x${i}`] = raw
      if (!raw) continue
      const c = checkTarget(db, /^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
      if (!c.ok) errors[`x${i}`] = 'err.url'
      else extras.push(c.url)
    }
    if (Object.keys(errors).length) return sendHtml(reply, linksPage(req.ctx, link, picked, values, errors), 422)
    const now = deps.now()
    db.transaction(() => {
      const blocks = listBlocks(db, link.id)
      const soc = blocks.find((b) => b.type === 'socials')
      if (Object.keys(socials).length) {
        if (soc) updateBlock(db, soc.id, { is_enabled: !!soc.is_enabled, starts_at: soc.starts_at, ends_at: soc.ends_at, data: { ...soc.data, links: socials }, style: soc.style }, now)
        else createBlock(db, link.id, { type: 'socials', is_enabled: true, starts_at: null, ends_at: null, data: { links: socials, colored: false, size: 'md' }, style: {} }, now)
      }
      const used = new Set(blocks.filter((b) => b.type === 'link').map((b) => String(b.data.url ?? '')))
      for (const url of extras) {
        if (used.has(url)) continue
        createBlock(db, link.id, { type: 'link', is_enabled: true, starts_at: null, ends_at: null, data: { label: new URL(url).host.replace(/^www\./, ''), url }, style: {} }, now)
      }
    })()
    return reply.redirect(`${OB}/perfil?id=${link.id}`, 303)
  })

  /* ---------- guiado 4/4: perfil ---------- */
  const profilePage = (ctx: Ctx, link: Link, values: Record<string, string>, errors: Record<string, string>) => {
    const { t } = ctx
    return shell(ctx, {
      title: t('ob.profile_h'),
      path: `${OB}/perfil`,
      step: 4,
      back: `${OB}/links?id=${link.id}`,
      skip: `${OB}/vivo?id=${link.id}`,
      body: html`<h1>${t('ob.profile_h')}</h1><p class="muted">${t('ob.profile_sub')}</p>
<form method="post" action="${OB}/perfil?id=${link.id}&_csrf=${encodeURIComponent(ctx.csrf)}" enctype="multipart/form-data" class="ob-form" novalidate>
  <div class="field${errors.photo ? ' has-error' : ''}"><label for="p-photo">${t('ob.photo')}</label><input id="p-photo" type="file" name="photo" accept="image/png,image/jpeg,image/webp">${errors.photo ? html`<p class="error">${t(errors.photo)}</p>` : ''}</div>
  <div class="field${errors.name ? ' has-error' : ''}"><label for="p-name">${t('ob.display')}</label><input id="p-name" name="name" value="${values.name ?? ''}" maxlength="30" required autocomplete="name">${errors.name ? html`<p class="error">${t(errors.name)}</p>` : ''}</div>
  <div class="field"><label for="p-bio">${t('ob.bio')}</label><textarea id="p-bio" name="bio" maxlength="140" rows="3" data-ob-count="140">${values.bio ?? ''}</textarea><p class="hint"><span id="ob-count">0</span>/140</p></div>
  <div class="sticky-actions btn-row"><button class="btn btn-primary btn-lg" type="submit">${t('ob.finish')}</button></div>
</form>`,
    })
  }

  app.get(`${OB}/perfil`, { preHandler: userGuard }, async (req, reply) => {
    const link = own(req.ctx.user as User, (req.query as { id?: string }).id)
    if (!link) return reply.redirect('/panel', 303)
    const blocks = listBlocks(db, link.id)
    const name = String(blocks.find((b) => b.type === 'heading')?.data.text ?? link.title ?? '').slice(0, 30)
    const bio = String(blocks.find((b) => b.type === 'paragraph')?.data.text ?? '').slice(0, 140)
    return sendHtml(reply, profilePage(req.ctx, link, { name, bio }, {}))
  })

  app.post(`${OB}/perfil`, { preHandler: userGuard, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const u = req.ctx.user as User
    const link = own(u, (req.query as { id?: string }).id)
    if (!link) return reply.redirect('/panel', 303)
    let mp
    try {
      mp = await readMultipart(req)
    } catch (e) {
      if (e instanceof UploadError) return sendHtml(reply, profilePage(req.ctx, link, {}, { photo: e.key }), 413)
      throw e
    }
    const f = (k: string) => field(mp.fields, k).trim()
    const values = { name: f('name').slice(0, 30), bio: f('bio').slice(0, 140) }
    const errors: Record<string, string> = {}
    if (!values.name) errors.name = 'err.required'
    let photoKey: string | null = null
    const photo = mp.files.find((x) => x.field === 'photo')
    if (photo && photo.buffer.length && !errors.name) {
      try {
        photoKey = (await storeImage(deps, u.id, photo.buffer, photo.filename, { maxDim: 400, square: true })).key
      } catch (e) {
        errors.photo = e instanceof UploadError ? e.key : 'err.upload_not_image'
      }
    }
    if (Object.keys(errors).length) return sendHtml(reply, profilePage(req.ctx, link, values, errors), 422)
    const now = deps.now()
    db.transaction(() => {
      const blocks = listBlocks(db, link.id)
      const keep = (b: (typeof blocks)[number], data: Record<string, unknown>) => updateBlock(db, b.id, { is_enabled: !!b.is_enabled, starts_at: b.starts_at, ends_at: b.ends_at, data, style: b.style }, now)
      const heading = blocks.find((b) => b.type === 'heading')
      if (heading) keep(heading, { ...heading.data, text: values.name })
      else createBlock(db, link.id, { type: 'heading', is_enabled: true, starts_at: null, ends_at: null, data: { text: values.name, level: 'h1' }, style: {} }, now)
      const para = blocks.find((b) => b.type === 'paragraph')
      if (values.bio) {
        if (para) keep(para, { ...para.data, text: values.bio })
        else createBlock(db, link.id, { type: 'paragraph', is_enabled: true, starts_at: null, ends_at: null, data: { text: values.bio }, style: {} }, now)
      } else if (para) keep(para, { ...para.data, text: '' })
      if (photoKey) {
        const av = blocks.find((b) => b.type === 'avatar')
        if (av) keep(av, { ...av.data, image: photoKey, alt: values.name })
        else createBlock(db, link.id, { type: 'avatar', is_enabled: true, starts_at: null, ends_at: null, data: { image: photoKey, alt: values.name, size: 'lg', shape: 'circle' }, style: {} }, now)
      }
      updateLink(db, link.id, { title: values.name, data: { ...link.data, seo_title: values.name } }, now)
      // orden de lectura: foto, nombre, descripción, redes y links
      const all = listBlocks(db, link.id)
      const rank = (t: string) => ({ avatar: 0, heading: 1, paragraph: 2, socials: 3 })[t] ?? 4
      reorderBlocks(db, link.id, all.slice().sort((a, b) => rank(a.type) - rank(b.type) || a.position - b.position).map((b) => b.id))
    })()
    return reply.redirect(`${OB}/vivo?id=${link.id}`, 303)
  })

  /* ---------- celebración ---------- */
  app.get(`${OB}/vivo`, { preHandler: userGuard }, async (req, reply) => {
    const link = own(req.ctx.user as User, (req.query as { id?: string }).id)
    if (!link) return reply.redirect('/panel', 303)
    const { t } = req.ctx
    const url = linkUrl(deps.config.baseUrl, link)
    const share = `https://wa.me/?text=${encodeURIComponent(`${link.title || link.alias}: ${url}`)}`
    return sendHtml(
      reply,
      shell(req.ctx, {
        title: t('ob.live_h'),
        path: `${OB}/vivo`,
        body: html`<div class="ob-confetti" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => html`<i style="--i:${i}"></i>`)}</div>
<h1>${t('ob.live_h')}</h1><p class="muted">${t('ob.live_sub')}</p>
<div class="ob-live"><div class="ob-frame"><iframe src="/${link.alias}?_preview=1" title="${link.title || link.alias}" loading="lazy" tabindex="-1"></iframe></div>
  <div class="ob-live-act"><p class="start-url"><a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//, '')}</a></p>
    <button type="button" class="btn" data-copy="${url}" data-copied="${t('links.copied')}">${icon('copy')} ${t('links.copy')}</button>
    <a class="btn" href="${share}" target="_blank" rel="noopener">${icon('chat')} ${t('start.share_wa')}</a>
    <a class="btn" href="/panel/qr/new?link=${link.id}">${icon('qr')} ${t('start.qr')}</a>
    <a class="btn btn-primary btn-lg" href="/panel/links/${link.id}/blocks">${t('ob.build')}</a></div></div>`,
      }),
    )
  })
}
