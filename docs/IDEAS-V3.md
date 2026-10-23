# Ideas para después de v2 (no comprometidas, 2026-10-22)

**Punto de partida.** La 1.0 está completa y en producción (SPEC cubierta, 195 pruebas, cobro con transferencia y
Stripe, dominios propios con Cloudflare for SaaS, Zammad). Pero hoy hay **1 usuario, 1 enlace y 0 pagos**. La v2 no
debe empezar por más funciones: primero gente usándolo, luego lo que esa gente pida y lo que la haga pagar.

Tamaños: S ≈ 1 día · M ≈ 2–4 días · L ≈ 1–2 semanas (de sesión Claude, sin contar esperas).

---

## V2.0 — Lanzamiento (antes de cualquier función nueva) · S–M

| Qué | Por qué |
|---|---|
| **100 fundadores**: lista de invitación (clientes de koode, contactos de WhatsApp, redes de nexo·digital) y correo/WhatsApp de invitación con su enlace `?ref` | Ya está el premio (1 año de Negocio). Falta llevar a la gente. |
| **Plantillas de arranque**: 8–10 páginas listas por giro (restaurante, consultorio, tienda, creador, inmobiliaria, evento, ONG, freelancer) que se copian con un clic | El mayor abandono en link-in-bio es la página vacía. |
| **Importar de Linktree / Beacons** pegando la URL pública (títulos y enlaces) | Quita el costo de cambiarse. |
| **Medición del embudo**: registro → correo confirmado → primera página publicada → primera visita → pago (tablero en Admin) | Sin esto no sabremos qué arreglar. |
| **Monitoreo de errores 5xx** (hueco abierto desde que se retiró `tubio-watch`): alerta a Telegram desde la propia app | Con usuarios reales no podemos enterarnos por ellos. |
| **Página de estado** pública en Kuma (status.tubio.link) | Confianza; lo piden los de plan Negocio. |
| Prueba real de pago con tarjeta + **rotar la llave de Stripe** (se pegó en el chat) por una restringida | Higiene antes de cobrar en serio. |

**Meta para cerrar V2.0:** 100 fundadores con correo confirmado y ≥ 60 % con página publicada.

---

## V2.1 — Que cobrar sea fácil y recurrente · M–L

| Qué | Detalle |
|---|---|
| **Suscripciones de Stripe** (renovación automática mensual/anual, prorrateo al cambiar de plan, portal del cliente para cambiar tarjeta o cancelar) | Hoy cada periodo es un pago suelto: el cliente tiene que acordarse. Se queda el pago por transferencia como alternativa. |
| **Mercado Pago** (tarjeta, OXXO, SPEI con referencia) | Mucho del público mexicano no tiene tarjeta internacional. |
| **Factura CFDI** a petición desde el panel (RFC, régimen, uso), timbrada por la API **kooderesico de Dolibarr** que koode ya usa | Negocios en México la necesitan para deducir; hoy damos recibo simple. |
| **Precios en USD** para quien entra desde fuera de México (Stripe multimoneda) | Abre mercado sin cambiar nada más. |
| Cupones con vigencia por campaña y **plan de fundadores → renovación con 50 %** al terminar su año | Convertir fundadores en clientes pagando. |

---

## V2.2 — Producto que hace pagar · L

| Qué | Detalle |
|---|---|
| **Vender desde la página**: productos digitales (PDF, curso, preset) y propinas/donativos con **Stripe Connect** (el dinero va al creador; tubio cobra comisión opcional) | Es la función por la que los creadores sí pagan; hoy sólo enlazamos a PayPal. |
| **Agenda de citas** (bloque con horarios disponibles, confirma por correo/WhatsApp, Google Calendar) | Consultorios, salones, asesores: el giro principal de los clientes de koode. |
| **Asistente con IA** (Claude): «describe tu negocio» o «pega tu Instagram» → arma la página, textos y colores; sugerencias según las estadísticas | Diferenciador fuerte y barato de operar con caché. |
| **Bloque de catálogo** con carrito a WhatsApp (pedido armado en un mensaje) | Muy usado en México para pequeños negocios. |
| **Integraciones de lo capturado**: Google Sheets, Mailchimp/Brevo, HubSpot, Zapier/Make (webhooks ya existen; faltan conectores con OAuth) | Los formularios valen lo que valga a dónde llegan. |

---

## V2.3 — Equipos, agencias y marca blanca · M–L

| Qué | Detalle |
|---|---|
| **Plan Agencia**: varios clientes bajo una cuenta, cambio rápido entre espacios, permisos por cliente, reportes en PDF con su marca | koode/nexo·digital es el primer cliente; otras agencias después. |
| **Marca blanca**: panel en el dominio de la agencia, sin «Hecho con tubio», correos con su remitente | Se cobra caro y casi no cuesta mantener. |
| **API v2 con OAuth** (apps de terceros), webhooks salientes de eventos (visita, clic, formulario, pago) | Ecosistema. |

---

## V2.4 — Plataforma y riesgo · M

| Qué | Detalle |
|---|---|
| **Dominio aparte para contenido de usuarios** (p. ej. `tubio.site`): sitios estáticos, HTML propio y archivos se sirven ahí | Si alguien sube phishing, Google castiga ese dominio y no tubio.link. ~$15 USD/año. |
| **Moderación automática**: lista de URLs maliciosas (Google Safe Browsing / URLhaus) al crear enlaces y a diario; cola de revisión | Con más usuarios, el abuso llega solo. |
| **Revisión de seguridad externa** (pentest acotado) antes de pasar de ~500 cuentas de pago | Pendiente de F5. |
| **Revisión manual de accesibilidad** (teclado + VoiceOver/NVDA) | Pendiente de F5. |
| Escala: caché de páginas bio en Cloudflare para visitantes sin sesión y estadísticas por píxel | Sólo si el tráfico lo pide (hoy aguanta ~1 000 req/s por proceso). |

---

## Lo que NO haría en v2
- App nativa iOS/Android: el panel ya funciona en el celular y la página bio es PWA.
- Cambiar a Postgres o Kubernetes: no hay carga que lo justifique (ver `docs/ESCALA.md`).
- Competir en todo con Linktree: enfocarse en **negocios en México** (WhatsApp, citas, CFDI, OXXO, español) es lo que nos distingue.

## Decisiones que necesito de ti
1. ¿Arrancamos por **V2.0 (lanzamiento)** como propongo, o hay una función que ya te estén pidiendo?
2. Lista de a quién invitar como fundadores (¿clientes de koode por correo/WhatsApp con tu ok para cada envío?).
3. ¿Comisión de tubio en ventas con Stripe Connect (p. ej. 0 % en Negocio, 5 % en Gratis)?
4. ¿Compramos `tubio.site` (o similar) para V2.4?
