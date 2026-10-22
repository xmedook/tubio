# ADR 0001 — Stack de tubio

- Estado: aceptado
- Fecha: 2026-10-22

## Contexto

tubio es un SaaS de "link in bio" (páginas bio, enlaces cortos, QR, estadísticas) que se publica como
software libre (AGPL-3.0-or-later) y se escribe en clean room (ver `CLAUDE.md`). Corre en un solo host
(aws2, Plesk) detrás de nginx, con PM2. Requisitos que pesan en la elección (SPEC §9):

- La página pública se renderiza en servidor, pesa <50 KB de JS, LCP <1.5 s en 4G y no depende de CDN de terceros.
- i18n es-MX/en desde el día uno; accesible y móvil primero.
- Seguridad: CSRF, HTML de usuario sanitizado, iframes en sandbox con CSP, límites de tasa, subidas con tipo verificado.
- Equipo chico: pocas piezas, cero servicios extra (nada de Redis, Postgres ni colas para el MVP).

## Decisión

| Pieza | Elección | Por qué |
|---|---|---|
| Runtime | **Node 22** (nvm) ejecutando **TypeScript nativo** (type stripping de Node, sin paso de build) | Un archivo `.ts` corre tal cual con `node`; `tsc --noEmit` sólo revisa tipos. Restricción: nada de `enum`/`namespace`/parameter properties y los imports llevan extensión `.ts`. |
| HTTP | **Fastify 5** + `@fastify/cookie`, `@fastify/formbody`, `@fastify/multipart`, `@fastify/static`, `@fastify/rate-limit` | Rápido, con `inject()` para tests sin abrir puerto. |
| Base de datos | **SQLite** con **better-sqlite3**, modo WAL, `foreign_keys=ON` | Un archivo, respaldo trivial, síncrono y rápido para un solo host. |
| Migraciones | Propias: `src/db/migrations/NNNN-nombre.sql`, aplicadas en orden dentro de una transacción, registradas en `schema_migrations` | Sin dependencia; legibles. |
| Vistas | **Plantillas propias en TS**: función etiquetada `html\`…\`` que escapa todo por defecto (`raw()` explícito para lo ya seguro) | Tipadas, sin motor de plantillas, imposible olvidar escapar. |
| Panel | HTML de servidor + formularios normales; JS mínimo propio en `public/js/`; **SortableJS** (MIT, servido localmente) para ordenar bloques, con botones subir/bajar accesibles como alternativa | Funciona sin JS; el arrastre es mejora progresiva. |
| Validación | **zod** | Esquemas de entrada por ruta. |
| Contraseñas | `crypto.scrypt` de Node (N=2^15, r=8, p=1) | Sin dependencia nativa. |
| Sesiones | Propias: cookie aleatoria (32 bytes), en BD sólo su SHA-256; 30 días deslizantes | Revocables, sin JWT. |
| CSRF | Token por sesión (doble envío para anónimos) + revisión de `Origin`; cookies `SameSite=Lax` | Estándar y simple. |
| 2FA | TOTP RFC 6238 propio (HMAC-SHA1, base32) | 40 líneas, sin dependencia. |
| Correo | **nodemailer** por SMTP (`SMTP_URL`); sin SMTP escribe `.eml` en `data/mail/` | Desarrollo sin mandar nada. |
| QR | **qrcode** (MIT) sólo para la matriz; el SVG estilizado (módulos, ojos, degradado, logo) lo dibujamos nosotros; **sharp** (Apache-2.0) rasteriza a PNG/JPG/WEBP | Control total del estilo. |
| Imágenes subidas | **sharp**: se re-codifican (quita metadatos, limita tamaño) a WEBP; **file-type** (MIT) verifica el tipo real por firma | Nunca se sirve lo que subió el usuario sin pasar por aquí (salvo enlaces tipo Archivo, que van con `attachment` + `nosniff`). |
| Estadísticas | Tabla de eventos en SQLite; **isbot** (Unlicense) descarta crawlers; **bowser** (MIT) para dispositivo/SO/navegador; **maxmind** (MIT) lee la base **DB-IP Lite** (CC-BY 4.0) si existe | IP nunca en claro: `visitor = sha256(sal_diaria + ip + ua)`. Sin base geo, país = desconocido. |
| Markdown | Subconjunto propio (negritas, cursivas, enlaces, listas, código) sobre texto **ya escapado** | Seguro por construcción; nada de HTML crudo del usuario en F1. |
| i18n | Propio: `src/locales/{es-MX,en}.json`, `t(clave, vars)`; idioma por preferencia → cookie → `Accept-Language` | Un test exige que ambos archivos tengan las mismas claves. |
| Tests | **vitest** + `app.inject()`, BD en memoria por test | `npm test` antes de cada entrega. |
| Proceso | PM2 (`ecosystem.config.cjs`), escucha sólo en `127.0.0.1` | nginx de Plesk hace TLS. |

Puerto de desarrollo: **127.0.0.1:3095**.

Cada dependencia y su licencia queda en `docs/DEPENDENCIAS.md`; sólo se aceptan licencias compatibles con AGPL
(MIT/BSD/ISC/Apache-2.0/0BSD/Unlicense/MPL-2.0/LGPL/AGPL).

## Consecuencias

- Sin build: el despliegue es `git pull && npm ci --omit=dev && pm2 reload`. A cambio, el código evita la sintaxis
  TS que Node no sabe quitar (lo vigila `erasableSyntaxOnly` en `tsconfig.json`).
- SQLite limita a un host y un escritor; suficiente para el volumen esperado. Si algún día no alcanza, el acceso a
  datos está concentrado en repositorios por módulo, así que cambiar a Postgres es acotado.
- Las plantillas en TS hacen que la UI sea código: más verboso que un motor de plantillas, pero tipado y con
  escape obligatorio.
- Las fuentes de la página bio en F1 son pilas de fuentes del sistema; fuentes web libres autoalojadas (OFL) en F2.
