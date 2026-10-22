# API de tubio (v1)

Disponible en el plan **Negocio**. Crea una llave en **Cuenta → API**; se muestra una sola vez.

```
Authorization: Bearer tb_xxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
Content-Type: application/json
```

Límite: 120 peticiones por minuto por llave. Errores: `{"error": {"code": "...", "details": {...}}}` con
`401 unauthorized`, `402 plan_required | plan_limit`, `404 not_found`, `422 validation`. En `details` cada campo
trae una clave de error (`err.url_scheme`, `err.alias_taken`, …).

## Cuenta
`GET /api/v1/me` → datos, límites del plan y uso.

## Enlaces
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/v1/links?kind=short&q=…&limit=50&offset=0` | lista |
| POST | `/api/v1/links` | `{kind: "short"\|"bio", alias?, title?, target_url, redirect_code?, is_enabled?, starts_at?, ends_at?, click_limit?, password?, is_sensitive?, utm?: {utm_source…}, project_id?}` (fechas ISO 8601) |
| GET | `/api/v1/links/:id` | |
| PATCH | `/api/v1/links/:id` | mismos campos; `password: null` la quita |
| DELETE | `/api/v1/links/:id` | 204 |
| GET | `/api/v1/links/:id/stats?from=AAAA-MM-DD&to=AAAA-MM-DD` | totales, serie diaria, desgloses, clics por bloque |

```bash
curl -s https://tubio.link/api/v1/links -H "Authorization: Bearer $TUBIO_KEY" -H 'content-type: application/json' \
  -d '{"alias":"promo","target_url":"https://tienda.mx/otono","utm":{"utm_source":"newsletter"}}'
```

## Bloques de páginas bio
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/v1/links/:id/blocks` | |
| POST | `/api/v1/links/:id/blocks` | `{type, data}`; `data` usa los mismos nombres de campo que el editor. Filas: arreglo de objetos (`{"items":[{"q":"…","a":"…"}]}`); redes: objeto (`{"links":{"instagram":"@ana"}}`). Los tipos con imágenes o archivos se crean desde el panel. |
| DELETE | `/api/v1/blocks/:id` | 204 |

## QR
| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/v1/qr` | QR guardados |
| GET | `/api/v1/qr/:id.svg` | SVG de un QR guardado |
| POST | `/api/v1/qr/render` | `{kind, data, style?, format?: "svg"\|"png"}` sin guardar (`kind`: url, text, phone, sms, email, whatsapp, wifi, vcard, location, event, crypto, paypal) |

## Datos capturados
`GET /api/v1/data?since=2026-10-01T00:00:00Z&limit=100` → lo que dejaron los visitantes en bloques de captura (sin votos).

## Proyectos
`GET /api/v1/projects`

## Webhooks
Para recibir datos al momento usa un destino **Webhook** en *Avisos*: `POST` JSON
`{event: "data.created", at, id, page, block, kind, data}` con la firma `X-Tubio-Signature: sha256=<HMAC-SHA256 del cuerpo>`
si configuraste un secreto.
