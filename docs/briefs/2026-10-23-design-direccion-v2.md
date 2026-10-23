# Brief para la sesión `design` (Opus): dirección visual de tubio v2

**Lo pide:** sesión `tubio`, con ok de Alejandro (23-oct-2026). **Entrega para Alejandro** (él escoge).

## Qué es tubio
Link in bio de software libre (AGPL) en **https://tubio.link**: páginas bio hechas de bloques, enlaces cortos, QR,
estadísticas sin IPs, planes de pago. Público principal: **negocios y creadores en México**, que lo usan casi siempre
**desde el celular**. Idioma es-MX (también en). Hoy funciona pero se ve genérico y en el celular es incómodo.

## Lo que pide la v2
Rehacer la UI/UX con foco móvil. Auditoría a 390×844 (`docs/ROADMAP-V2.md` en el repo, sección «auditoría móvil»):
cabecera de 170 px con menú en 3 renglones, hasta 51 objetivos táctiles < 44 px por pantalla, mucho texto < 14 px,
editor de bloques con 5 botones por bloque y flechas para reordenar, **sin vista previa en el celular**, página de
diseño de ~9 000 px de alto.

## Qué te pido
**2 o 3 direcciones visuales** distintas, cada una con:
1. Nombre y una línea de personalidad (p. ej. «cálida y cercana», «editorial», «técnica y limpia»).
2. **Tokens**: tipografía (sólo fuentes con licencia libre OFL/Apache que podamos servir nosotros), escala de tamaños,
   paleta clara y oscura (contraste AA mínimo 4.5:1 en texto), radios, sombras, espaciado.
3. **Maquetas móviles (390 px)** de estas pantallas:
   - Panel: inicio/lista de enlaces con **barra de pestañas inferior** (Enlaces · QR · Estadísticas · Cuenta) y botón
     «Crear».
   - **Editor de página bio** con interruptor «Editar | Vista previa», tarjetas de bloque con agarradera para arrastrar
     y menú «⋯», y la hoja inferior de «Añadir bloque».
   - Una **página bio pública** de ejemplo (negocio: cafetería) con 2 temas.
   - Estadísticas de una página (KPIs + gráfica).
4. Una versión de escritorio de una sola pantalla (el editor) para ver cómo escala.

## Reglas
- Diseño **propio**: no tomes como referencia la interfaz de 66biolinks/AltumCode ni alav.link (sala limpia). Sí puedes
  inspirarte en principios generales de buen diseño móvil.
- Objetivos táctiles ≥ 44 px, texto ≥ 14 px (16 px en campos), sin depender sólo del color, `prefers-reduced-motion`.
- Entrega en HTML/CSS (o artefacto) que tubio pueda convertir en su CSS; tokens como variables CSS.
- Al terminar, contesta a la sesión `tubio` con `a-master enviar --para tubio` y el enlace o ruta de las maquetas.
