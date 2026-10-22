import type { DB } from '../../db/index.ts'

/**
 * Escritura en lote de estadísticas. Cada visita eran dos escrituras síncronas (evento + contador)
 * y eso era el 25 % del tiempo de una página bio. Con el lote activo se juntan en memoria y se
 * escriben en una sola transacción cada `intervalMs` o cada `maxRows` eventos. Si el proceso muere
 * de golpe se pierde, como mucho, ese intervalo de estadísticas; al apagarse normal se vacía.
 * Sin activar (pruebas, CLI) todo se escribe al momento.
 */

type Buf = {
  events: Record<string, unknown>[]
  links: Map<number, { hits: number; clicks: number }>
  blocks: Map<number, number>
  timer: NodeJS.Timeout
  maxRows: number
}
const buffers = new WeakMap<DB, Buf>()
type Stmt = { run: (...params: any[]) => unknown }
const stmts = new WeakMap<DB, { event: Stmt; link: Stmt; block: Stmt }>()

function st(db: DB) {
  let s = stmts.get(db)
  if (!s) {
    s = {
      event: db.prepare(
        `INSERT INTO stat_events (link_id, block_id, kind, ts, day, hour, visitor, country, city, device, os, browser, lang, referrer, utm_source, utm_medium, utm_campaign, variant)
         VALUES (@link_id, @block_id, @kind, @ts, @day, @hour, @visitor, @country, @city, @device, @os, @browser, @lang, @referrer, @utm_source, @utm_medium, @utm_campaign, @variant)`,
      ),
      link: db.prepare('UPDATE links SET hits = hits + ?, clicks = clicks + ? WHERE id = ?'),
      block: db.prepare('UPDATE bio_blocks SET clicks = clicks + ? WHERE id = ?'),
    }
    stmts.set(db, s)
  }
  return s
}

export function enableStatsBuffer(db: DB, intervalMs = 250, maxRows = 200): void {
  if (buffers.has(db) || intervalMs <= 0) return
  const timer = setInterval(() => flushStats(db), intervalMs)
  timer.unref()
  buffers.set(db, { events: [], links: new Map(), blocks: new Map(), timer, maxRows })
}

export function disableStatsBuffer(db: DB): void {
  const b = buffers.get(db)
  if (!b) return
  flushStats(db)
  clearInterval(b.timer)
  buffers.delete(db)
}

export function flushStats(db: DB): number {
  const b = buffers.get(db)
  if (!b || (!b.events.length && !b.links.size && !b.blocks.size)) return 0
  const events = b.events.splice(0)
  const links = new Map(b.links)
  const blocks = new Map(b.blocks)
  b.links.clear()
  b.blocks.clear()
  const s = st(db)
  db.transaction(() => {
    for (const e of events) s.event.run(e)
    for (const [id, v] of links) s.link.run(v.hits, v.clicks, id)
    for (const [id, n] of blocks) s.block.run(n, id)
  })()
  return events.length
}

export function addEvent(db: DB, row: Record<string, unknown>): void {
  const b = buffers.get(db)
  if (!b) {
    st(db).event.run(row)
    return
  }
  b.events.push(row)
  if (b.events.length >= b.maxRows) flushStats(db)
}

export function addLinkHit(db: DB, id: number, human: boolean): void {
  const b = buffers.get(db)
  if (!b) {
    st(db).link.run(1, human ? 1 : 0, id)
    return
  }
  const cur = b.links.get(id) ?? { hits: 0, clicks: 0 }
  cur.hits++
  if (human) cur.clicks++
  b.links.set(id, cur)
}

export function addBlockClick(db: DB, id: number): void {
  const b = buffers.get(db)
  if (!b) {
    st(db).block.run(1, id)
    return
  }
  b.blocks.set(id, (b.blocks.get(id) ?? 0) + 1)
}

/** Entregas aún no escritas (para que el tope de clics no se pase mientras esperan) */
export function pendingHits(db: DB, id: number): number {
  return buffers.get(db)?.links.get(id)?.hits ?? 0
}
