# Hoja de ruta de tubio — de F1 a producto terminado

Estado al 2026-10-22: **F1 en producción** (https://tubio.link). Base: `docs/SPEC.md` (manda) y `docs/PLAN-F1.md`.
Cada fase termina con: tests en verde, revisión de seguridad independiente, despliegue en aws1.nexosrv.one y aviso.
Tamaño relativo: **S** ≈ 1 sesión, **M** ≈ 2–3, **L** ≈ 4+.

---

## F1.5 — Endurecer para tráfico real (antes de anunciar)  · M

Lo que hace falta para que la gente pueda usar tubio sin riesgo, sin funciones nuevas grandes.

| Tema | Entregable |
|---|---|
| Respaldos fuera del servidor | Copia diaria de `tubio.sqlite` + `uploads/` a R2 desde el crontab de aws2 (como el resto de la flota) y **prueba de restauración** documentada |
| Monitoreo | Monitor en Uptime Kuma (stack) para `/healthz` y una página bio; errores 5xx y fallas de tareas → Telegram |
| Anti-abuso | Captcha propio sin terceros (prueba de trabajo, ALTCHA MIT) en registro/recuperar; tope de enlaces/día por cuenta sin verificar; enlace «reportar abuso» en páginas públicas → cola en admin; Google Safe Browsing opcional al guardar destinos |
| Legal México | Términos, Aviso de privacidad (LFPDPPP) y política de uso aceptable como páginas del sitio; aceptación al registrarse |
| Correo | Plantillas HTML con versión texto, es/en; encabezado `List-Unsubscribe` donde aplique |
| Pulido | Portada real (qué es, ejemplos, precios «próximamente»), plurales con `Intl.PluralRules`, fuentes web libres (OFL) autoalojadas para las páginas bio, página 404/expirado con marca |
| Rendimiento | Presupuesto medido: página bio < 50 KB JS, LCP < 1.5 s en 4G (Lighthouse en CI local); caché de páginas bio en memoria con invalidación al editar |

**Criterio de salida:** respaldo restaurado con éxito en un entorno aparte, Kuma en verde 7 días, registro con captcha y legales visibles.

**Estado (2026-10-22):**
- ✅ Respaldo diario a R2 (aws2 04:05, 30 días) + simulacro de restauración OK; `docs/OPERACION.md`.
- ✅ Vigilante cada 5 min desde aws2 (caída y 5xx → Telegram) y rotación de logs PM2. ⏳ Monitor en Kuma: pedido a master (buzón a-master 2026-10-22).
- ✅ Captcha de prueba de trabajo propio (registro, recuperar, reportes, lista de espera), reportes de abuso con cola en admin, tope diario de enlaces. ⏳ Safe Browsing: opcional, requiere llave de Google.
- ✅ Términos, aviso de privacidad y uso aceptable es/en con aceptación al registrarse. ✅ Responsable: datos de Dolibarr; contacto hola@tubio.link (reenvía a robot@koode.mx); jurisdicción Zapopan, Jalisco.
- ✅ Correos HTML, portada con lista de espera, plurales, 8 fuentes OFL autoalojadas.
- ✅ Rendimiento: Lighthouse móvil 100/100/100/100, LCP 1.0 s, 31 KB; la app responde en ~1 ms, así que la caché de páginas queda para cuando haga falta.

---

## F2 — Contenido, marketing y plataforma (SPEC §10 F2)

Se divide en tres entregas que se pueden publicar por separado.

### F2a — Bloques y captura de datos  · L
- **Bloques que faltan** (SPEC §3.2): horario con zona y «abierto ahora», reseñas, FAQ (acordeón), línea de tiempo, contador, cuenta regresiva, cupón (copiar código), vCard en bloque, archivo descargable, producto/servicio con precio (sin cobro todavía), galería, carrusel, antes/después, ventana modal, clima, feed RSS, feed de YouTube, HTML propio en iframe con sandbox y CSP propia.
- **Embeds que faltan**: X (perfil/post/video), Instagram, Facebook, Threads, Bluesky, Pinterest, Reddit, Tumblr, Snapchat, Telegram, Discord, Calendly, Typeform, Google Forms, Canva, mapas, iframe genérico (lista blanca), PDF, hojas y presentaciones. Igual que hoy: sólo URLs reconocidas, carga diferida y consentimiento de un clic para los que rastrean.
- **Bloques de captura**: correo, teléfono, formulario de contacto, suscripción a la página, encuesta con resultados. Antispam (honeypot + prueba de trabajo), consentimiento explícito.
- **«Datos»** del usuario: bandeja por página/bloque, exportar CSV, borrar; retención configurable.
- **Notificaciones**: correo, webhook firmado (HMAC), Slack, Discord, Telegram; reintentos con cola en SQLite.
- Datos nuevos: `collected_data`, `notification_handlers`, `jobs_queue`.

### F2b — Herramientas de marketing  · M
- **Píxeles reutilizables**: Meta, GA4/GTM, TikTok, LinkedIn, Pinterest, X, Snapchat, Quora. Se cargan sólo tras aviso de cookies propio (sin terceros); la CSP de la página se amplía sólo con los orígenes del píxel elegido.
- **Splash** reutilizable con cuenta regresiva y anuncio antes de redirigir.
- **Segmentación** de destino por país, dispositivo, idioma, SO y rotación A/B con porcentajes; las estadísticas registran qué variante se sirvió.
- **Ocultar destino** (marco con título/descripción propios) para destinos que lo permitan.
- **QR**: tipos que faltan (evento, cripto, PayPal), marcos con plantillas, imagen de fondo, edición en lote.

### F2c — Plataforma  · L
- **Dominios propios**: el usuario apunta CNAME/A; verificación por TXT; TLS automático. *Decisión técnica pendiente* (ver abajo).
- **API REST** con llave por usuario (enlaces, bloques, QR, estadísticas, datos, dominios, píxeles), límites de tasa, documentación OpenAPI.
- **Equipos**: invitar por correo, permisos por recurso (ver/editar/administrar), bitácora por equipo.
- **PWA** de cada página bio (manifest, iconos, instalar como app) y del panel.

**Criterio de salida F2:** cada sub-entrega publicada; API documentada con ejemplos; un dominio propio de prueba con TLS.

---

## F3 — Planes y cobro (SPEC §7)  · L

- **Planes**: gratis + mensual/anual/de por vida, prueba gratis, cupones; **límites aplicados en todo el sistema** (páginas, enlaces, bloques por página, bloques disponibles, QR, dominios, proyectos, píxeles, retención de estadísticas, CSS/JS propio, quitar marca, equipos, API, cuota de archivos).
- **Pasarelas**: Stripe y Mercado Pago primero; transferencia/depósito con comprobante y aprobación manual en admin. Webhooks idempotentes, reintentos, portal del cliente.
- **Impuestos y facturas**: IVA 16 %; recibo descargable; **CFDI** si se requiere (ver decisiones).
- **Bloques de pago** (producto, donación, servicio): cobran con las llaves propias del usuario (Stripe/PayPal/Mercado Pago); tubio no toca el dinero.
- **CSS/JS propio** en páginas bio sólo en planes que lo permitan (JS aislado en iframe con sandbox).
- Admin: planes, cupones, pagos, reembolsos, impuestos.

**Criterio de salida:** compra real de prueba en cada pasarela en modo producción con monto mínimo y su reembolso; downgrade/upgrade sin perder datos.

---

## F4 — Crecimiento y sitio (SPEC §10 F4)  · L

- **Afiliados/referidos**: enlace propio, comisión por plan pagado, panel y pagos manuales.
- **Directorio público** opcional de páginas (con moderación).
- **Blog** y **páginas estáticas** del sitio editables desde admin.
- **Sitios estáticos**: subir HTML/ZIP servido en su alias, con CSP estricta y límite por plan.
- **Admin completo** (SPEC §8): anuncios del sistema, temas de página bio editables, ajustes de marca/SMTP/captcha/login social/pagos/mantenimiento, estado de tareas, estadísticas globales.
- **Login con Google** (decisión de Alejandro: al final): el código ya está; sólo activar con el cliente OAuth y probar en vivo.

---

## F5 — Producto terminado (1.0)  · M

| Área | Listo cuando… |
|---|---|
| Calidad | auditoría WCAG 2.2 AA completa (axe + revisión manual con lector de pantalla), presupuestos de rendimiento verdes |
| Seguridad | revisión externa / pentest acotado y sus hallazgos cerrados; política de divulgación (`/.well-known/security.txt`) |
| Operación | runbook (desplegar, revertir, restaurar, rotar secretos), alertas probadas, simulacro de restauración trimestral |
| Soporte | centro de ayuda es/en; formulario de soporte que abre ticket en Zammad (soporte.koode.mx) |
| Escala | prueba de carga (p. ej. 200 req/s a páginas bio); plan documentado si SQLite deja de alcanzar (réplica de lectura o Postgres) |
| Comunidad | README de instalación propia, CONTRIBUTING, plantillas de issues, changelog y versión **1.0.0** etiquetada |

---

## Decisiones de Alejandro (2026-10-22)

1. **Dominios propios (F2c): Caddy** delante con TLS bajo demanda para dominios de clientes; Plesk sigue sirviendo tubio.link.
2. **Facturación (F3): recibo simple** (PDF descargable, sin CFDI por ahora).
3. **Planes: tabla simple** (propuesta abajo, por confirmar precios).
4. **Plan gratis: «Hecho con tubio» obligatorio.**
5. **Registro cerrado** hasta terminar F1.5 → **abierto el 2026-10-22** al cerrar F1.5.

### Planes — propuesta (MXN, IVA incluido)

| | Gratis | Pro | Negocio |
|---|---|---|---|
| Precio | $0 | $79/mes · $790/año | $249/mes · $2,490/año |
| Páginas bio | 1 | 10 | ilimitadas |
| Enlaces cortos / archivos / vCard / eventos | 25 | 1,000 | ilimitados |
| Bloques por página | 30 | 100 | 100 |
| Códigos QR | 10 | 200 | ilimitados |
| Estadísticas guardadas | 30 días | 1 año | 3 años |
| Espacio de archivos | 50 MB | 1 GB | 10 GB |
| Quitar «Hecho con tubio» / marca propia | — | ✓ | ✓ |
| Píxeles, splash, segmentación | — | ✓ | ✓ |
| Dominios propios | — | 1 | 10 |
| Bloques de captura y notificaciones | correo | todos | todos |
| CSS/JS propio | — | — | ✓ |
| Equipos | — | — | 5 personas |
| API | — | — | ✓ |
| Prueba gratis | — | 14 días | 14 días |

## Orden recomendado

F1.5 → F2a → F3 (empieza a generar ingreso) → F2b → F2c → F4 → F5.
Razón: con F1.5 se puede anunciar; F2a da el valor visible; cobrar pronto (F3) valida el negocio antes de la parte de plataforma (dominios/API/equipos), que es la más cara de mantener.
