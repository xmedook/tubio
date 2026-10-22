# Escala y rendimiento

## Prueba de carga (2026-10-22, aws2, 8 núcleos, un proceso Node)
`npx autocannon -c 50 -d 15 http://127.0.0.1:3095/<página>` con un User-Agent de navegador (los bots no generan estadísticas).

| Ruta | req/s | p50 | p97.5 |
|---|---|---|---|
| `/healthz` | ~6 800 | 6 ms | 10 ms |
| `/help` (estática) | ~4 200 | 11 ms | 16 ms |
| página bio con 12 bloques — antes del lote | ~340 | 56 ms | 393 ms |
| página bio con 12 bloques — **con estadísticas en lote** | **~980** | 48 ms | 91 ms |

Meta de F5: 200 req/s en páginas bio → cumplida con margen de ~5×.

El perfil de CPU mostró que cada visita hacía dos escrituras síncronas (evento + contador) y eso pesaba más que
renderizar. `src/modules/stats/buffer.ts` las junta en memoria y las escribe en una transacción cada 250 ms
(`TUBIO_STATS_BUFFER_MS`, 0 = al momento) o cada 200 eventos; al apagarse con SIGINT/SIGTERM vacía lo pendiente. Si el
proceso muere de golpe se pierde, como mucho, ese intervalo de estadísticas. El tope de clics suma lo pendiente.

## Si SQLite deja de alcanzar
SQLite en WAL aguanta miles de lecturas por segundo y las escrituras ya van en lote; el límite real es **un solo
proceso escritor en un solo host**. En orden, antes de cambiar de motor:

1. **Caché de páginas bio** de 30–60 s en nginx/Caddy para visitantes sin cookie (las estadísticas se pueden contar
   con un píxel aparte). Multiplica las lecturas sin tocar la app.
2. **Varios procesos** (PM2 cluster) leyendo la misma BD; las escrituras se serializan por `busy_timeout` y el lote
   las mantiene cortas. Medir antes: con WAL suele bastar hasta ~4 procesos.
3. **Estadísticas fuera de la BD principal**: `stat_events` a su propio archivo SQLite (adjunto) o a ClickHouse/
   DuckDB si los reportes se vuelven lentos (hoy se calculan al vuelo por rango).
4. **Postgres**: el SQL es estándar salvo `json_extract`, `strftime` y los `INSERT … ON CONFLICT`; el cambio es
   un adaptador en `src/db/` y portar las migraciones. Sólo si hacen falta varios hosts escribiendo a la vez.

Señales para actuar: p97.5 de páginas bio > 300 ms sostenido, `SQLITE_BUSY` en los logs, o la BD > 20 GB.
