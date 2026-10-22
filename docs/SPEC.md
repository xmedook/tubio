# tubio — especificación funcional (clean room)

> **Regla clean room.** Este documento describe *qué hace* un producto de "link in bio" a nivel de
> funciones visibles para el usuario. Lo escribió quien estudió un producto comercial; quien implemente
> **no** debe leer, copiar ni consultar código, vistas, CSS, SQL, textos de idioma ni assets de ningún
> producto comercial (en particular nada bajo `remote/sessions/rea/rea-work/` ni `/var/www/vhosts/tubio.link/`
> ni `alav.link`). Todo nombre de tabla, ruta, campo, texto e interfaz se diseña desde cero.
> Licencia del proyecto: **AGPL-3.0-or-later**.

## 1. Qué es
SaaS multiusuario de "link in bio": cada usuario crea páginas públicas (`tubio.link/<alias>`) hechas de
bloques, enlaces cortos con redirección, códigos QR y ve estadísticas de visitas. Idioma principal
español (México), con inglés.

## 2. Tipos de enlace
Todo vive bajo un alias único por dominio (`/<alias>`):
1. **Página bio** — página pública compuesta de bloques ordenables.
2. **Enlace corto** — redirige (301/302/307/308 configurable) a una URL destino.
3. **Archivo** — sirve/descarga un archivo subido.
4. **Tarjeta vCard** — descarga un `.vcf` con datos de contacto.
5. **Evento** — descarga un `.ics` de calendario.
6. **Sitio estático** — sirve un HTML/ZIP subido (fase 2).

Opciones comunes de cualquier enlace (cada una opcional):
- Programación: activo sólo entre fecha inicio/fin; URL alterna al expirar.
- Tope de clics; URL alterna al llegar al tope.
- Contraseña de acceso (pantalla propia, con SEO propio).
- Aviso de contenido sensible (pantalla de confirmación).
- Parámetros UTM añadidos al destino; reenviar los query params de la visita.
- Segmentación: destino distinto por país, dispositivo, idioma del navegador, SO o rotación A/B por porcentaje.
- Píxeles de seguimiento (Meta, Google Analytics/GTM, TikTok, LinkedIn, Pinterest, X, Snapchat, Quora).
- Página intermedia (splash) con cuenta regresiva y anuncio, antes de redirigir.
- Ocultar destino ("cloaking": muestra el destino dentro de un marco con título/descr. propios).
- Proyecto (carpeta/etiqueta de color) para organizarlos.
- Dominio: el principal o uno propio del usuario.

## 3. Página bio
### 3.1 Diseño
- Temas prediseñados + personalización: fondo (color, degradado de 2 colores, imagen, video, preset
  animado), desenfoque/brillo de fondo, tipografía (lista de Google Fonts curada), tamaño de letra,
  ancho de la columna, espaciado entre bloques, alineación, animación de entrada y de hover.
- Estilo de botones por defecto: color de texto, fondo, borde (grosor, color, estilo, radio), sombra.
- Barra de anuncio arriba/abajo con texto, colores y enlace.
- SEO: título, descripción, palabras clave, imagen OG, bloquear indexación.
- Favicon propio, CSS/JS propio (sólo en planes que lo permitan; JS propio aislado por plan).
- Marca: "hecho con tubio" visible u oculta según plan; marca propia (texto + URL).
- Botón "compartir", botón "instalar como app" (PWA, fase 2), modo directorio público opcional.
- "Enlace salto": la página entera redirige temporalmente a una URL.
- Verificado: insignia de cuenta verificada (la otorga el admin).

### 3.2 Bloques
Cada bloque: activo/inactivo, programación de fechas, estilo propio (hereda del tema), orden por arrastre,
y cuenta sus clics. Catálogo agrupado:

| Grupo | Bloques |
|---|---|
| Básicos | enlace (botón), encabezado (H1–H6), párrafo, texto enriquecido / markdown, avatar, imagen, separador, lista, alerta/aviso, texto en marquesina, botón destacado grande, botón con imagen destacada |
| Redes | iconos sociales (lista de ~40 redes con su color), compartir |
| Medios | YouTube, Vimeo, TikTok, Twitch, Kick, Rumble, VK, video propio, audio propio, Spotify, Apple Music, SoundCloud, Tidal, Mixcloud, Bandcamp |
| Embeds | X/Twitter (perfil, post, video), Instagram, Facebook, Threads, Bluesky, Pinterest, Reddit, Tumblr, Snapchat, Telegram, Discord, Calendly, Typeform, Google Forms, Canva, mapas, iframe, PDF, hojas de cálculo y presentaciones embebidas |
| Captura | recolector de correo, de teléfono, formulario de contacto, suscripción a la página (aviso de nuevas publicaciones), encuesta con resultados |
| Negocio | horario de atención (con zona horaria y "abierto ahora"), reseñas/testimonios, FAQ (acordeón), línea de tiempo, contador numérico, cuenta regresiva, cupón (copia código), vCard, archivo descargable, servicio/producto con precio, donación, PayPal, cita/calendario de reservas, clima de una ciudad, feed RSS, feed de YouTube, comparador de imágenes antes/después, galería en cuadrícula, carrusel, ventana modal con texto, HTML propio (sandbox) |

Lo recolectado por bloques de captura se guarda como **"datos"** del usuario (exportable a CSV) y puede
disparar notificaciones (correo, webhook, Slack, Discord, Telegram).

Bloques de pago (producto, donación, servicio) cobran con el procesador de pagos propio del usuario
(Stripe/PayPal/Mercado Pago) — fase 3.

## 4. Códigos QR
- Generador para: URL, texto, teléfono, SMS, correo, WhatsApp, Wi‑Fi, vCard, evento, ubicación,
  criptomoneda, PayPal, y "enlace de tubio" (QR dinámico que apunta a un enlace corto editable).
- Estilo: color sólido o degradado, fondo transparente o de color/imagen, forma de los módulos (cuadrado,
  punto, redondeado…), forma de ojos interior/exterior, logo al centro con tamaño, marco con texto,
  nivel de corrección de errores, margen, tamaño.
- Descarga PNG / SVG / JPG / WEBP. Se guardan para editarlos después.

## 5. Estadísticas
- Por enlace, por bloque y agregadas: visitas, visitantes únicos, clics por bloque.
- Desglose: fecha (rango con calendario), país, ciudad, dispositivo, SO, navegador, idioma, referente,
  parámetros UTM, horas del día.
- Privacidad: IP nunca se guarda en claro (hash con sal diaria); detección de bots excluye crawlers;
  retención configurable por plan. Geo con base IP libre (p. ej. DB-IP Lite, CC-BY).
- Exportar CSV / JSON. Página de estadísticas pública opcional por enlace.

## 6. Cuenta y organización
- Registro con correo + contraseña (verificación por correo), login con Google, 2FA TOTP, recuperar
  contraseña, borrar cuenta, exportar sus datos.
- Proyectos (agrupar enlaces), píxeles reutilizables, páginas splash reutilizables, dominios propios
  (el usuario apunta CNAME/A y el sistema emite TLS), manejadores de notificación.
- Equipos: invitar miembros por correo con permisos por recurso (fase 2).
- API REST con llave por usuario para enlaces, bloques, QR, estadísticas, datos, dominios, píxeles.

## 7. Planes y cobro (fase 3)
- Plan gratis, planes de pago mensuales/anuales/de por vida, prueba gratis, cupones, impuestos.
- Cada plan limita: número de páginas bio, enlaces cortos, bloques por página, bloques disponibles,
  QR, dominios propios, proyectos, píxeles, retención de estadísticas, CSS/JS propio, quitar marca,
  dominios, equipos, API.
- Pasarelas: Stripe y Mercado Pago (México) primero; transferencia manual con comprobante.
- Facturas descargables. Afiliados/referidos (fase 4).

## 8. Panel de administración
- Usuarios (buscar, editar plan, suspender, verificar, iniciar sesión como), enlaces, dominios,
  pagos, planes, cupones, páginas estáticas del sitio (términos, privacidad) y blog, anuncios del sistema,
  temas de página bio, ajustes generales (marca, SMTP, captcha, login social, pagos, límites, mantenimiento),
  bitácora de actividad, estado de cron, estadísticas globales.

## 9. No funcionales
- Página bio pública: HTML renderizado en servidor, <50 KB de JS, LCP < 1.5 s en 4G, sin depender de CDN de terceros.
- Seguridad: CSRF, sanitizado de HTML de usuario, iframes/HTML propio en sandbox con CSP, límites de tasa,
  subida de archivos con tipo verificado y tamaño máximo por plan, URLs destino revisadas contra lista de
  dominios bloqueados y (opcional) Google Safe Browsing.
- Despliegue: un solo host (aws2, Plesk), proceso PM2 detrás de nginx; base de datos respaldada a diario.
- Accesible (WCAG AA) y móvil primero; i18n desde el día uno (es-MX, en).

## 10. Fases
- **F1 (MVP):** cuentas, páginas bio con ~20 bloques básicos/redes/medios, enlace corto con opciones
  comunes (programación, contraseña, UTM, tope de clics), QR básico + dinámico, estadísticas, admin mínimo, es/en.
- **F2:** dominios propios, píxeles, splash, segmentación, resto de embeds, bloques de captura + datos +
  notificaciones, API, equipos, PWA.
- **F3:** planes y cobro, bloques de pago.
- **F4:** afiliados, directorio, blog, sitios estáticos.
