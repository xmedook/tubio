# tubio v2 · direcciones visuales (design, 23-oct-2026)

Abrir `index.html` (o cada `a-mercado.html`, `b-gaceta.html`, `c-taller.html`) en el navegador.
Cada archivo trae: tokens como variables CSS (claro/oscuro, bloque `:root` al inicio del `<style>`, listo para `tokens.css`),
escala tipográfica, radios, espaciado, sombras; maquetas a 390 px (Enlaces con pestañas + Crear, editor Editar|Vista previa
con arrastre y «⋯», hoja «Añadir bloque», vista previa, estadísticas), modo oscuro, página bio de cafetería en 2 temas y el
editor de escritorio a 1280 px. `capturas/` tiene PNG de cada fila.

Auditoría de las maquetas (Playwright): 0 objetivos < 44 px, 0 textos < 14 px, contraste AA en todo texto (claro y oscuro,
temas de bio incluidos). Fuentes OFL, se sirven desde tubio (las maquetas las cargan de Google sólo para verse).
Recomendación: A · Mercado; segunda: C · Taller. `gen.py` regenera todo (`python3 gen.py .`).

## Ronda 2 (Alejandro: «A pero con otros colores, menos Claude»)
`a-colores.html`: Mercado con la misma letra/forma y 3 paletas sin crema ni terracota: A2 Jamaica (recomendada),
A3 Talavera, A4 Agave. Cada una con claro/oscuro y 2 temas bio, AA verificado; `gen-a-colores.py` las regenera.

## Elegida (23-oct-2026)
**A2 · Mercado Jamaica.** Tokens finales en `tokens-jamaica.css`; maquetas en `a2-jamaica.html`.

## Ronda 3 (Alejandro vía tubio: «que se sienta como WhatsApp»)
`mensajeria.html`: patrones de app de mensajes (filas tipo chat de 72 px con avatar redondo, contador a la derecha, pestañas
abajo con indicador de píldora, botón redondo flotante «Crear», hojas inferiores, interruptores del sistema) con marca y verde
propios. Sin logo, íconos, verdes ni fondo de WhatsApp/Meta.
- **M1 · Charla** (recomendada): letra del sistema, verde hoja `#14774A` / `#5DD597`. Tokens: `tokens-charla.css`.
- **M2 · Recado**: Figtree (OFL), verde lima-olivo `#3F7A10` / `#A5DA5E`. Tokens: `tokens-recado.css`.
Auditado: 0 táctiles < 44 px, 0 textos < 14 px, AA en todo texto (claro, oscuro y temas bio). `gen-mensajeria.py` regenera.
