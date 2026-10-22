# tubio — link in bio open source (AGPL-3.0-or-later)

SaaS propio de páginas bio, enlaces cortos, QR y estadísticas para **tubio.link**. Especificación: `docs/SPEC.md` (manda).

## ⛔ Clean room (no negociable)
Este proyecto es una reescritura **desde cero** de funciones que también tiene un producto comercial (66biolinks de AltumCode).
Para que el código sea legalmente nuestro y publicable:
- **Nunca** leas, copies, abras ni hagas grep en: `remote/sessions/rea/rea-work/`, `/var/www/vhosts/tubio.link/`, `alav.link` (ionos2), ni ningún paquete/código/CSS/SQL/textos de idioma/imágenes de AltumCode u otro producto propietario.
- No pidas a otras sesiones fragmentos de ese código. Si la SPEC no alcanza, pregúntale a Alejandro qué debe hacer la función.
- Librerías open source con licencia compatible con AGPL (MIT/BSD/Apache/ISC/LGPL/AGPL) sí; registra cada dependencia en `docs/DEPENDENCIAS.md`.
- Assets (iconos, fuentes, imágenes) sólo libres y con su atribución.

## Stack sugerido (decide y documenta en docs/adr/0001)
Node 22 (nvm) + TypeScript, Fastify, SQLite (better-sqlite3, WAL) con migraciones propias, vistas renderizadas en servidor para la página pública,
panel con JS mínimo (htmx/Alpine/Sortable o similar). i18n es-MX/en desde el día 1. Tests (vitest) antes de cada entrega.

## Despliegue (cuando F1 esté lista y con ok de Alejandro)
aws2, PM2 + nginx de Plesk en la suscripción `tubio.link` (hoy ahí corre el clon AltumCode v63, NO lo borres: pide ok antes de reemplazarlo).
Repo: git local; GitHub público `xmedook/tubio` sólo con ok de Alejandro.
