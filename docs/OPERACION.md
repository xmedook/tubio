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
- Fuera del servidor: copiar esa copia + `data/uploads/` a otro lugar a diario (en tubio.link: R2, 30 días).
- **No** respaldar `.env` junto con los datos: el secreto va en el gestor de contraseñas.

## Restaurar
1. Detener: `pm2 stop tubio`.
2. Poner la copia como `data/tubio.sqlite` (borrar `tubio.sqlite-wal` y `-shm` si existen) y restaurar `data/uploads/`.
3. `node --env-file=.env src/db/cli.ts` y `pm2 start tubio`.
4. Probar `/healthz` y entrar con una cuenta admin.

Simulacro: hacerlo cada trimestre en un puerto aparte (`TUBIO_PORT=3097 TUBIO_DATA_DIR=/ruta/copia node src/server.ts`).
Último simulacro en tubio.link: 2026-10-22, OK (copia de R2 → login admin correcto).

## Rotar secretos
- `TUBIO_SECRET`: cambiarlo invalida avisos flash, desbloqueos de enlaces con contraseña y confirmaciones de
  contenido sensible (no las sesiones, que están en la BD). Reiniciar.
- Contraseña SMTP: cambiarla en el buzón y en `TUBIO_SMTP_URL`. Reiniciar.

## Tareas periódicas
Dentro del proceso cada 6 h: sesiones vencidas, retención de estadísticas, sales de visitantes, imágenes huérfanas.
Fuera (cron): `backup-db` diario, `scripts/update-geo.sh` mensual. El estado de la última corrida se ve en Admin → Resumen.
