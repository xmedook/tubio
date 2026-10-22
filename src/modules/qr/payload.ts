import { checkUrl } from '../../lib/urls.ts'
import { buildVCard, vcardSchema } from '../../lib/vcard.ts'
import type { Errors } from '../../views/ui.ts'

/** Tipos de QR y sus campos. "link" = QR dinámico: apunta a un enlace de tubio que puedes editar después. */
export const QR_KINDS = ['link', 'url', 'text', 'phone', 'sms', 'email', 'whatsapp', 'wifi', 'vcard', 'location'] as const
export type QrKind = (typeof QR_KINDS)[number]

export type QrField = { name: string; type?: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'link'; options?: string[]; max?: number; required?: boolean; placeholder?: string }

export const QR_FIELDS: Record<QrKind, QrField[]> = {
  link: [{ name: 'link_id', type: 'link', required: true }],
  url: [{ name: 'url', required: true, placeholder: 'https://', max: 2048 }],
  text: [{ name: 'text', type: 'textarea', required: true, max: 1500 }],
  phone: [{ name: 'phone', required: true, placeholder: '+52 55 1234 5678', max: 30 }],
  sms: [
    { name: 'phone', required: true, placeholder: '+52 55 1234 5678', max: 30 },
    { name: 'message', type: 'textarea', max: 500 },
  ],
  email: [
    { name: 'email', required: true, placeholder: 'hola@ejemplo.com', max: 254 },
    { name: 'subject', max: 200 },
    { name: 'body', type: 'textarea', max: 1000 },
  ],
  whatsapp: [
    { name: 'phone', required: true, placeholder: '5215512345678', max: 20 },
    { name: 'message', type: 'textarea', max: 500 },
  ],
  wifi: [
    { name: 'ssid', required: true, max: 64 },
    { name: 'encryption', type: 'select', options: ['WPA', 'WEP', 'nopass'] },
    { name: 'password', max: 63 },
    { name: 'hidden', type: 'checkbox' },
  ],
  vcard: [
    { name: 'first_name', max: 100 },
    { name: 'last_name', max: 100 },
    { name: 'org', max: 150 },
    { name: 'job_title', max: 150 },
    { name: 'phone', max: 40 },
    { name: 'email', max: 254 },
    { name: 'url', max: 500 },
  ],
  location: [
    { name: 'lat', type: 'number', required: true, placeholder: '19.4326' },
    { name: 'lng', type: 'number', required: true, placeholder: '-99.1332' },
  ],
}

const digits = (v: string) => v.replace(/[\s().-]/g, '')

/** Escape de MECARD/WIFI: \ ; , : " */
function wifiEsc(s: string): string {
  return s.replace(/([\\;,:"])/g, '\\$1')
}

export type PayloadResult = { ok: true; data: Record<string, unknown>; text: string } | { ok: false; errors: Errors }

/**
 * Valida los campos y arma el texto que se codifica. Para "link" el texto lo pone quien llama
 * (necesita la URL pública del enlace).
 */
export function buildPayload(kind: QrKind, raw: Record<string, string>): PayloadResult {
  const errors: Errors = {}
  const data: Record<string, unknown> = {}
  for (const f of QR_FIELDS[kind]) {
    const v = (raw[f.name] ?? '').trim()
    if (f.type === 'checkbox') {
      data[f.name] = v === '1' || v === 'on'
      continue
    }
    if (f.required && !v) errors[f.name] = 'err.required'
    else if (f.max && v.length > f.max) errors[f.name] = 'err.too_long'
    if (f.type === 'select') data[f.name] = f.options?.includes(v) ? v : f.options?.[0]
    else data[f.name] = v
  }
  if (Object.keys(errors).length) return { ok: false, errors }
  const d = data as Record<string, string>
  let text = ''
  switch (kind) {
    case 'link':
      if (!/^\d+$/.test(d.link_id ?? '')) return { ok: false, errors: { link_id: 'err.required' } }
      data.link_id = Number(d.link_id)
      break
    case 'url': {
      const r = checkUrl(d.url ?? '')
      if (!r.ok) return { ok: false, errors: { url: r.error } }
      data.url = text = r.url
      break
    }
    case 'text':
      text = d.text ?? ''
      break
    case 'phone':
      if (!/^\+?\d{6,15}$/.test(digits(d.phone ?? ''))) return { ok: false, errors: { phone: 'err.phone' } }
      text = `tel:${digits(d.phone ?? '')}`
      break
    case 'sms':
      if (!/^\+?\d{6,15}$/.test(digits(d.phone ?? ''))) return { ok: false, errors: { phone: 'err.phone' } }
      text = `SMSTO:${digits(d.phone ?? '')}:${d.message ?? ''}`
      break
    case 'email': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email ?? '')) return { ok: false, errors: { email: 'err.email' } }
      const q = new URLSearchParams()
      if (d.subject) q.set('subject', d.subject)
      if (d.body) q.set('body', d.body)
      const qs = q.toString().replace(/\+/g, '%20')
      text = `mailto:${d.email}${qs ? '?' + qs : ''}`
      break
    }
    case 'whatsapp': {
      const n = digits(d.phone ?? '').replace(/^\+/, '')
      if (!/^\d{8,15}$/.test(n)) return { ok: false, errors: { phone: 'err.phone' } }
      text = `https://wa.me/${n}${d.message ? '?text=' + encodeURIComponent(d.message) : ''}`
      break
    }
    case 'wifi':
      if (d.encryption !== 'nopass' && !d.password) return { ok: false, errors: { password: 'err.required' } }
      text = `WIFI:T:${d.encryption};S:${wifiEsc(d.ssid ?? '')};${d.encryption !== 'nopass' ? `P:${wifiEsc(d.password ?? '')};` : ''}${data.hidden ? 'H:true;' : ''};`
      break
    case 'vcard': {
      const vc = vcardSchema.parse(d)
      if (!vc.first_name && !vc.last_name && !vc.org) return { ok: false, errors: { first_name: 'err.vcard_name' } }
      text = buildVCard(vc)
      break
    }
    case 'location': {
      const lat = Number(d.lat)
      const lng = Number(d.lng)
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, errors: { lat: 'err.invalid' } }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, errors: { lng: 'err.invalid' } }
      data.lat = lat
      data.lng = lng
      text = `geo:${lat},${lng}`
      break
    }
  }
  return { ok: true, data, text }
}

/** Texto a codificar de un QR guardado */
export function payloadText(kind: QrKind, data: Record<string, unknown>, linkUrl: (id: number) => string | null): string | null {
  if (kind === 'link') return linkUrl(Number(data.link_id))
  const raw: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) raw[k] = typeof v === 'boolean' ? (v ? '1' : '') : String(v ?? '')
  const r = buildPayload(kind, raw)
  return r.ok ? r.text : null
}
