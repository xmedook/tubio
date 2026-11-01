# Home nuevo — diseño de design, sección C (1-nov-2026)

Origen: `remote/shared/proyectos/tubio/tubio-diseno-2026-10-31/home.html` + `fuente/base.css` (artefacto https://claude.ai/artifact/73zUyLquCtCJTFR6PEJJB1). Orden de Alejandro #546/#548.

## Qué hay
- `src/modules/home/landing.ts` — el home (`landingPage`), con las mismas secciones del diseño: franja lima, cabecera, titular con «una liga» marcado, «Prueba cómo se verá tu liga», **los 6 ejemplos reales**, qué incluye (8), cómo funciona (3), **precio como marcador** (`$0,000`, «Precio por definir»), FAQ (4), cierre oscuro y barra fija.
- `src/modules/home/shell-v3.ts` — `<head>`, cabecera, pie y barra fija. Las páginas por giro y «lo armamos por ti» siguen con `homeShell` (sin cambios de diseño; solo sus anclas del menú ahora apuntan al home nuevo).
- `public/css/home-v3.css` (versionado con `ASSET_VERSION`) y `public/js/home-v3.js`. Sin estilos ni scripts en línea; el script lleva `nonce` por la CSP de siempre.
- Fuentes **propias**: Bricolage Grotesque y Figtree (`@fontsource-variable/*`, OFL) por `/_/fonts/<archivo>` (lista en `home/fonts.ts`, registrada en la ruta de fuentes de `bio/routes.ts`). Sin Google Fonts: la CSP (`font-src 'self'`) no cambió.
- Textos en `src/locales/{es-MX,en}.json`, claves `h4.*` (el diseño está en español; la versión en inglés es nuestra).

## Decisiones
- **Ejemplos = imágenes, no iframes.** El diseño usa iframes con `srcdoc`; con 6 ejemplos vivos serían 6 páginas completas cargadas en el móvil, y los minisitios mandan `frame-ancestors 'none'` (SITE_CSP) a propósito. Cada «teléfono» es la captura (WebP, 12–17 KB) de `/ejemplo-<giro>` en 390×800: `npm run ejemplos-img` las regenera (instancia desechable) y se sube `ASSET_VERSION`. «Abrir ejemplo» lleva al sitio vivo.
- **Un solo camino:** «Hazlo para mi negocio», «Quiero mi liga» y «Quiero mi sitio» → `/armamos-por-ti`; con lo que se escribió en «Prueba…» viaja como `?negocio=` y el formulario lo precarga. «Hablar con una persona», la barra fija y el cierre usan `sales_whatsapp` (si no hay número, no salen y el cierre manda a «lo armamos por ti»).
- **Registro propio:** el campo de alias del home viejo ya no está. Con `registration_open` hay un enlace discreto «¿Prefieres hacerlo tú? Crea tu liga» → `/register?alias=<lo escrito>`; cerrado, el cierre muestra la lista de espera (con su prueba de trabajo).
- **Se quitan del home:** planes y precios reales, contador de fundadores (siguen en el panel y en la lógica), chips de giro, estadísticas de muestra y el bloque «software libre». El enlace al código fuente (AGPL §13) sigue en el pie. Cuando haya precio, el marcador se sustituye en `landing.ts` (sección `#precio`).
- **Foco visible:** el anillo es de tinta (el de lima del diseño no contrasta con la crema).
- Detalle de CSS: `.rail{position:relative}` es necesario: los `.sr` (texto solo para lectores) de cada ejemplo son `absolute` y, sin él, ensanchaban la página 991 px.

## Verificación
`npx vitest run` (294) · `npx tsc --noEmit` · `node scripts/a11y.ts` (axe WCAG 2.2 AA: 0 violaciones con registro abierto y cerrado, y en inglés) · `npm run home-capturas -- <carpeta> [--whatsapp 521…] [--abierto]` (capturas 390/1440 y desborde horizontal = 0).
