# Brief para `design`: tubio v2 con la sensación de WhatsApp (Alejandro, 23-oct-2026)

**Contexto.** Alejandro probó en su celular la v2 con Mercado · Jamaica (ya en producción) y **no le gustó**. Quiere que tubio
se sienta como **WhatsApp**, que es la app que sus clientes (negocios en México) usan todo el día: así no tienen que
aprender nada.

## Qué sí
- Tomar los **patrones** que la gente ya conoce: lista de filas limpias tipo chats (avatar/ícono redondo, título en
  negritas, línea secundaria gris, dato a la derecha), barra de pestañas inferior, botón flotante redondo para «Crear»,
  cabecera sencilla, hojas inferiores, mucho blanco, separadores finos, interruptores y casillas del sistema.
- Paleta **verde** fresca y legible con neutros claros/oscuros tipo app de mensajería, en claro y oscuro (AA).
- Tipografía del sistema o una libre (OFL) muy neutra y legible, tamaños generosos.
- Densidad y gestos de app nativa: filas de 64–72 px, toques de 44 px mínimo, texto ≥ 14 px (16 en campos).

## Qué no (marca registrada de Meta)
- **No** usar el logo, el nombre, el ícono del teléfono en burbuja, ni los íconos o ilustraciones de WhatsApp.
- **No** usar su verde exacto (#25D366 / #075E54 / #128C7E) ni el fondo de chat con dibujos: un verde propio, distinto.
- Nada que haga pensar que tubio es de WhatsApp o de Meta (tubio debe verse como tubio).

## Entregables (igual que la vez pasada)
`tokens-<nombre>.css` (claro/oscuro, escala, radios, espaciado, sombras) + maqueta 390 px de: Enlaces con pestañas y
«Crear», editor con Editar | Vista previa, arrastre y «⋯», hoja «Añadir bloque», estadísticas, una página bio de ejemplo;
y el editor en escritorio. Auditado: 0 táctiles < 44 px, 0 textos < 14 px, AA. Si puedes, 2 variantes para que escoja.
Entrega a la sesión `tubio` (a-master enviar --para tubio) y capturas para Alejandro.
