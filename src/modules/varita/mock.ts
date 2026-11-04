import type { Plan } from './plan.ts'

/**
 * Plan simulado, sin IA: sirve para las pruebas y para trabajar sin llave. Detecta el giro por palabras y toma el
 * nombre de lo primero que escribió la persona. Nunca inventa datos: precios, dirección y horario quedan vacíos.
 */
const GIRO_WORDS: [Plan['giro'], RegExp][] = [
  ['restaurante', /taquer|restaur|cocina|comida|caf[eé]|pizz|mariscos|panader|antojitos/i],
  ['belleza', /sal[oó]n|u[ñn]as|pesta[ñn]as|barber|belleza|spa|maquillaje/i],
  ['salud', /doctor|dra?\.|consultorio|dental|dentista|psic[oó]log|nutri|fisio|cl[ií]nica/i],
  ['inmobiliaria', /inmobiliar|bienes ra[ií]ces|casas|departamentos|renta/i],
  ['fitness', /gimnasio|gym|yoga|pilates|crossfit|entrenador|box/i],
]

export function mockPlan(description: string): Plan {
  const giro = GIRO_WORDS.find(([, re]) => re.test(description))?.[0] ?? 'servicios'
  const nombre = (description.split(/[,.\n]/)[0] ?? '').trim().slice(0, 60) || 'Mi negocio'
  const wa = (description.match(/(?:\+?52\s?)?(\d[\d\s-]{9,14}\d)/)?.[1] ?? '').replace(/\D/g, '')
  const menu = giro === 'restaurante'
  return {
    nombre,
    giro,
    idioma: /\b(the|and|we|our)\b/i.test(description) ? 'en' : 'es',
    estilo: { tema: menu ? 'papel' : 'nube', fuente_texto: 'inter', fuente_titulos: 'playfair', color_principal: menu ? '#5a2d14' : '#1d3b5a', color_secundario: menu ? '#a0522d' : '#3a6a8a', color_suave: '#f6efe6' },
    portada: { antetitulo: 'Bienvenido', titulo: nombre, subtitulo: description.slice(0, 200) },
    acciones: [
      { titulo: menu ? 'Pedir por WhatsApp' : 'Escríbenos', subtitulo: 'Te respondemos por WhatsApp', tipo: 'whatsapp', destino: '', mensaje: `Hola, vi su página de ${nombre}`, principal: true },
      { titulo: menu ? 'Ver el menú' : 'Ver servicios', subtitulo: '', tipo: 'ancla', destino: 'oferta', mensaje: '', principal: false },
    ],
    solicitud: { tipo: menu ? 'pedido' : 'cita', antetitulo: 'Por WhatsApp', titulo: menu ? 'Haz tu pedido' : 'Agenda tu cita' },
    secciones: [
      { ancla: 'oferta', antetitulo: 'Lo que hacemos', titulo: menu ? 'Nuestro menú' : 'Servicios', subtitulo: '', fondo: 'claro', bloque: { tipo: menu ? 'menu' : 'servicios', texto: '', items: [{ titulo: menu ? 'Especialidad de la casa' : 'Servicio principal', descripcion: '', precio: '', categoria: '' }], preguntas: [], cifra: '' } },
      { ancla: 'como-pedir', antetitulo: 'Fácil', titulo: '¿Cómo pedir?', subtitulo: '', fondo: 'suave', bloque: { tipo: 'pasos', texto: '', items: [{ titulo: '1', descripcion: 'Escríbenos', precio: '', categoria: '' }, { titulo: '2', descripcion: 'Confirmamos', precio: '', categoria: '' }, { titulo: '3', descripcion: 'Listo', precio: '', categoria: '' }], preguntas: [], cifra: '' } },
    ],
    paginas: [],
    negocio: { whatsapp: wa, direccion: '', horario: [] },
    pie: '',
  }
}
