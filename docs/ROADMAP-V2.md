# tubio v2 — paridad de funciones y UI/UX móvil primero (2026-10-22)

**Decisión de Alejandro:** la v2 **revisa cada función que tiene el producto de referencia, la mejora y propone
nuevas**, y **rehace la UI/UX, sobre todo en el celular**. Más ideas de largo plazo en `docs/IDEAS-V3.md`.

**Sala limpia, también en v2:** no se mira el código, CSS, imágenes ni la interfaz del producto de referencia (ni alav.link).
La paridad se mide contra una **lista de funciones** escrita sólo en términos de comportamiento, igual que `docs/SPEC.md`.
El diseño nuevo es propio.

Tamaños: S ≈ 1 día · M ≈ 2–4 días · L ≈ 1–2 semanas de sesión.

---

## Lo que encontró la auditoría móvil (`npm run mobile-audit`, iPhone 14, 390×844)

| Problema | Dónde | Dato |
|---|---|---|
| La cabecera ocupa ~170 px: el menú se parte en dos renglones y luego «Ayuda / English / Salir» en un tercero | todo el panel | 20 % de la pantalla antes del contenido |
| Botones y enlaces de menos de 44 px de alto (mínimo cómodo para el dedo) | todo el panel | 47 en el resumen, **51 en el editor de bloques**, 47 en diseño, 36 en el QR |
| Texto de menos de 14 px | estadísticas, resumen, editor | 61 en estadísticas, 29 en el resumen |
| Las pestañas de la página (Bloques / Diseño / Ajustes / Estadísticas) se parten en dos renglones | editor | — |
| Cada bloque muestra 5 botones (↑ ↓ Editar Ocultar Borrar) en fila | editor | 5 × N botones chicos; reordenar es con flechas |
| **No hay vista previa en el celular**: para ver cómo quedó hay que salir del editor | editor y diseño | la vista previa sólo existe en escritorio |
| La página de Diseño mide ~9 000 px de alto en el celular, y «Guardar» flota encima de los temas | diseño | — |
| Lista de enlaces: 3 botones por tarjeta, la URL completa, «Buscar» + «Tipo» + «Filtrar» ocupan media pantalla | enlaces | — |
| Sin scroll horizontal en ninguna pantalla | todas | ✅ esto ya está bien |

---

## V2.0 — Sistema de diseño y armazón móvil · M
- **Dirección visual nueva** (con la sesión `design`): tipografía propia libre (OFL) servida por nosotros, escala de
  tamaños, color, espaciado, radios, sombras, modo oscuro. Tokens en un solo archivo CSS.
- **Armazón del panel en móvil**: barra superior compacta (logo + título + menú de cuenta) y **barra de pestañas inferior**
  (Enlaces · QR · Estadísticas · Cuenta) con botón grande de **«Crear»**. En escritorio, barra lateral.
- Componentes base: botón (44 px mínimo), campo (16 px para que iOS no haga zoom), menú «⋯», hoja inferior
  (bottom sheet), chips de filtro, avisos tipo toast con «Deshacer», estados vacíos con ilustración.
- Criterio de salida: `mobile-audit` con **0 objetivos < 44 px y 0 textos < 14 px** en el panel (salvo letra legal).

## V2.1 — Editor de página bio, móvil primero · L
- Un solo lugar con interruptor **Editar | Vista previa** (vista previa real en vivo, sin salir).
- Bloques como tarjetas: **arrastrar desde una agarradera** (presión larga en táctil) para reordenar; menú «⋯» con
  editar / duplicar / ocultar / programar / borrar en lugar de 5 botones.
- **Añadir bloque** en hoja inferior con buscador y categorías (básicos, redes, negocio, multimedia, captura).
- Editar un bloque en pantalla completa con **guardado automático** y «Deshacer».
- **Diseño** en secciones plegables (tema, fondo, botones, tipografía, marca) con la vista previa siempre visible.

## V2.2 — Primer uso: de registrarse a página publicada en < 2 min · M
- Asistente de 3 pasos: giro o plantilla → nombre, foto y redes → publicar y compartir (copiar enlace, QR, WhatsApp).
- Plantillas por giro, como punto de partida, hechas con el sistema nuevo.
- Estados vacíos que enseñan el siguiente paso en cada pantalla.

## V2.3 — Listas y formularios · M
- Enlaces: tarjetas compactas (título, dominio corto, visitas, interruptor de activo) y menú «⋯»; búsqueda fija arriba
  y **chips** de tipo en lugar de select + botón.
- Formulario de enlace: lo básico arriba (destino, alias) y lo avanzado (contraseña, fechas, UTM, segmentación, píxeles)
  en secciones plegables.
- Creador de QR con la vista previa fija arriba y los controles en pestañas.

## V2.4 — Estadísticas en el celular · M
- KPIs en tarjetas deslizables, gráfica táctil (toca un día para ver el dato), rangos rápidos en chips (7 d, 30 d, mes).
- Tablas convertidas en listas legibles a 14 px como mínimo.

## V2.5 — Páginas públicas y temas · M
- Temas renovados con el sistema nuevo, micro-animaciones sutiles (respetando `prefers-reduced-motion`).
- Presupuesto de rendimiento en 4G: LCP < 1.5 s, CLS < 0.05, JS público < 15 KB.

## V2.6 — Funciones: revisar → mejorar → proponer · M–L (en paralelo a V2.1–V2.5)
Para cada área: 1) qué hace la referencia (lista de comportamientos), 2) qué tenemos, 3) qué mejoramos, 4) qué nuevo
proponemos. Primera pasada con lo que ya sé de nuestro lado; se completa con la lista de referencia.

| Área | Mejorar (propuesta) | Nuevo (propuesta) |
|---|---|---|
| Página bio y bloques | vista previa en vivo, duplicar bloque, programar visibilidad con calendario, bloques agrupados en secciones | **plantillas por giro**, **importar de Linktree/Beacons**, **agenda de citas**, **catálogo con pedido por WhatsApp** |
| Diseño | menos opciones a la vez y mejores valores por defecto; temas renovados | generar paleta desde el logo, **asistente con IA** que arma la página desde una descripción o el Instagram |
| Enlaces cortos | crear desde el portapapeles, editar en línea, vista de destino antes de abrir | enlaces que vencen por fecha o clics con página de «ya no disponible» propia, carpetas por campaña |
| QR | plantillas de estilo, descarga en un toque, QR dinámico por defecto | QR impreso listo (PDF con marco y texto), lote de QR desde CSV |
| Estadísticas | gráficas táctiles, comparar periodos, resumen semanal por correo | metas y conversión (clic → formulario o venta), exportar a Google Sheets |
| Captura y avisos | bandeja de respuestas más clara, filtros | conectores a Google Sheets, Mailchimp/Brevo, HubSpot, Zapier |
| Planes y cobro | página de planes más clara en móvil | **suscripciones con renovación automática**, **Mercado Pago (OXXO/SPEI)**, **CFDI a petición** vía Dolibarr, precios en USD |
| Equipos / agencias | invitar con enlace, roles más claros | plan Agencia con varios clientes y reportes con su marca |
| Admin | tablero de embudo (registro → publicado → pago) | moderación automática de URLs maliciosas |

Cada propuesta nueva se presenta con su porqué y tamaño, y **sólo entra con tu ok**.

## V2.7 — Calidad · S (continuo)
- `mobile-audit` y `npm run a11y` en cada cambio, con los umbrales de V2.0 como prueba que falla.
- Revisión en dispositivos reales (iPhone con Safari, Android con Chrome) y revisión manual con VoiceOver/TalkBack.

**Cómo se construye:** sin reescribir el stack. Se queda el HTML del servidor; se agrega un poco de JS sólo donde
hace falta (arrastrar, hojas inferiores, guardado automático, vista previa en vivo). Cada fase se publica por partes,
mejorando pantallas en sitio.

## Decisiones que necesito de ti
1. **Lista de funciones de referencia**: ¿le pido a la sesión `rea` que escriba un anexo a la SPEC con sólo
   comportamientos (sin código ni textos), como se hizo con la SPEC original? Con ella completo la columna de V2.6.
2. ¿Te parece que la sesión **`design`** proponga la dirección visual de V2.0 (2–3 opciones en maqueta para que escojas)?
3. Orden propuesto: V2.0 → V2.1 → V2.2 → V2.3 → V2.4 → V2.5, con V2.6 en paralelo. ¿Va?
4. De las propuestas nuevas de V2.6, ¿cuáles te interesan para empezar? (Las marcadas en negritas son mi recomendación.)
