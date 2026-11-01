# tubio.link/cwmx · propuesta de diseño (design, 25-oct-2026)

Maqueta: `maqueta.html` (abrir en navegador, 390 px) y `maqueta-390.png`. Idea: «se construye en tiempo real» de cheapweb.mx
llevada a la bio. Lima de identidad arriba, tinta abajo, tarjetas blancas con borde tinta y sombra dura (las de cheapweb),
el tache como marca de agua, una marquesina de giros y cifras grandes en Chivo 900. Sin neón extra: sólo lima, tinta y papel.

## 1. Orden de bloques (en pantalla)
1. **Cabecera**: avatar tache (caja tinta, tache lima, radio 18) + wordmark «cheapweb.mx» (Familjen 700, «.mx» en tinta 2).
2. **Título (H1)**: «Tu página, [en 7 días] hábiles.» con «en 7 días» sobre caja tinta/lima (resaltador).
3. **Subtítulo**: «Hecha para celular, desde Guadalajara. Precio publicado, sin cotizar.»
4. **Tarjeta de precio** (blanca, borde 2 px tinta, sombra dura 5 px, giro −1.2°): «Desde $17,900» (Chivo 900 40 px) + «una vez, o $8,950 + $1,490/mes · ver precios →». Enlace: cheapweb.mx/#precios.
5. **Botón principal** «Ver precios» (pastilla tinta, texto lima) y **secundario** «Pedir mi demo gratis» (borde tinta, fondo transparente).
6. **Línea de 7 días**: 4 casillas 1·3·5·7 (materiales, borrador, ajustes, en línea; la última en tinta/lima) + la garantía en una línea.
7. **Marquesina** inclinada −1.5° en tinta con los giros separados por el tache (decorativa, aria-hidden).
8. **«Mira el sitio de tu giro»**: tira horizontal con los 15 giros como fichas (cada una a su demo, UTM), ligera rotación alterna, + botón «Ver los 15 ejemplos».
9. **Fundadores** (banda tinta, esquinas superiores 28): «Programa Fundadores», cifra **10** gigante (Chivo 900 96 px lima), «lugares, uno por giro», una línea de qué incluye, **$8,950** una sola vez + IVA, botón lima «Quiero mi lugar» → /fundadores/.
10. **Reel de la semana**: tarjeta de artículo blanca con borde y sombra dura (blog «¿Cuánto cuesta una página web en México en 2026?»).
11. **Garantía**: banda tinta «100 %» + «de devolución si no estamos en línea en 7 días hábiles desde tus materiales.»
12. **WhatsApp**: pastilla blanca con borde tinta (icono de trazo propio, sin verde ni logo de Meta) → wa.me/528313359341.
13. **Pie**: hola@cheapweb.mx · Guadalajara, Jalisco · Hecho con tubio · Reportar abuso · Términos · Privacidad.
UTM en todos los enlaces: `?utm_source=instagram&utm_medium=bio&utm_campaign=cwmx`.

## 2. Tokens (variables de la página; valores de cheapweb.mx/brand/tokens.css)
lima `#D5FF4E` · lima-2 `#C2F03A` (hover) · tinta `#0D110A` · tinta-2 `#48503F` · papel `#F1F3EC` · blanco `#FFFFFF` · línea `#DCDFD8`.
Contrastes: tinta/lima 16:1, lima/tinta 16:1, tinta-2/lima 6.6:1, papel(#F1F3EC)/tinta 17:1. Todo ≥ 4.5:1.
Letra: titulares Familjen Grotesk 700 (sentence case, tracking −.02 a −.03em, interlínea .98–1.1) · texto Schibsted Grotesk 400–700, 16–18 px/1.45 ·
cifras Chivo 900 tabular-nums (40/44/96 px). Radios: botones pastilla 999, tarjetas 20–22, fichas 16, avatar 18, banda 28. Sombra dura: `5px 5px 0 tinta` (tarjetas), `3px 3px 0` (fichas). Borde 2 px tinta.

## 3. Perillas del editor de tubio con los valores
| Perilla | Valor |
|---|---|
| Fondo | color `#D5FF4E` (plano, sin degradado) |
| Color de texto | `#0D110A` |
| Fuente | de marca: Familjen Grotesk (títulos) + Schibsted Grotesk (texto) — **requiere función nueva A** |
| Tamaño de letra | base 17 px |
| Ancho | 430 px · Espaciado: 14 px · Alineación: izquierda (no centro) |
| Animación de entrada | «rise», escalonada; con `prefers-reduced-motion` ninguna |
| Hover | «lift» en tarjetas; «glow» no |
| Botones | fondo `#0D110A`, texto `#D5FF4E`, borde `#0D110A` 2 px sólido, radio 40, sombra none (el secundario: fondo transparente, texto tinta) |
| Barra de anuncio | no |
| Por bloque | tarjetas blancas: fondo `#FFFFFF`, borde `#0D110A`, texto tinta; banda Fundadores: fondo `#0D110A`, texto `#F1F3EC` |

## 4. Funciones nuevas que pide (en orden de valor)
A. **Fuentes de marca por página** (Familjen 600/700, Schibsted 400–700, Chivo 900; OFL, vía @fontsource, sólo lo que use la página). Sin esto no hay look cheapweb.
B. **Cifra grande** (bloque «número»: etiqueta + valor Chivo 900 + nota) para «10» y «100 %»; también sirve a otros negocios.
C. **Tarjeta con borde y sombra dura** (estilo de bloque: `borde 2 px + sombra dura + rotación opcional ±2°`).
D. **Marquesina** de texto con separador-imagen (el bloque «marquesina» ya existe: sólo falta separador tache y bloque inclinado −1.5°).
E. **Fichas en tira horizontal** (carrusel de enlaces cortos con scroll táctil y snap) para los 15 giros.
F. **Resaltador** en el título (marcar una parte con caja de color). Alternativa sin función: dejar el título en una sola tinta.
G. **Marca de agua** (el tache como imagen decorativa con opacidad .07, `aria-hidden`). Se puede subir como imagen de fondo de bloque si no se hace función.
Mínimo viable: A + B + C. D–G suben el «wow» pero la página funciona sin ellas.

## 5. Imágenes
- Tache (SVG, usa la ruta de cheapweb.mx/brand/tokens.css `--tache`): avatar y marca de agua. Avatar: `cheapweb-mark.svg` (o el circular cuando se publique).
- Opcional (más wow): captura vertical de 1–2 demos (dental, restaurante) en un marco de teléfono, 780×1560 WebP ≤ 120 KB, junto a «Mira el sitio de tu giro».

## 6. Textos
Los de arriba cambian sólo en titular y subtítulo (más cortos que el brief). Sin cuantificadores sin respaldo: precios y plazos son los publicados; «100 %» es la garantía de devolución del sitio.

## 7. Accesibilidad
Medido en la maqueta: 0 objetivos táctiles < 44 px, 0 textos < 14 px. Contraste ≥ 4.5:1. Marquesina y tache decorativos con `aria-hidden`; movimiento (marquesina, punto pulsante) apagado con `prefers-reduced-motion`. Orden de lectura = orden visual.
