# Accesibilidad (WCAG 2.2 AA)

## Automática — `npm run a11y`
axe-core (vía Playwright) sobre la instalación corriendo, en modo claro y oscuro, páginas públicas y panel con sesión:

```bash
TUBIO_A11Y_URL=http://127.0.0.1:3095 TUBIO_A11Y_USER=demo@tubio.local TUBIO_A11Y_PASS=demo-demo-demo npm run a11y
# TUBIO_A11Y_BIO=<alias> para auditar otra página bio; CHROMIUM_PATH si Playwright no trae su navegador
```
Se excluyen los iframes de terceros (YouTube, Telegram…): su contraste y etiquetas no los controlamos.

Además `tests/themes-contrast.test.ts` exige 4.5:1 en **cada** tema: texto contra cada punto del degradado de fondo y
botón (compuesto si es translúcido) contra el fondo. axe no puede medir texto sobre degradados; esta prueba sí.

### Corrida 2026-10-22
- Públicas (portada, login, registro, recuperar, ayuda, contacto, directorio, blog, términos, seguridad, 404) y panel
  (resumen, enlaces, nuevo enlace/página, QR, estadísticas, cuenta, plan, afiliados, editor de bloques, diseño): **0**.
- Páginas bio con los 10 temas: **0** tras arreglar:
  - pie «hecho con tubio» / «reportar» con `opacity` → 3.08:1 en «papel», 4.45:1 en «neón» (se quitó la opacidad),
  - «abierto ahora» verde sobre tarjeta oscura (3.13:1) → color del texto + punto de color,
  - botón «menta» blanco sobre #10b981 (2.53:1) → #047857,
  - «atardecer»: texto blanco sobre #f97316 (2.8:1, invisible para axe por ser degradado) → degradado más oscuro,
  - galería sin texto alternativo → «Foto (n de total)»,
  - botón de cupón con nombre accesible distinto del texto visible.

## Manual (pendiente — requiere persona)
- [ ] Recorrido completo con teclado (Tab/Shift+Tab/Enter/Espacio/Esc): registro → página bio → bloques → diseño → QR.
- [ ] VoiceOver (iOS/macOS) y NVDA (Windows) en página bio y editor de bloques.
- [ ] Zoom 200 % y 400 % (reflujo sin scroll horizontal), `prefers-reduced-motion`.
- [ ] Mensajes de error anunciados (`role="alert"`) en formularios del panel.
