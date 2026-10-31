// npm run seed-catalog [alias] — agrega menú con carrito + solicitud de pedido (y una carta de servicios) a un sitio de ejemplo; sólo desarrollo
import { loadConfig } from '../config.ts'
import { migrate, openDb } from '../db/index.ts'
import { createBlock } from '../modules/bio/repo.ts'
import { findByAlias } from '../modules/links/repo.ts'
import { createPage, loadSite, sectionsOf } from '../modules/minisitio/repo.ts'

const config = loadConfig()
if (config.env === 'production') throw new Error('seed-catalog no corre en producción')
const db = openDb(config.dbPath)
migrate(db)
const alias = process.argv[2] ?? 'demo-cafe'
const link = findByAlias(db, alias)
if (!link) throw new Error(`no existe /${alias}`)
const site = loadSite(db, link.id)
const pg = site.pages.find((p) => p.slug === 'menu')
if (!pg) throw new Error('el demo no tiene la página /menu (corre seed-portal)')
const sec = sectionsOf(site, pg.id)[0]!
const now = Date.now()
const blk = (type: string, data: Record<string, unknown>) => createBlock(db, link.id, { type, is_enabled: true, starts_at: null, ends_at: null, data, style: {} }, now, sec.id)
const row = (categoria: string, nombre: string, descripcion: string, precio: string, etiquetas = '', disponible = 'si') => ({ categoria, nombre, descripcion, precio, etiquetas, disponible })
blk('menu', {
  titulo: '',
  moneda: '$',
  carrito: true,
  items: [
    row('Bebidas', 'Espresso', 'Doble, grano de la casa', '$40', 'favorito'),
    row('Bebidas', 'Capuchino', 'Leche entera o de avena', '$60'),
    row('Bebidas', 'Chai latte', 'Especias molidas al momento', '$65', 'vegano'),
    row('Bebidas', 'Té frío de jamaica', '', '$45', 'vegano'),
    row('Comida', 'Hamburguesa clásica', 'Carne de res, queso, papas', '$90', 'favorito'),
    row('Comida', 'Chilaquiles verdes', 'Con huevo o pollo', '$85', 'picante'),
    row('Comida', 'Sándwich de pollo', 'Pan de masa madre', '$80'),
    row('Comida', 'Pozole rojo', 'Sólo fines de semana', '$110', '', 'no'),
    row('Postres', 'Pan de elote', 'Horneado hoy', '$50', 'nuevo'),
    row('Postres', 'Cheesecake', 'Frutos rojos', '$70'),
  ],
})
blk('wa_request', { preset: 'pedido', guardar_copia: true })
console.log(`listo: menú con carrito en /${alias}/menu`)
