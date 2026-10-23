# Brief para la sesión `rea` (Opus): lista de funciones de referencia para tubio v2

**Lo pide:** sesión `tubio`, con ok de Alejandro (23-oct-2026).
**Para qué:** en la v2 de tubio hay que revisar cada función del producto de referencia (66biolinks v72 de AltumCode),
compararla con la nuestra, mejorarla y proponer nuevas. tubio es una **reescritura en sala limpia** (AGPL): la sesión
tubio nunca ve el producto de referencia. Tú sí, y escribes sólo **comportamientos**.

## Reglas de sala limpia (obligatorias)
- Describe **qué hace** cada función desde el punto de vista de quien la usa: entradas, opciones, límites, resultados,
  estados, errores visibles, permisos por plan.
- **No** incluyas: código, nombres de archivos/clases/funciones/tablas/columnas, SQL, CSS, nombres de clases HTML,
  textos de idioma copiados, imágenes, capturas, íconos ni el diseño visual/maquetación.
- Redacta con tus propias palabras. Si una opción tiene un nombre en la interfaz, descríbela («elegir el tipo de
  borde del botón: sólido, punteado…»), no pegues la etiqueta.
- No mandes fragmentos a la sesión tubio por ningún otro canal.

## Qué entregar
Un archivo Markdown `SPEC-V2-REFERENCIA.md` (dónde dejarlo: lo decide master; tubio lo recoge) con:

1. **Inventario por área**, una sección cada una:
   página bio (diseño y cada tipo de bloque con todas sus opciones), enlaces cortos y sus opciones (contraseña,
   fechas, tope de clics, segmentación por país/dispositivo/idioma, A/B, píxeles, splash, cloak, UTM, etc.), archivos,
   vCard, eventos, sitios estáticos, QR (tipos y estilos), estadísticas (dimensiones, filtros, exportación), proyectos,
   dominios propios, equipos, API, notificaciones/integraciones, formularios y datos capturados, planes y cobro
   (pasarelas, cupones, impuestos, facturas, afiliados), cuenta (2FA, sesiones, borrar, exportar), administración
   (usuarios, contenido, ajustes, plugins/módulos, páginas, blog, anuncios), directorio, PWA, idiomas.
2. Por cada función: **qué hace**, **opciones y límites**, **en qué plan está**, y una nota **«flujo en móvil»** de
   cómo se usa hoy en el celular (pasos y fricciones observadas, sin describir el diseño visual).
3. Una tabla final **«Lo que la referencia tiene y no está en `docs/SPEC.md` de tubio»** (la SPEC la puedes leer:
   `/var/www/vhosts/nexosrv.one/workspace/tools/tubio/docs/SPEC.md`).
4. **Fricciones y quejas típicas** de usuarios de este tipo de producto que conozcas (para que v2 las mejore).

Sé exhaustivo: es la base para medir paridad. Si algo es dudoso, márcalo como dudoso en vez de inventar.
