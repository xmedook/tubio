import { z } from 'zod'
import { foldLine } from './vcard.ts'

export const eventSchema = z.object({
  name: z.string().trim().min(1, 'err.required').max(200, 'err.too_long'),
  description: z.string().trim().max(2000).default(''),
  location: z.string().trim().max(300).default(''),
  url: z.string().trim().max(500).default(''),
  /** epoch ms UTC */
  starts_at: z.number().int(),
  ends_at: z.number().int(),
  all_day: z.boolean().default(false),
  timezone: z.string().default('America/Mexico_City'),
})
export type EventData = z.infer<typeof eventSchema>

function t(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function utcStamp(ts: number): string {
  return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Fecha local (en la zona del evento) como YYYYMMDD, para eventos de día completo */
function localDate(ts: number, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts)
  return p.replace(/-/g, '')
}

export function buildIcs(e: EventData, uid: string, now: number): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//tubio//tubio//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${utcStamp(now)}`]
  if (e.all_day) {
    const start = localDate(e.starts_at, e.timezone)
    // DTEND de día completo es exclusivo: día siguiente al último
    const endDay = localDate(e.ends_at, e.timezone)
    const end = new Date(Date.UTC(+endDay.slice(0, 4), +endDay.slice(4, 6) - 1, +endDay.slice(6, 8) + 1))
    lines.push(`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, '')}`)
  } else {
    lines.push(`DTSTART:${utcStamp(e.starts_at)}`, `DTEND:${utcStamp(Math.max(e.ends_at, e.starts_at))}`)
  }
  lines.push(`SUMMARY:${t(e.name)}`)
  if (e.description) lines.push(`DESCRIPTION:${t(e.description)}`)
  if (e.location) lines.push(`LOCATION:${t(e.location)}`)
  if (e.url) lines.push(`URL:${t(e.url)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
