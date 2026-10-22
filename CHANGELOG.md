# Cambios

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones [SemVer](https://semver.org/lang/es/).

## [Sin publicar] — camino a 1.0.0

### F5 — producto terminado (en curso)
- `/.well-known/security.txt` y política de divulgación responsable.
- Centro de ayuda es/en y formulario de soporte.
- Runbook de incidentes, respaldo de sitios estáticos y simulacro de restauración.

### F4 — crecimiento y sitio
- Directorio público opcional (con moderación) y programa de afiliados con comisión al aprobar pagos.
- Sitios estáticos (ZIP o HTML) en sandbox sin acceso al origen.
- Blog y páginas del sitio desde admin; aviso del sistema; modo mantenimiento.
- Admin: estadísticas globales y temas administrables.

### F3 — planes y cobro
- Tabla de planes y límites (gratis, Pro, Negocio), prueba gratis única, cupones.
- Pago por transferencia con comprobante y recibo PDF; recordatorio de vencimiento.

### F2 — negocio
- Dominios propios (Caddy on-demand TLS), equipos con roles, API v1 con llaves.
- Marketing: píxeles con consentimiento, página de espera, destinos por país/dispositivo, pruebas A/B, ocultar destino.
- Captura: formularios, encuestas, avisos por correo, webhook (HMAC), Slack, Discord y Telegram.
- Bloques: negocio (FAQ, horario, reseñas, productos, galería…), feeds (RSS, YouTube, clima) y 18 embeds.

### F1.5 — endurecimiento
- 2FA con bloqueo y anti-repetición, prueba de trabajo en formularios públicos, reportes de abuso, lista de espera,
  hosts bloqueados aplicados al redirigir, CSP con nonce, protección SSRF.

### F1 — MVP
- Páginas bio de bloques, enlaces cortos, archivos, vCard y eventos, QR estáticos y dinámicos, estadísticas sin IPs,
  cuentas con verificación de correo, admin básico, interfaz es-MX/en.

### Seguridad (revisiones internas)
- Dos revisiones completas; todos los hallazgos cerrados con prueba de regresión (entre ellos: permisos de equipo
  que se saltaban con `%xx` en la URL, SSRF por IPv6 que esconde IPv4, dominios reclamables con un CNAME viejo).
