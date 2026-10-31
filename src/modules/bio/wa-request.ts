// Solicitud por WhatsApp: una hoja con campos que arma el mensaje en el NAVEGADOR y abre wa.me; opcionalmente guarda la
// solicitud como dato capturado. Siempre es una solicitud, nunca una reserva confirmada: el negocio responde por WhatsApp.
import { html, type SafeHtml } from '../../lib/html.ts'
import type { T } from '../../lib/i18n.ts'
import type { BlockDef, BlockRow, RenderCtx } from './blocks.ts'

const s = (v: unknown): string => (typeof v === 'string' ? v : '')
const digits = (v: string) => v.replace(/\D/g, '')

export const WA_PRESETS = ['cita', 'reservacion', 'pedido', 'cotizacion', 'visita', 'clase', 'regalo', 'libre'] as const
export type WaPreset = (typeof WA_PRESETS)[number]
export const WA_TIPOS = ['texto', 'numero', 'fecha', 'hora', 'franja', 'uno', 'varios', 'tel', 'servicio', 'propiedad', 'personas'] as const
export type WaTipo = (typeof WA_TIPOS)[number]

export type WaField = { clave: string; etiqueta: string; tipo: WaTipo; requerido: boolean; opciones: string[] }

/** Campos por defecto de cada preset (las claves son fijas: no dependen del idioma) */
const PRESET_FIELDS: Record<WaPreset, { clave: string; tipo: WaTipo; req?: boolean; opts?: string }[]> = {
  cita: [
    { clave: 'servicio', tipo: 'servicio' },
    { clave: 'fecha', tipo: 'fecha' },
    { clave: 'franja', tipo: 'franja' },
    { clave: 'nombre', tipo: 'texto', req: true },
    { clave: 'primera_vez', tipo: 'uno', opts: 'yesno' },
  ],
  reservacion: [
    { clave: 'fecha', tipo: 'fecha', req: true },
    { clave: 'hora', tipo: 'hora', req: true },
    { clave: 'personas', tipo: 'personas', req: true },
    { clave: 'nombre', tipo: 'texto', req: true },
    { clave: 'ocasion', tipo: 'texto' },
  ],
  pedido: [
    { clave: 'entrega', tipo: 'uno', req: true, opts: 'entrega' },
    { clave: 'direccion', tipo: 'texto' },
    { clave: 'pago', tipo: 'uno', req: true, opts: 'pago' },
    { clave: 'nombre', tipo: 'texto', req: true },
  ],
  cotizacion: [
    { clave: 'detalle', tipo: 'texto', req: true },
    { clave: 'nombre', tipo: 'texto', req: true },
  ],
  visita: [
    { clave: 'propiedad', tipo: 'propiedad' },
    { clave: 'dia', tipo: 'fecha', req: true },
    { clave: 'franja', tipo: 'franja' },
    { clave: 'nombre', tipo: 'texto', req: true },
  ],
  clase: [
    { clave: 'programa', tipo: 'servicio', req: true },
    { clave: 'dia', tipo: 'fecha', req: true },
    { clave: 'nombre', tipo: 'texto', req: true },
  ],
  regalo: [
    { clave: 'monto', tipo: 'texto', req: true },
    { clave: 'para', tipo: 'texto', req: true },
    { clave: 'de', tipo: 'texto', req: true },
    { clave: 'mensaje', tipo: 'texto' },
  ],
  libre: [
    { clave: 'nombre', tipo: 'texto', req: true },
    { clave: 'mensaje', tipo: 'texto', req: true },
  ],
}

export const clave = (etiqueta: string): string =>
  etiqueta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)

const preset = (b: BlockRow): WaPreset => ((WA_PRESETS as readonly string[]).includes(s(b.data.preset)) ? (s(b.data.preset) as WaPreset) : 'cita')

/** Campos personalizados del negocio, si llenó alguna fila; si no, los del preset */
function customFields(b: BlockRow): { clave: string; etiqueta: string; tipo: WaTipo; requerido: boolean; opciones: string[] }[] {
  const rows = Array.isArray(b.data.campos) ? (b.data.campos as Record<string, unknown>[]) : []
  const used = new Set<string>()
  const out: ReturnType<typeof customFields> = []
  for (const r of rows) {
    const etiqueta = s(r.etiqueta).trim()
    if (!etiqueta) continue
    let k = clave(etiqueta) || `campo_${out.length + 1}`
    while (used.has(k)) k += '_2'
    used.add(k)
    const tipo = (WA_TIPOS as readonly string[]).includes(s(r.tipo)) ? (s(r.tipo) as WaTipo) : 'texto'
    out.push({ clave: k, etiqueta, tipo, requerido: s(r.requerido) === 'si', opciones: s(r.opciones).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12) })
  }
  return out
}

/** Sólo las claves (para validar el envío en el servidor sin conocer el idioma de la página) */
export function waKeys(b: BlockRow): string[] {
  const c = customFields(b)
  return c.length ? c.map((f) => f.clave) : PRESET_FIELDS[preset(b)].map((f) => f.clave)
}

export function waFields(b: BlockRow, t: T): WaField[] {
  const c = customFields(b)
  if (c.length) return c
  return PRESET_FIELDS[preset(b)].map((f) => ({
    clave: f.clave,
    etiqueta: t(`ms.wa.f.${f.clave}`),
    tipo: f.tipo,
    requerido: !!f.req,
    opciones: f.opts ? [t(`ms.wa.o.${f.opts}.a`), t(`ms.wa.o.${f.opts}.b`), ...(f.opts === 'pago' ? [t('ms.wa.o.pago.c')] : [])] : [],
  }))
}

export const waTemplate = (b: BlockRow, t: T): string => s(b.data.plantilla).trim() || t(`ms.wa.tpl.${preset(b)}`)

export function waNumber(b: BlockRow, siteWa: string): string {
  const own = digits(s(b.data.numero))
  return own.length >= 8 && own.length <= 15 ? own : siteWa
}

function fieldHtml(rc: RenderCtx, b: BlockRow, f: WaField): SafeHtml {
  const id = `wa${b.id}-${f.clave}`
  const req = f.requerido
  const label = html`<label class="wa-l" for="${id}">${f.etiqueta}${req ? html`<span class="wa-req" aria-hidden="true"> *</span>` : ''}</label>`
  const common = { name: f.clave }
  void common
  const opt = (arr: string[]) => arr.map((o) => html`<option value="${o}">${o}</option>`)
  const radios = (arr: string[]) =>
    html`<fieldset class="wa-fs"><legend class="wa-l">${f.etiqueta}${req ? html`<span class="wa-req" aria-hidden="true"> *</span>` : ''}</legend><div class="wa-opts">${arr.map((o, i) => html`<label class="wa-o"><input type="radio" name="${f.clave}" value="${o}"${req && i === 0 ? html` required` : ''}> <span>${o}</span></label>`)}</div></fieldset>`
  switch (f.tipo) {
    case 'franja':
      return radios([rc.t('ms.wa.o.franja.a'), rc.t('ms.wa.o.franja.b'), rc.t('ms.wa.o.franja.c')])
    case 'uno':
      return f.opciones.length ? radios(f.opciones) : html`<div class="wa-f">${label}<input id="${id}" class="wa-in" name="${f.clave}" maxlength="120"${req ? html` required` : ''}></div>`
    case 'varios':
      return f.opciones.length
        ? html`<fieldset class="wa-fs"><legend class="wa-l">${f.etiqueta}</legend><div class="wa-opts">${f.opciones.map((o) => html`<label class="wa-o"><input type="checkbox" name="${f.clave}" value="${o}"> <span>${o}</span></label>`)}</div></fieldset>`
        : html`<div class="wa-f">${label}<input id="${id}" class="wa-in" name="${f.clave}" maxlength="200"></div>`
    case 'fecha':
      return html`<div class="wa-f">${label}<input id="${id}" class="wa-in" type="date" name="${f.clave}" data-wa-date${req ? html` required` : ''}></div>`
    case 'hora':
      return html`<div class="wa-f">${label}<input id="${id}" class="wa-in" type="time" name="${f.clave}"${req ? html` required` : ''}></div>`
    case 'numero':
      return html`<div class="wa-f">${label}<input id="${id}" class="wa-in" type="number" inputmode="decimal" name="${f.clave}" min="0" step="any"${req ? html` required` : ''}></div>`
    case 'personas':
      return html`<div class="wa-f">${label}<input id="${id}" class="wa-in" type="number" inputmode="numeric" name="${f.clave}" min="1" max="99" value="2"${req ? html` required` : ''}></div>`
    case 'tel':
      return html`<div class="wa-f">${label}<input id="${id}" class="wa-in" type="tel" name="${f.clave}" autocomplete="tel" maxlength="30"${req ? html` required` : ''}></div>`
    case 'servicio':
    case 'propiedad': {
      const list = optionsFromBlocks(rc, b, f.tipo)
      return list.length
        ? html`<div class="wa-f">${label}<select id="${id}" class="wa-in" name="${f.clave}"${req ? html` required` : ''}><option value="">—</option>${opt(list)}</select></div>`
        : html`<div class="wa-f">${label}<input id="${id}" class="wa-in" name="${f.clave}" maxlength="120"${req ? html` required` : ''}></div>`
    }
    default:
      return html`<div class="wa-f">${label}<input id="${id}" class="wa-in" name="${f.clave}" maxlength="200"${f.clave === 'nombre' ? html` autocomplete="name"` : ''}${req ? html` required` : ''}></div>`
  }
}

/** Opciones de «servicio»/«propiedad» tomadas de los bloques Carta de servicios y Propiedades de la misma página (pasos 4 y 6) */
function optionsFromBlocks(rc: RenderCtx, b: BlockRow, tipo: 'servicio' | 'propiedad'): string[] {
  const type = tipo === 'servicio' ? 'services' : 'listings'
  const rows = rc.db.prepare('SELECT data FROM bio_blocks WHERE link_id = ? AND type = ? AND is_enabled = 1 ORDER BY position, id').all(b.link_id, type) as { data: string }[]
  const out: string[] = []
  for (const r of rows) {
    try {
      const d = JSON.parse(r.data) as Record<string, unknown>
      if (tipo === 'servicio') for (const c of Array.isArray(d.categorias) ? (d.categorias as Record<string, unknown>[]) : []) for (const x of Array.isArray(c.servicios) ? (c.servicios as Record<string, unknown>[]) : []) out.push(s(x.nombre))
      else for (const x of Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : []) out.push(s(x.titulo))
    } catch {
      /* dato corrupto: sin opciones */
    }
  }
  return [...new Set(out.filter(Boolean))].slice(0, 60)
}

function render(rc: RenderCtx, b: BlockRow): SafeHtml {
  const num = waNumber(b, rc.site.wa)
  if (!num) return html``
  const fields = waFields(b, rc.t)
  const tpl = waTemplate(b, rc.t)
  const boton = s(b.data.boton) || rc.t(`ms.wa.btn.${preset(b)}`)
  const titulo = s(b.data.titulo_hoja) || boton
  const enviar = s(b.data.texto_enviar) || rc.t('ms.wa.send')
  const aviso = s(b.data.aviso_legal).trim() || rc.t('ms.wa.legal')
  // sin JS (o antes de cargar) el botón es un enlace directo con un saludo
  const fallback = `https://wa.me/${num}?text=${encodeURIComponent(rc.t('ms.wa.hello', { negocio: rc.site.title }))}`
  const id = `wa-t-${b.id}`
  return html`<div class="war" data-wa="${b.id}">
  <a class="btn war-open" href="${fallback}" target="_blank" rel="noopener" data-wa-open aria-haspopup="dialog">${boton}</a>
  <dialog class="wa-sheet" data-wa-sheet aria-labelledby="${id}">
    <form class="wa-form" data-wa-form data-num="${num}" data-tpl="${tpl}" data-negocio="${rc.site.title}" data-save="${b.data.guardar_copia === false ? '0' : '1'}" data-csrf="${rc.csrf}" data-block="${b.id}" data-miss="${rc.t('ms.wa.missing')}" novalidate>
      <div class="wa-head"><h2 id="${id}" class="wa-title">${titulo}</h2><button type="button" class="wa-x" data-wa-close aria-label="${rc.t('ms.wa.close')}">×</button></div>
      <div class="wa-fields">${fields.map((f) => fieldHtml(rc, b, f))}</div>
      <p class="wa-legal">${aviso}</p>
      <p class="wa-err" role="alert" data-wa-err hidden></p>
      <button class="btn wa-go" type="submit">${enviar}</button>
    </form>
  </dialog>
</div>`
}

export const WA_BLOCK: BlockDef = {
  type: 'wa_request',
  group: 'site',
  fields: [
    { name: 'preset', kind: 'select', label: 'ms.f.wa_preset', options: [...WA_PRESETS], default: 'cita' },
    { name: 'numero', kind: 'text', label: 'ms.f.wa_numero', max: 20, placeholder: '5213121234567' },
    { name: 'boton', kind: 'text', label: 'ms.f.wa_boton', max: 40 },
    { name: 'titulo_hoja', kind: 'text', label: 'ms.f.wa_titulo', max: 60 },
    { name: 'texto_enviar', kind: 'text', label: 'ms.f.wa_enviar', max: 40 },
    {
      name: 'campos',
      kind: 'rows',
      label: 'ms.f.wa_campos',
      maxRows: 6,
      minRows: 0,
      columns: [
        { name: 'etiqueta', label: 'ms.f.wa_c_etiqueta', type: 'text', max: 40 },
        { name: 'tipo', label: 'ms.f.wa_c_tipo', type: 'select', options: [...WA_TIPOS] },
        { name: 'requerido', label: 'ms.f.wa_c_req', type: 'select', options: ['no', 'si'] },
        { name: 'opciones', label: 'ms.f.wa_c_opts', type: 'text', max: 200 },
      ],
    },
    { name: 'plantilla', kind: 'textarea', label: 'ms.f.wa_plantilla', max: 600, rows: 4, hint: 'ms.f.wa_plantilla_hint' },
    { name: 'guardar_copia', kind: 'checkbox', label: 'ms.f.wa_copia', default: true },
    { name: 'aviso_legal', kind: 'text', label: 'ms.f.wa_aviso', max: 200 },
    { name: 'targets', kind: 'targets', label: 'bio.f.targets' },
  ],
  render,
  summary: (b) => s(b.data.boton) || s(b.data.preset) || 'WhatsApp',
}
