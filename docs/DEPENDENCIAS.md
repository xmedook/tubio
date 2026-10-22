# Dependencias y licencias

Sólo licencias compatibles con AGPL-3.0-or-later. Revisar al añadir cualquier paquete
(`npm ls --omit=dev --all` + campo `license`). Última revisión: 2026-10-22 — árbol de producción:
101 MIT, 12 ISC, 6 BSD-3-Clause, 5 BlueOak-1.0.0, 4 Apache-2.0, 2 LGPL-3.0-or-later (binarios libvips de sharp),
1 Unlicense, 1 MIT-0, 1 0BSD.

## Directas de producción

| Paquete | Licencia | Para qué |
|---|---|---|
| fastify | MIT | servidor HTTP |
| @fastify/cookie | MIT | cookies firmadas |
| @fastify/formbody | MIT | formularios urlencoded |
| @fastify/multipart | MIT | subida de archivos |
| @fastify/static | MIT | css/js/imágenes estáticas |
| @fastify/rate-limit | MIT | límite de tasa en login/registro/contraseñas |
| better-sqlite3 | MIT | SQLite |
| zod | MIT | validación de entrada |
| qrcode | MIT | matriz de códigos QR (el dibujo SVG es nuestro) |
| sharp | Apache-2.0 (libvips LGPL-3.0) | re-codificar imágenes, rasterizar QR |
| file-type | MIT | verificar tipo real de archivos subidos |
| isbot | Unlicense | excluir crawlers de las estadísticas |
| bowser | MIT | dispositivo / SO / navegador |
| maxmind | MIT | leer base geo MMDB |
| nodemailer | MIT-0 | correo SMTP |
| sortablejs | MIT | ordenar bloques arrastrando (servido localmente) |

## Desarrollo

| Paquete | Licencia |
|---|---|
| typescript | Apache-2.0 |
| vitest | MIT |
| zxing-wasm (tests: leer los QR generados) | MIT |
| @types/node, @types/better-sqlite3, @types/qrcode, @types/nodemailer | MIT |

## Datos y assets

| Recurso | Licencia | Atribución |
|---|---|---|
| DB-IP "IP to City Lite" (opcional, no se versiona) | CC-BY 4.0 | "IP Geolocation by DB-IP" (https://db-ip.com) — se muestra en la página de estadísticas cuando la base está instalada |
| Iconos de redes y de la interfaz | propios (AGPL, dibujados para tubio) | — |
| Favicon / marca tubio | propio | — |
