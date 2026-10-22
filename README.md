# tubio

Link in bio de software libre: páginas bio hechas de bloques, enlaces cortos, archivos, tarjetas de contacto,
eventos, códigos QR (estáticos y dinámicos) y estadísticas sin guardar IPs. Interfaz en español (México) e inglés.

Licencia **AGPL-3.0-or-later** (ver `LICENSE`). Si ofreces tubio como servicio, debes ofrecer el código fuente a
tus usuarios: la ruta `/source` del pie de página apunta a `TUBIO_SOURCE_URL`.

- Especificación funcional: [`docs/SPEC.md`](docs/SPEC.md)
- Decisiones de stack: [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md)
- Plan y estado de la fase 1: [`docs/PLAN-F1.md`](docs/PLAN-F1.md)
- Dependencias y licencias: [`docs/DEPENDENCIAS.md`](docs/DEPENDENCIAS.md)
- Hoja de ruta: [`docs/ROADMAP.md`](docs/ROADMAP.md) · Cambios: [`CHANGELOG.md`](CHANGELOG.md)
- Operar una instalación (desplegar, respaldar, restaurar, incidentes): [`docs/OPERACION.md`](docs/OPERACION.md) · Escala: [`docs/ESCALA.md`](docs/ESCALA.md) · Accesibilidad: [`docs/ACCESIBILIDAD.md`](docs/ACCESIBILIDAD.md)
- API: [`docs/API.md`](docs/API.md) · Dominios propios: [`docs/DOMINIOS.md`](docs/DOMINIOS.md)
- Contribuir: [`CONTRIBUTING.md`](CONTRIBUTING.md) · Seguridad: [`SECURITY.md`](SECURITY.md)

## Requisitos

Node.js ≥ 22.18 (corre TypeScript directo, sin paso de compilación). Nada más: la base es SQLite en un archivo.

## Desarrollo

```bash
npm install
npm run dev                 # http://127.0.0.1:3095 (recarga al guardar)
npm run seed-demo           # cuenta demo@tubio.local / demo-demo-demo con una página de ejemplo
npm run create-admin -- tu@correo.mx "una-contraseña-larga"
npm run check               # tsc --noEmit + vitest
```

Sin SMTP, los correos (verificación, recuperar contraseña) quedan en `data/mail/*.eml`.

## Producción (un host, PM2 + nginx)

```bash
cp .env.example .env        # pon TUBIO_SECRET, TUBIO_BASE_URL, SMTP…
npm ci --omit=dev --ignore-scripts   # better-sqlite3 y sharp traen binarios: no hace falta compilador
npm run migrate
npm run create-admin -- admin@tu-dominio "contraseña-larga"
pm2 start ecosystem.config.cjs && pm2 save
```

nginx hace TLS y pasa todo a `127.0.0.1:3095` con `X-Forwarded-For` (y `TUBIO_TRUST_PROXY=1`). Respalda
`data/` (la BD `tubio.sqlite` en modo WAL, `uploads/` y `sites/`); para copiar la BD en caliente usa
`sqlite3 data/tubio.sqlite ".backup respaldo.sqlite"`.

Respaldo diario: `npm run backup-db` (cron) deja `data/backups/tubio-AAAA-MM-DD.sqlite` y conserva 14 días.
Base geo mensual: `scripts/update-geo.sh` (cron).

Ubicación de visitas (opcional): descarga "IP to City Lite" en formato MMDB de [DB-IP](https://db-ip.com/db/download/ip-to-city-lite)
(CC-BY 4.0) a `data/geo/dbip-city-lite.mmdb`; la atribución aparece sola en las estadísticas.

## Créditos

Logos de redes sociales: [Simple Icons](https://simpleicons.org) (CC0). Las marcas pertenecen a sus dueños.
