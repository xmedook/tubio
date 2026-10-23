# Home pública de tubio.link · kit M1 Charla (design, 23-oct-2026)

Archivos: `index.html` (maqueta es-MX), `home.css` (estilos de la portada), `tokens.css` (= `../tokens-charla.css`, con
`--accent-on-soft`). `gen-home.py` regenera `index.html` (textos, planes, FAQ arriba del script); `iconos.py` = íconos propios.
Capturas: `capturas/home-<390|768|1440>-<light|dark>.png`.

## Para pasarlo a `src/modules/home/landing.ts`
- Textos: van directo a `t()` (es-MX listo; falta en). Nada nuevo inventado: planes y precios salen de las migraciones
  0010/0019 (Gratis · Pro $99/mes o $990/año · Negocio $299/mes o $2 990/año, IVA incluido, prueba 14 días; fundadores:
  primeras 100 cuentas, 1 año de Negocio).
- `[data-quedan]` = lugares de fundador restantes (hoy el landing ya los calcula: «Quedan N»). Si se acaban, ocultar
  `[data-fundadores]` y el sello «Gratis 1 año para fundadores» del plan Negocio.
- Formulario de reclamar: igual que hoy (`GET /register`, `name="alias"`, 3–60). Con sesión iniciada, cambia el bloque por
  el botón «Ir a mi panel» (`/panel`) como ya hace el landing. Si la lista de espera está activa, usa el form `/waitlist` actual.
- Botones de planes apuntan a `/register?plan=pro|business`: si `/register` no lee `plan`, déjalos en `/register`.
- Rutas usadas: /register, /login, /login/google, /lang/en?next=/, /directory, /blog, /help, /terms, /privacy,
  /acceptable-use, /security, /source. Agregar páginas del sitio (`opts.pages`) al pie como hoy.
- Los teléfonos son maquetas decorativas (`aria-hidden`), sin imágenes: todo es HTML/CSS.

## Verificado (Playwright)
390/768/1440 en claro y oscuro: 0 objetivos táctiles < 44 px, 0 textos < 14 px, sin scroll horizontal. Contraste AA de los
tokens (y `--accent-on-soft` para íconos/texto sobre `--soft`). Letra del sistema, sin descargar fuentes. Transiciones sólo con
`prefers-reduced-motion: no-preference`. Sin testimonios inventados; footer con términos, privacidad y código fuente.
