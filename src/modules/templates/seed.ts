import type { DB } from '../../db/index.ts'
import { defaultBioData } from '../bio/design.ts'
import { createTemplate, type TemplateBlock } from './repo.ts'

/** Plantillas generales de arranque por giro (es-MX). Se crean una vez; el admin puede borrarlas o agregar más. */
const b = (type: string, data: Record<string, unknown>): TemplateBlock => ({ type, is_enabled: 1, data, style: {} })
const weekdays = (open: string, close: string, sat?: [string, string]) => [
  ...['mon', 'tue', 'wed', 'thu', 'fri'].map((day) => ({ day, open, close })),
  ...(sat ? [{ day: 'sat', open: sat[0], close: sat[1] }] : []),
]

const SEEDS: { slug: string; name: string; category: string; theme: string; blocks: TemplateBlock[] }[] = [
  {
    slug: 'restaurante', name: 'Restaurante o cafetería', category: 'food', theme: 'papel',
    blocks: [
      b('heading', { text: 'Nombre de tu negocio', level: 'h1' }),
      b('paragraph', { text: 'Cuenta en una línea qué te hace especial: tu especialidad, tu colonia, tu horario.' }),
      b('big_link', { label: 'Pide por WhatsApp', url: 'https://wa.me/52', subtitle: 'Te contestamos en minutos', effect: 'pulse' }),
      b('link', { label: 'Menú del día', url: 'https://' }),
      b('link', { label: 'Cómo llegar', url: 'https://maps.google.com/' }),
      b('hours', { title: 'Horario', timezone: 'America/Mexico_City', items: weekdays('08:00', '20:00', ['09:00', '21:00']) }),
      b('socials', { links: {}, colored: false, size: 'md' }),
    ],
  },
  {
    slug: 'consultorio', name: 'Consultorio o servicios profesionales', category: 'health', theme: 'menta',
    blocks: [
      b('heading', { text: 'Dra. / Lic. Tu nombre', level: 'h1' }),
      b('paragraph', { text: 'Tu especialidad, cédula y dónde atiendes.' }),
      b('big_link', { label: 'Agenda tu cita', url: 'https://wa.me/52', subtitle: 'Por WhatsApp', effect: 'none' }),
      b('link', { label: 'Servicios y precios', url: 'https://' }),
      b('link', { label: 'Ubicación del consultorio', url: 'https://maps.google.com/' }),
      b('hours', { title: 'Horario de atención', timezone: 'America/Mexico_City', items: weekdays('10:00', '19:00', ['10:00', '14:00']) }),
    ],
  },
  {
    slug: 'tienda', name: 'Tienda o emprendimiento', category: 'business', theme: 'nube',
    blocks: [
      b('heading', { text: 'Nombre de tu tienda', level: 'h1' }),
      b('paragraph', { text: 'Qué vendes y a dónde envías.' }),
      b('big_link', { label: 'Ver catálogo', url: 'https://', subtitle: 'Precios actualizados', effect: 'shine' }),
      b('link', { label: 'Pedidos por WhatsApp', url: 'https://wa.me/52' }),
      b('link', { label: 'Envíos y formas de pago', url: 'https://' }),
      b('socials', { links: {}, colored: true, size: 'md' }),
    ],
  },
  {
    slug: 'creador', name: 'Creador de contenido', category: 'creator', theme: 'neon',
    blocks: [
      b('heading', { text: '@tuusuario', level: 'h1' }),
      b('paragraph', { text: 'De qué trata tu contenido y cada cuándo publicas.' }),
      b('big_link', { label: 'Mi video más reciente', url: 'https://', effect: 'pulse' }),
      b('link', { label: 'Colaboraciones y prensa', url: 'mailto:' }),
      b('link', { label: 'Apóyame', url: 'https://' }),
      b('socials', { links: {}, colored: true, size: 'lg' }),
    ],
  },
]

export function ensureSeedTemplates(db: DB, now: number): void {
  SEEDS.forEach((s, i) => {
    if (db.prepare('SELECT 1 FROM templates WHERE slug = ?').get(s.slug)) return
    createTemplate(db, { userId: null, slug: s.slug, name: s.name, category: s.category, design: { ...defaultBioData(s.name, '', s.theme), seo_title: '' }, blocks: s.blocks, sort: i }, now)
  })
}
