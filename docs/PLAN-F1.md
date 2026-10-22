# Plan F1 (MVP) — tubio

Alcance tomado de SPEC §10 F1: cuentas, páginas bio con ~20 bloques básicos/redes/medios, enlace corto con
opciones comunes (programación, contraseña, UTM, tope de clics), QR básico + dinámico, estadísticas, admin
mínimo, es/en. Stack en `docs/adr/0001-stack.md`.

Fuera de F1 (queda para F2+): dominios propios, píxeles, splash, segmentación, cloaking, bloques de captura,
embeds de redes, API REST, equipos, PWA, login con Google (necesita credenciales OAuth de Alejandro),
CSS/JS propio, planes y cobro.

## 1. Módulos

```
src/
  server.ts            arranque (lee config, migra, escucha 127.0.0.1:PORT)
  app.ts               buildApp(opts) → instancia Fastify (la usan los tests)
  config.ts            variables de entorno con valores por defecto
  db/                  conexión, migrador, migrations/NNNN-*.sql
  lib/                 piezas sin estado de negocio:
    html.ts              plantillas con escape (html``, raw, attrs)
    i18n.ts              t(), detección de idioma, formatos de fecha/número
    crypto.ts            scrypt, tokens aleatorios, sha256, comparación en tiempo constante
    totp.ts              TOTP RFC 6238 + base32
    alias.ts             normaliza/valida alias, lista de reservados, generador aleatorio
    urls.ts              valida URL destino (http/https), lista de hosts bloqueados, UTM y reenvío de query
    markdown.ts          subconjunto seguro
    ua.ts, geo.ts        dispositivo/SO/navegador, país/ciudad
    vcard.ts, ical.ts    generadores .vcf y .ics
    mail.ts              transporte SMTP o archivo
    uploads.ts           guarda y re-codifica archivos/imágenes
  modules/
    auth/                registro, login, 2FA, verificación, recuperar contraseña, sesiones, CSRF
    account/             perfil, idioma, contraseña, 2FA, exportar, borrar cuenta
    projects/            carpetas con color
    links/               CRUD de enlaces (bio, corto, archivo, vCard, evento) y sus opciones comunes
    bio/                 bloques (catálogo, esquemas, render), temas, editor
    public/              resolvedor /<alias> y pantallas de contraseña / contenido sensible
    qr/                  generador SVG, raster, CRUD, QR dinámico
    stats/               registro de eventos, agregados, exportación, limpieza por retención
    admin/               usuarios, enlaces, hosts bloqueados, ajustes, números globales
  views/               layout del panel, componentes comunes
  locales/             es-MX.json, en.json
public/                css y js estáticos (servidos en /_/static/)
tests/                 vitest
```

Cada módulo expone `register(app)` con sus rutas y un `repo.ts` con el SQL. Ninguna ruta escribe SQL directo.

## 2. Esquema de datos (migración 0001)

Fechas como entero (epoch ms, UTC). JSON en columnas `TEXT` validado por zod al leer/escribir.

| Tabla | Columnas principales |
|---|---|
| `users` | id, email (único, minúsculas), password_hash, name, locale, timezone, role (`user`/`admin`), status (`active`/`suspended`), email_verified_at, totp_secret, totp_enabled_at, is_verified (insignia), created_at, updated_at |
| `sessions` | id_hash (PK), user_id, csrf, pending_2fa, impersonator_id, created_at, expires_at, last_seen_at |
| `auth_tokens` | id, user_id, kind (`verify_email`/`reset_password`), token_hash, expires_at, used_at |
| `projects` | id, user_id, name, color, created_at |
| `files` | id, user_id, key (único), kind (`image`/`file`), original_name, mime, size, sha256, created_at |
| `links` | id, user_id, project_id, domain_id (0 = dominio principal; F2 añade `domains`), alias, kind (`bio`/`short`/`file`/`vcard`/`event`), title, target_url, redirect_code, data (JSON por tipo), is_enabled, starts_at, ends_at, expired_url, click_limit, limit_url, password_hash, is_sensitive, utm (JSON), forward_query, clicks, created_at, updated_at — **UNIQUE(domain_id, alias)** |
| `bio_blocks` | id, link_id, type, position, is_enabled, starts_at, ends_at, data (JSON), style (JSON), clicks, created_at, updated_at |
| `qr_codes` | id, user_id, project_id, name, kind, data (JSON), style (JSON), logo_file_id, link_id (QR dinámico), created_at, updated_at |
| `stat_events` | id, link_id, block_id, kind (`view`/`click`), ts, day (YYYY-MM-DD UTC), hour, visitor, country, city, device, os, browser, lang, referrer, utm_source, utm_medium, utm_campaign |
| `stat_salts` | day (PK), salt |
| `blocked_hosts` | host (PK), reason, created_at |
| `settings` | key (PK), value (JSON) |
| `audit_log` | id, actor_id, user_id, action, target, meta (JSON), ts |

Índices: `stat_events(link_id, ts)`, `stat_events(block_id, ts)`, `bio_blocks(link_id, position)`,
`links(user_id, created_at)`, `auth_tokens(token_hash)`.

El diseño de la página bio (tema, fondo, tipografía, botones, SEO, barra de anuncio, marca, enlace salto)
vive en `links.data` del enlace tipo `bio`.

## 3. Rutas

Todo lo que no es alias público vive en rutas reservadas; un alias nunca puede empezar con `_` ni ser una
palabra reservada (`panel`, `admin`, `login`, `register`, `logout`, `forgot`, `reset`, `verify`, `api`,
`static`, `assets`, `qr`, `stats`, `help`, `terms`, `privacy`, …).

**Públicas**
- `GET /` — portada mínima (entrar / crear cuenta).
- `GET /:alias` — resuelve el enlace: deshabilitado/programado/tope → URL alterna o 404; contraseña → pantalla;
  sensible → confirmación; luego según tipo: bio (HTML), corto (redirección con UTM/query), archivo (descarga),
  vCard (`.vcf`), evento (`.ics`). Registra la visita.
- `POST /:alias` — envía contraseña o confirmación de contenido sensible (deja cookie firmada por enlace).
- `GET /_/c/:blockId` — clic en bloque de enlace: cuenta y redirige.
- `GET /_/u/:key` — imágenes públicas re-codificadas. `GET /_/static/*` — css/js.

**Cuenta**: `GET|POST /register`, `/login`, `/login/2fa`, `POST /logout`, `GET /verify/:token`, `GET|POST /forgot`, `GET|POST /reset/:token`.

**Panel** (requiere sesión)
- `GET /panel` — lista de enlaces (filtro por tipo y proyecto, búsqueda).
- `GET /panel/links/new?kind=…`, `POST /panel/links`, `GET|POST /panel/links/:id`, `POST /panel/links/:id/delete`, `POST /panel/links/:id/toggle`.
- Editor bio: `GET /panel/links/:id/blocks`, `GET /panel/links/:id/design`, `POST /panel/links/:id/design`,
  `POST /panel/links/:id/blocks` (nuevo), `GET|POST /panel/blocks/:id`, `POST /panel/blocks/:id/delete|toggle|move`,
  `POST /panel/links/:id/blocks/order` (JSON con ids; lo usa el arrastre).
- `GET /panel/links/:id/stats` (+ `?format=csv|json`).
- `GET /panel/qr`, `GET /panel/qr/new`, `POST /panel/qr`, `GET|POST /panel/qr/:id`, `POST /panel/qr/:id/delete`,
  `POST /panel/qr/preview` (SVG en vivo), `GET /panel/qr/:id/download.:fmt` (svg/png/jpg/webp).
- `GET|POST /panel/projects`, `POST /panel/projects/:id`, `POST /panel/projects/:id/delete`.
- `GET /panel/account`, `POST /panel/account/profile|password|2fa/enable|2fa/disable|delete`, `GET /panel/account/export`.

**Admin** (rol admin): `GET /admin`, `GET /admin/users`, `GET|POST /admin/users/:id`, `POST /admin/users/:id/impersonate`,
`POST /admin/stop-impersonating`, `GET /admin/links`, `POST /admin/links/:id/toggle`, `GET|POST /admin/blocked-hosts`,
`GET|POST /admin/settings`.

## 4. Catálogo de bloques F1 (22)

Básicos: `link`, `big_link` (destacado), `image_link` (botón con imagen), `heading` (H1–H6), `paragraph`,
`markdown`, `avatar`, `image`, `divider`, `list`, `alert`, `marquee`.
Redes: `socials` (lista de redes con su color; iconos propios), `share`.
Medios: `youtube`, `vimeo`, `tiktok`, `twitch`, `spotify`, `soundcloud`, `video` (URL de archivo), `audio` (URL de archivo).

Cada tipo declara: esquema zod de `data`, campos del formulario, render público y si cuenta clics. Los embeds
sólo aceptan URLs de su proveedor y se convierten a la URL de embed oficial; el iframe va con `sandbox`,
`loading="lazy"` y la CSP pública lista únicamente esos orígenes en `frame-src`.

## 5. Estadísticas

- Evento `view` al abrir cualquier enlace (página bio = visita; corto/archivo/vCard/evento = clic) y `click`
  al pasar por `/_/c/:blockId`. Crawlers (isbot) no cuentan; tampoco la vista previa del editor (`?_preview=1` del dueño).
- `visitor = sha256(sal_del_día + ip + user-agent)`; las sales viejas se borran a los 2 días → el único que se
  puede contar es por día (documentado como decisión de privacidad).
- Agregados por rango: totales, serie diaria (SVG propio), país, ciudad, dispositivo, SO, navegador, idioma,
  referente, UTM, hora; clics por bloque. Exportar CSV/JSON. Retención en ajustes (default 365 días); limpieza diaria.

## 6. Orden de trabajo (un commit por paso, tests en verde)

1. Esqueleto: package.json, tsconfig, vitest, config, `buildApp`, `/healthz`, DEPENDENCIAS.md.
2. BD: conexión WAL + migrador + migración 0001 con tests.
3. `lib/html.ts`, i18n (es-MX/en, test de claves iguales), layout del panel y CSS base.
4. Auth: registro, login, logout, sesiones, CSRF, rate limit, verificación de correo, recuperar contraseña.
5. 2FA TOTP + página de cuenta (perfil, idioma, contraseña, exportar, borrar).
6. Enlaces: alias, validación de URL, CRUD de enlace corto y resolvedor con todas las opciones comunes.
7. Archivo, vCard y evento.
8. Proyectos.
9. Página bio: diseño/temas + render público.
10. Bloques: catálogo F1, editor (alta/edición/orden/activar), clics.
11. Estadísticas: registro, agregados, vista, exportación, retención.
12. QR: generador SVG con estilos, raster, CRUD, QR dinámico.
13. Admin mínimo.
14. Pulido: accesibilidad, CSP, tamaños de página, README de instalación, PM2 local en 127.0.0.1:3095.

Hitos con aviso a Alejandro: (a) esqueleto+auth, (b) enlaces cortos, (c) páginas bio, (d) estadísticas+QR, (e) admin y F1 completa.

## 7. Estado (2026-10-22)

Hecho, con tests (`npm run check`: tsc + 93 tests de vitest):

| Paso | Estado |
|---|---|
| 1–3 Esqueleto, BD/migraciones, plantillas, i18n | ✅ |
| 4–5 Cuentas: registro, login, 2FA TOTP, verificación, recuperar, perfil, exportar, borrar | ✅ |
| 6–8 Enlaces corto/archivo/vCard/evento + opciones comunes; proyectos | ✅ |
| 9–10 Página bio: 22 bloques, editor con arrastre y vista previa, 10 temas, diseño completo | ✅ |
| 11 Estadísticas por enlace y globales, CSV/JSON, página pública opcional, retención | ✅ |
| 12 QR: 10 tipos, dinámico, estilos, logo, marco, SVG/PNG/JPG/WEBP | ✅ |
| 13 Admin mínimo | ✅ |
| 14 Pulido: axe sin fallas reales, CSP, README, PM2 local en 127.0.0.1:3095 | ✅ |

Pendiente de F1 / decisiones de Alejandro:
- **Login con Google** (SPEC §6): falta un cliente OAuth (client id/secret y redirect `https://tubio.link/login/google/callback`).
- **SMTP** para correos de verificación y recuperación (hoy quedan en `data/mail/`).
- **Base geo DB-IP Lite** (CC-BY): descargarla a `data/geo/` para ver país/ciudad.
- **Despliegue** en la suscripción `tubio.link` (hoy ahí está el clon v63): nginx → 127.0.0.1:3095 sólo con ok.
- **Repo público** `xmedook/tubio` sólo con ok.

Notas de diseño:
- Únicos = hash distinto por día (sal diaria borrada a los 2 días): por privacidad no se puede contar un visitante entre días.
- Fuentes de la página bio: pilas del sistema (cero peticiones externas). Fuentes web OFL autoalojadas → F2.
- HTML propio en bloques: no existe en F1 (markdown seguro en su lugar).
