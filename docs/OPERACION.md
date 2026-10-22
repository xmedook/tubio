# Operación de tubio

Guía para quien opera una instalación (la de tubio.link y cualquier otra). Detalles de la instalación de
tubio.link que dependen de la infraestructura de koode viven fuera del repo.

## Desplegar una versión
```bash
git pull
npm ci --omit=dev --ignore-scripts
node --env-file=.env src/db/cli.ts      # migraciones (idempotentes)
pm2 restart tubio --update-env
curl -s 127.0.0.1:3095/healthz          # {"ok":true}
```
Revertir: `git checkout <commit anterior>` y los mismos pasos. Las migraciones sólo agregan; no hay que deshacerlas
para volver una versión atrás (las columnas nuevas se ignoran).

## Respaldos
- `npm run backup-db` copia la BD con la API de respaldo de SQLite (consistente con la app corriendo) a
  `data/backups/tubio-AAAA-MM-DD.sqlite` y conserva 14.
- Fuera del servidor: copiar esa copia + `data/uploads/` + `data/sites/` a otro lugar a diario (en tubio.link: R2, 30 días).
  `data/sites/` se puede regenerar desde los ZIP de `uploads/` (desmarcar y marcar «Publicar como sitio web»), pero
  respaldarlo evita ese paso.
- **No** respaldar `.env` junto con los datos: el secreto va en el gestor de contraseñas.

## Restaurar
1. Detener: `pm2 stop tubio`.
2. Poner la copia como `data/tubio.sqlite` (borrar `tubio.sqlite-wal` y `-shm` si existen) y restaurar `data/uploads/` y `data/sites/`.
3. `node --env-file=.env src/db/cli.ts` y `pm2 start tubio`.
4. Probar `/healthz` y entrar con una cuenta admin.

Simulacro: hacerlo cada trimestre en un puerto aparte (`TUBIO_PORT=3097 TUBIO_DATA_DIR=/ruta/copia node src/server.ts`).
Simulacros en tubio.link: 2026-10-22 OK (copia de R2 → login admin correcto); 2026-10-22 OK (copia de R2 con
`data/sites` → `integrity_check` ok, `/healthz`, `/login` y portada 200 en un puerto aparte).

## Rotar secretos
- `TUBIO_SECRET`: cambiarlo invalida avisos flash, desbloqueos de enlaces con contraseña y confirmaciones de
  contenido sensible (no las sesiones, que están en la BD). Reiniciar.
- Contraseña SMTP: cambiarla en el buzón y en `TUBIO_SMTP_URL`. Reiniciar.
- Llaves de API de clientes: cada quien las revoca en Panel → API. Para revocarlas todas de una cuenta:
  `DELETE FROM api_keys WHERE user_id = ?`.
- Cliente OAuth de Google y llaves de pago (cuando se activen): rotar en la consola del proveedor, actualizar `.env`, reiniciar.
- Sesiones: `DELETE FROM sessions` cierra la sesión de todo el mundo (útil si se sospecha robo de cookies).

## Incidentes
| Situación | Qué hacer |
|---|---|
| Algo se rompió tras un despliegue | Revertir (arriba). Si el panel está mal pero lo público bien: Admin → Ajustes → **modo mantenimiento** (cierra panel y registro; los enlaces siguen). |
| Phishing / abuso en un enlace | Admin → Enlaces → desactivar; Admin → Hosts bloqueados para el dominio destino (aplica también a los enlaces ya creados); Admin → Usuarios → suspender. Contestar el reporte. |
| Ola de registros basura | Admin → Ajustes → quitar «registro abierto» (queda la lista de espera). |
| Vulnerabilidad reportada | Seguir `/security`: acusar recibo ≤3 días hábiles, arreglar con prueba de regresión, desplegar, avisar a quien reportó. |
| Servidor caído | Alertas: `tubio-watch` (cron */5 en aws2, Telegram) y Uptime Kuma (monitores «tubio.link — healthz» y «— login»). Revisar `pm2 logs tubio` y espacio en disco; si el host no vuelve, restaurar en otro con la última copia. |

## Tareas periódicas
Dentro del proceso cada 6 h: sesiones vencidas, retención de estadísticas, sales de visitantes, imágenes huérfanas.
Fuera (cron): `backup-db` diario, `scripts/update-geo.sh` mensual. El estado de la última corrida se ve en Admin → Resumen.
