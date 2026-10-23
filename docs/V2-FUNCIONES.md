# v2 — funciones: revisar, mejorar, proponer (2026-10-23)

Base: inventario de comportamientos de la referencia (sala limpia; el documento fuente es sólo local, no se publica) contra
lo que tubio ya tiene. Prioridad: **P1** = en v2 sí o sí · **P2** = en v2 si da el tiempo · **P3** = después / según demanda ·
**✗** = no lo hacemos. Tamaño: S/M/L como en `ROADMAP-V2.md`.

> **Decisión de Alejandro (23-oct-2026): enfocarse en la app; la parte de negocio queda fuera por ahora**
> (suscripciones, Mercado Pago, CFDI, avisos por WhatsApp, plan Agencia, marca blanca).
> Hecho y en producción: duplicar, creación masiva, GTM, idioma, reclamar dirección, visitas propias,
> plantillas, bloques portada/artículo/CTA, estadísticas en cascada, reporte semanal, abrir en la app,
> campanita, códigos de canje.

## 1. Ventajas de tubio que se conservan
Estadísticas públicas compartibles · programación de la página entera · barra de anuncio por página · bloques de clima,
encuesta con resultados, suscripción, contador, antes/después, marquesina, botón con imagen · embeds de Bluesky, Threads,
Tumblr, Bandcamp, Google Forms, Canva, Instagram · dominios propios con verificación automática y TLS (la referencia los
aprueba a mano) · QR dinámico atado al id del enlace (no se rompe al cambiar el alias) · exportar todos mis datos ·
verificación anti-bots sin terceros (prueba de trabajo) · HTML propio en sandbox · la API respeta permisos de equipo ·
bajar de plan no impide editar, sólo lo premium deja de funcionar · reintentos y último error visible en avisos.

## 2. Fricciones de la categoría que v2 resuelve (UX)
| # | Fricción | Solución v2 | Prio |
|---|---|---|---|
| 1 | Vista previa al fondo en el celular | Interruptor Editar / Vista previa (**hecho en rama v2**) | P1 |
| 2 | Un solo «Guardar» al fondo de formularios largos | **Autoguardado siempre** con «Deshacer» | P1 · M |
| 3 | Ayudas y candados en globos que no existen en táctil | Texto visible, contadores «X de Y» y plan necesario junto a la opción | P1 · S |
| 4 | Reordenar sólo con un asa chica | Asa de 44 px + «Subir/Bajar» en el menú (**hecho**) | P1 |
| 5 | Crear píxel/proyecto/destino obliga a salir del editor | Crear en línea desde el selector | P2 · M |
| 6 | Tablas anchas | Tarjetas en móvil (**hecho en enlaces**; falta miembros, pagos, estadísticas) | P1 · S |
| 7 | Listas enormes sin búsqueda (países, zonas horarias, enlaces) | Selector con búsqueda | P1 · S |
| 8 | HTML/CSS/JS en áreas de texto del teléfono | Plegado en «Avanzado», opciones visuales primero | P1 · S |
| 9 | Miniaturas de tema diminutas | Probar el tema sobre la página real | P1 · M |
| 10 | Demasiadas opciones | Asistente de alta en 3 pasos (V2.2) | P1 · M |
| 11 | Embeds que se guardan y no se ven | Validar al guardar y mostrar el embed en la vista previa | P1 · S |
| 12 | Ocultar destino en blanco si el sitio bloquea marcos | Probar el destino y avisar antes de activarlo | P2 · S |
| 16 | Enlaces rotos sin aviso | Revisión periódica del destino y aviso | P2 · M |
| 17 | Subidas grandes sin progreso | Barra de progreso | P2 · S |
| 19 | Vista previa en redes vacía para enlaces cortos | Tarjeta OG editable en cualquier enlace corto | P2 · S |
| 21 | Navegadores dentro de Instagram/TikTok rompen descargas y pagos | Detectarlos y ofrecer «Abrir en el navegador» | P1 · S |
| 22 | Números que no cuadran con Google Analytics | Explicar en pantalla qué se cuenta | P1 · S |
| 24 | No se ve el rango de fechas activo en móvil | Rango fijo arriba, en chips | P1 · S |
| 25 | Al bajar de plan se pierde historial sin aviso | Aviso antes de purgar + exportar | P2 · S |
| 29 | Formularios sin prueba de consentimiento | Guardar fecha, texto aceptado y huella (LFPDPPP) | P1 · S |
| 31 | Restablecer contraseña quita el 2FA en silencio | (tubio no lo quita) avisar por correo de cada restablecimiento | P2 · S |
| 33 | Phishing → dominio en listas negras | Safe Browsing/URLhaus al crear y a diario + cuarentena | P1 · M |

## 3. Paridad: funciones de la referencia que tubio no tiene
### Enlaces
| Función | Prio |
|---|---|
| **Duplicar** cualquier enlace o página (respetando límites) | P1 · S |
| **Creación masiva** de enlaces cortos (una URL por línea) + importar CSV | P1 · S |
| **Apertura de la app** nativa (YouTube, Instagram, TikTok, WhatsApp, Spotify, Amazon…) con página intermedia | P1 · M |
| Segmentación por **continente, ciudad y navegador** | P2 · S |
| **Enlaces profundos** a esquemas de apps (lista blanca, por plan) | P2 · S |
| Página de **índice y 404** propias por dominio; enlace/página **exclusiva** de la raíz del dominio | P1 · S (la raíz ya existe; falta 404) |
| **Forzar descarga** en archivos | P2 · S |
| **Reiniciar estadísticas** de un enlace (reactiva el tope de clics) | P2 · S |
| **Reportes por correo** semanales/mensuales con comparación | P1 · M |
| Lista negra de **alias** (palabras) | P2 · S |
| **Exportar** listado de enlaces (CSV/JSON) | P2 · S |
| Píxel de **Google Tag Manager** | P1 · S |
| Página splash más completa (logo, botón secundario, cuenta 0–600 s, recordar 1 día) | P3 |
| Splash forzada con anuncios en plan gratis | ✗ (no es nuestro modelo) |
| JS propio en «ocultar destino» | ✗ (riesgo) |

### Página bio
| Función | Prio |
|---|---|
| **Plantillas completas** (diseño + bloques) con galería y vista en vivo, plantilla por defecto; **el usuario guarda su página como plantilla** | P1 · M |
| Aplicar tema **reestiliza bloques** existentes, con «Deshacer» | P1 · S |
| Fondos: degradados y abstractos predefinidos, fondo fijo/desplazable, **video** de fondo | P2 · M |
| Recorte al subir favicon/avatar | P2 · S |
| Insignia de verificado con posición y **solicitud dentro del producto** | P2 · S |
| **Idioma declarado** de la página (SEO) | P1 · S |
| **Reportar página** (enlace discreto) | P1 · S (ya hay reportes; falta el enlace visible) |
| Código global del admin en todas las páginas | P3 |
| «Reclama tu alias» en la portada antes de registrarse | P1 · S |
| Bloques: **visibilidad condicional** por país, dispositivo, idioma… | P2 · M |
| Bloques: animaciones de atención (pocas, respetando «reducir movimiento») | P2 · S |
| Bloques: dofollow/nofollow (nofollow por defecto) | P2 · S |
| Bloques: **estadísticas por bloque** completas | P2 · M |
| Bloques nuevos: **cabecera con portada**, **tarjeta de artículo**, **llamada a la acción**, **enlace grande** | P1 · M |
| Embeds: perfil de TikTok, video de X, publicación de Facebook, servidor de Discord, mapa estático | P2 · S c/u |
| **Agenda de citas** sin doble reserva | P1 · L |
| **Producto digital** con entrega por enlace único + recibo | P2 · L |
| Panel de **pagos de visitantes** | P2 · M |
| Botones flotantes de subir/bajar · service worker de push de terceros | ✗ |

### QR, estadísticas, dominios, equipos, API, avisos
| Función | Prio |
|---|---|
| QR masivo (CSV → ZIP) | P2 · S |
| **Revisión de legibilidad** del QR antes de descargar + imprimir | P1 · S |
| QR **CoDi/SPEI** (México; la referencia no lo tiene) | P2 · S |
| Estadísticas **por QR** (la referencia no las tiene) | P2 · S |
| Estadísticas en **cascada** (país→ciudad, fuente→medio→campaña), mapa, franjas horarias, atajos de rango | P1 · M |
| **Excluir mis IPs** de las estadísticas | P1 · S |
| Estadísticas filtradas por **proyecto** | P2 · S |
| **Dominios del sistema** adicionales que el plan habilita (p. ej. otro dominio corto) | P3 |
| Equipos: permisos por recurso (ver/crear/editar/borrar) | P2 · M |
| API: más recursos (QR, proyectos, píxeles, dominios, datos) + webhooks salientes | P2 · M |
| API de administración mínima | P3 |
| Avisos por **WhatsApp** y **notificación interna (campanita)** + botón «probar» + bitácora de fallos | P1 · M |
| Microsoft Teams / Google Chat | P3 · S |
| Datos capturados: filtros por bloque/proyecto | P2 · S |

### Cobro, cuenta, admin y sitio
| Función | Prio |
|---|---|
| **Códigos de canje** (días de plan) y generador masivo de cupones | P1 · S |
| **CFDI** a petición (vía Dolibarr) · notas de crédito · reembolsos parciales que **sí** quitan el plan | P1 · M |
| **Suscripciones** con renovación automática (Stripe) + Mercado Pago (OXXO/SPEI) | P1 · M–L |
| Plan sugerido para mejorar + cupón preaplicado | P2 · S |
| Borrado de cuentas gratis inactivas (con aviso) | P3 |
| Login con **Apple** y **correo mágico** (además de Google) | P2 · M |
| **Bitácora de actividad** de la cuenta | P1 · S (ya existe la auditoría; falta mostrarla) |
| Preferencias: orden, resultados por página, zona horaria, IPs excluidas | P1 · S |
| Admin: envíos masivos de correo segmentados, salud del sistema, registro de consentimiento de cookies | P2 · M |
| **Búsqueda rápida** en el panel (tipo Spotlight) | P1 · S |
| Herramientas gratis para SEO (lector QR, generador UTM, verificador de enlaces) | P3 · M |
| Firmas de correo | P3 · M |
| Marca blanca del panel (agencias) | P3 · L |
| 21 pasarelas de cobro · IA genérica (documentos/imágenes/voz) | ✗ (pocas pasarelas que funcionen; IA sólo como asistente de página, ver IDEAS-V3) |

## 4. Propuestas nuevas (no están en la referencia)
**Plantillas por giro mexicano** (restaurante, consultorio, tienda, creador, inmobiliaria) · **importar de Linktree/Beacons** ·
**catálogo con pedido por WhatsApp** · **QR CoDi/SPEI** · asistente con IA que arma la página · comprobador de enlaces rotos ·
estadísticas por QR · el usuario guarda su página como plantilla. Detalle y otras ideas en `IDEAS-V3.md`.

## 5. Orden sugerido
Las **P1 de UX (§2)** van dentro de V2.0–V2.5 conforme se rediseña cada pantalla. Las **P1 de paridad (§3)** en este orden:
duplicar + creación masiva + GTM + idioma/reportar/reclamar alias (S, rápidas) → plantillas completas → bloques nuevos
(portada, artículo, CTA) → estadísticas en cascada + excluir IPs + reportes por correo → apertura de app → avisos WhatsApp y
campanita → cobro (suscripciones, Mercado Pago, CFDI, canje) → agenda de citas.
