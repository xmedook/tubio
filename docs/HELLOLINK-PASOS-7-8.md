# hellolink — pasos 7 y 8 (plantillas por giro, home nuevo, alta asistida)

## Qué hay
- **6 plantillas por giro** (`src/modules/minisitio/giros.ts`): restaurante, belleza, salud, inmobiliaria, fitness, servicios. `applyGiro()` arma
  páginas, secciones y bloques con contenido de ejemplo ficticio (sin fotos). Lo que se escribe en el asistente (nombre, WhatsApp, dirección, logo,
  Instagram) reemplaza lo de ejemplo; sin dirección no hay mapa ni «Cómo llegar»; sin WhatsApp no hay botones de WhatsApp rotos.
- **Asistente «giro primero»** (`/panel/start`): las 6 tarjetas de giro van arriba; los links en bio de antes siguen debajo («Solo enlaces»).
  `?giro=` preselecciona; el giro viaja desde la portada por `/register?giro=` hasta el asistente.
- **Home nuevo** (`home/landing.ts`, `shell.ts`): héroe con chips de giro y teléfono de muestra que cambia por CSS (`:has`), ejemplos vivos, 3 pasos +
  «lo armamos por ti», qué incluye, tarjetas por giro, estadísticas, planes, FAQ, cierre y barra móvil. JS sólo `home.js` (eco del alias en el teléfono).
- **Páginas por giro** `/restaurantes`, `/belleza`, `/salud`, `/inmobiliarias`, `/fitness`, `/servicios-profesionales` (`home/giro-page.ts`, textos es/en en
  `home/giro-copy.ts`, JSON-LD FAQPage). Los slugs son alias reservados.
- **«Lo armamos por ti»** `/armamos-por-ti` → tabla `assisted_requests` (migración 0028) → cola en `/admin/assisted` (estado nuevo/en curso/entregada, nota).
  Sin subida de archivos: logo y fotos se piden por WhatsApp/correo. Trampa anti-robot + prueba de trabajo + límite 5/10 min.
- **WhatsApp de ventas**: ajuste de admin `sales_whatsapp` (Admin → Ajustes). Vacío = no hay botón en cabecera, cierre ni barra móvil.

## Al desplegar
1. `git pull` + `npm ci --omit=dev --ignore-scripts` + migraciones (0026–0028) + `pm2 restart tubio`.
2. Admin → Ajustes → poner el WhatsApp de ventas.
3. `npm run ejemplos` (idempotente; crea la cuenta interna `ejemplos@tubio.link` y los 6 `/ejemplo-<giro>`, noindex). Con el número ya puesto, los
   botones de WhatsApp de los ejemplos llegan a ventas; para rehacerlos: `npm run ejemplos -- --rehacer`.
4. Si ya existía un alias `restaurantes`, `belleza`, `salud`, `inmobiliarias`, `fitness`, `servicios-profesionales` o `armamos-por-ti` en producción,
   la ruta de la portada lo tapa: renombrarlo antes de publicar.
