# Cómo contribuir a tubio

¡Gracias! tubio es software libre (AGPL-3.0-or-later). Al enviar un cambio aceptas que se publique bajo esa licencia.

## Regla de oro: sala limpia

tubio se escribió desde cero a partir de [`docs/SPEC.md`](docs/SPEC.md). **No** copies, adaptes ni "te inspires
línea por línea" en código, CSS, textos, imágenes o esquemas de productos propietarios de link in bio. Si conoces uno
por dentro, describe el comportamiento que quieres en un issue y deja que otra persona lo implemente.

Dependencias nuevas: sólo con licencia compatible con AGPL (MIT, BSD, Apache-2.0, ISC, MPL-2.0, LGPL, GPL, OFL para
fuentes, CC0/CC-BY para recursos). Anótalas en [`docs/DEPENDENCIAS.md`](docs/DEPENDENCIAS.md) en el mismo cambio.

## Antes de abrir un PR

```bash
npm install
npm run check        # tsc --noEmit + vitest: debe quedar en verde
```

- Cambios chicos y con prueba: cada arreglo trae la prueba que fallaba antes.
- Textos de la interfaz siempre en `src/locales/es-MX.json` **y** `en.json` (una prueba exige las mismas llaves).
- HTML con las plantillas `html``…`` (escapan por defecto); `raw()` sólo con contenido ya saneado y explicando por qué.
- Nada de `innerHTML` con datos de usuarios en el navegador; scripts con `nonce` (la CSP lo exige).
- Migraciones nuevas en `src/db/migrations/NNNN-nombre.sql`; nunca edites una ya publicada.
- Accesibilidad: etiquetas en todos los campos, foco visible, contraste AA, que todo funcione con teclado.

## Seguridad

No abras issues públicos de vulnerabilidades: sigue la [política de divulgación](https://tubio.link/security).

## Mensajes de commit

En español, en presente y diciendo el porqué: `Enlaces: el tope diario también aplica a la API`.
