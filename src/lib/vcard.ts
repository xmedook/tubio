import { z } from 'zod'

export const vcardSchema = z.object({
  first_name: z.string().trim().max(100).default(''),
  last_name: z.string().trim().max(100).default(''),
  org: z.string().trim().max(150).default(''),
  job_title: z.string().trim().max(150).default(''),
  phone: z.string().trim().max(40).default(''),
  phone_work: z.string().trim().max(40).default(''),
  email: z.string().trim().max(254).default(''),
  url: z.string().trim().max(500).default(''),
  street: z.string().trim().max(200).default(''),
  city: z.string().trim().max(100).default(''),
  region: z.string().trim().max(100).default(''),
  postal_code: z.string().trim().max(20).default(''),
  country: z.string().trim().max(100).default(''),
  note: z.string().trim().max(1000).default(''),
})
export type VCardData = z.infer<typeof vcardSchema>

/** Escape de valores de texto de vCard (RFC 6350 §3.4) */
function v(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

/** Líneas de más de 75 octetos se doblan con CRLF + espacio */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  let curLen = 0
  for (const ch of line) {
    const len = Buffer.byteLength(ch)
    const limit = out.length === 0 ? 75 : 74
    if (curLen + len > limit) {
      out.push(cur)
      cur = ''
      curLen = 0
    }
    cur += ch
    curLen += len
  }
  out.push(cur)
  return out.join('\r\n ')
}

export function buildVCard(d: VCardData): string {
  const fn = [d.first_name, d.last_name].filter(Boolean).join(' ') || d.org || 'Contacto'
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${v(d.last_name)};${v(d.first_name)};;;`, `FN:${v(fn)}`]
  if (d.org) lines.push(`ORG:${v(d.org)}`)
  if (d.job_title) lines.push(`TITLE:${v(d.job_title)}`)
  if (d.phone) lines.push(`TEL;TYPE=CELL:${v(d.phone)}`)
  if (d.phone_work) lines.push(`TEL;TYPE=WORK:${v(d.phone_work)}`)
  if (d.email) lines.push(`EMAIL;TYPE=INTERNET:${v(d.email)}`)
  if (d.url) lines.push(`URL:${v(d.url)}`)
  if (d.street || d.city || d.region || d.postal_code || d.country) {
    lines.push(`ADR;TYPE=WORK:;;${v(d.street)};${v(d.city)};${v(d.region)};${v(d.postal_code)};${v(d.country)}`)
  }
  if (d.note) lines.push(`NOTE:${v(d.note)}`)
  lines.push('END:VCARD')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export function vcardFileName(d: VCardData): string {
  const base = [d.first_name, d.last_name].filter(Boolean).join('-') || d.org || 'contacto'
  return (base.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'contacto') + '.vcf'
}
