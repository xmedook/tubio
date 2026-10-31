import type { Giro } from '../minisitio/giros.ts'

export type GiroCopy = {
  /** titular de la página del giro */
  h1: string
  lead: string
  meta: string
  /** qué trae el sitio de este giro (6 puntos) */
  includes: string[]
  /** teléfono de muestra: lema y 3 botones */
  tag: string
  btns: [string, string, string]
  faq: { q: string; a: string }[]
}
type Loc = 'es-MX' | 'en'

export const GIRO_COPY: Record<Giro, Record<Loc, GiroCopy>> = {
  restaurante: {
    'es-MX': {
      h1: 'El sitio de tu restaurante o café, listo hoy',
      lead: 'Menú con carrito, pedidos y reservaciones que llegan a tu WhatsApp. Sin comisiones por pedido y sin saber de computación.',
      meta: 'Sitio web para restaurantes y cafés con menú, pedidos y reservaciones por WhatsApp. Listo en minutos, sin comisiones por pedido.',
      includes: ['Menú con categorías, precios y etiquetas (vegano, picante…)', 'Carrito sin cobro: el pedido te llega por WhatsApp', 'Reservación de mesa con fecha, hora y personas', 'Horario, mapa y cómo llegar', 'Botones a Uber Eats, Rappi y llamada', 'Lo editas tú desde el celular'],
      tag: 'Cocina de casa', btns: ['Pedir por WhatsApp', 'Ver menú', 'Reservar mesa'],
      faq: [{ q: '¿Cobran comisión por pedido?', a: 'No. El pedido llega a tu WhatsApp y tú cobras como siempre. Tu plan es lo único que pagas.' }, { q: '¿Puedo subir mi menú en PDF?', a: 'Sí, o armarlo platillo por platillo con precios y carrito. Puedes combinar las dos formas.' }],
    },
    en: {
      h1: 'Your restaurant or café site, ready today',
      lead: 'A menu with a cart, orders and table bookings that land in your WhatsApp. No per-order fees, no tech skills needed.',
      meta: 'A website for restaurants and cafés with a menu, orders and bookings by WhatsApp. Ready in minutes, no per-order fees.',
      includes: ['Menu with categories, prices and tags (vegan, spicy…)', 'A cart with no payment: the order reaches you on WhatsApp', 'Table booking with date, time and party size', 'Opening hours, map and directions', 'Buttons for delivery apps and calls', 'You edit it from your phone'],
      tag: 'Home cooking', btns: ['Order on WhatsApp', 'See menu', 'Book a table'],
      faq: [{ q: 'Do you charge a fee per order?', a: 'No. The order arrives on your WhatsApp and you get paid as usual. Your plan is all you pay.' }, { q: 'Can I upload my menu as a PDF?', a: 'Yes, or build it dish by dish with prices and a cart. You can mix both.' }],
    },
  },
  belleza: {
    'es-MX': {
      h1: 'El sitio de tu salón, uñas o barbería, listo hoy',
      lead: 'Carta de servicios con precio y duración, y citas que llegan a tu WhatsApp con día, hora y servicio ya elegidos.',
      meta: 'Sitio web para salones de belleza, uñas y barberías con servicios, precios y citas por WhatsApp. Listo en minutos.',
      includes: ['Carta de servicios con precio y duración', 'Botón «Agendar» que arma el mensaje de la cita', 'Equipo y especialidades', 'Galería de trabajos', 'Horario, mapa y cómo llegar', 'Tú confirmas cada cita: nada se reserva solo'],
      tag: 'Belleza y cuidado personal', btns: ['Agendar cita', 'Servicios y precios', 'Cómo llegar'],
      faq: [{ q: '¿Mis clientas reservan solas?', a: 'Eligen servicio, día y franja, y te llega el mensaje por WhatsApp. Tú confirmas el horario; no hay reservas automáticas que se empalmen.' }, { q: '¿Puedo cambiar precios yo misma?', a: 'Sí, desde el celular y en segundos. El sitio se actualiza al guardar.' }],
    },
    en: {
      h1: 'Your salon, nails or barbershop site, ready today',
      lead: 'A service menu with price and duration, and appointment requests that reach your WhatsApp with the day, time and service already chosen.',
      meta: 'A website for beauty salons, nail studios and barbershops with services, prices and bookings by WhatsApp. Ready in minutes.',
      includes: ['Service menu with price and duration', 'A «Book» button that writes the appointment message', 'Team and specialties', 'Gallery of your work', 'Opening hours, map and directions', 'You confirm every appointment: nothing books itself'],
      tag: 'Beauty and personal care', btns: ['Book appointment', 'Services and prices', 'Directions'],
      faq: [{ q: 'Do clients book on their own?', a: 'They pick a service, day and time slot and you get the message on WhatsApp. You confirm the time, so bookings never overlap.' }, { q: 'Can I change prices myself?', a: 'Yes, from your phone in seconds. The site updates when you save.' }],
    },
  },
  salud: {
    'es-MX': {
      h1: 'El sitio de tu consultorio, listo hoy',
      lead: 'Perfil con cédula verificable, tratamientos, videos y valoraciones que llegan a tu WhatsApp. Profesional y sencillo de mantener.',
      meta: 'Sitio web para médicos, dentistas y psicólogos con perfil, cédula verificable, tratamientos y citas por WhatsApp. Listo en minutos.',
      includes: ['Perfil profesional con credenciales y enlace para verificar la cédula', 'Línea de confianza (certificaciones, valoración sin compromiso)', 'Categorías de tratamientos con página propia', 'Carrusel de videos', 'Cita o valoración por WhatsApp', 'Mapa y horario del consultorio'],
      tag: 'Consulta médica', btns: ['Agendar valoración', 'Tratamientos', 'Ubicación'],
      faq: [{ q: '¿Puedo mostrar mi cédula?', a: 'Sí: tu perfil incluye credenciales y un enlace para verificar la cédula en la SEP, que da confianza a quien te busca.' }, { q: '¿Se guarda información médica de mis pacientes?', a: 'No pedimos datos clínicos. La solicitud de cita es un mensaje de WhatsApp con nombre, día y franja.' }],
    },
    en: {
      h1: 'Your practice site, ready today',
      lead: 'A profile with a verifiable licence, treatments, videos and consultation requests on your WhatsApp. Professional and easy to keep up.',
      meta: 'A website for doctors, dentists and therapists with a profile, verifiable licence, treatments and bookings by WhatsApp. Ready in minutes.',
      includes: ['Professional profile with credentials and a link to verify your licence', 'Trust line (certifications, no-obligation assessment)', 'Treatment categories with their own page', 'Video carousel', 'Appointment or assessment by WhatsApp', 'Map and clinic hours'],
      tag: 'Medical practice', btns: ['Book assessment', 'Treatments', 'Location'],
      faq: [{ q: 'Can I show my licence?', a: 'Yes: your profile includes credentials and a link to verify the licence, which builds trust.' }, { q: 'Is patient health data stored?', a: 'We do not ask for clinical data. A request is a WhatsApp message with a name, day and time slot.' }],
    },
  },
  inmobiliaria: {
    'es-MX': {
      h1: 'El sitio de tu inmobiliaria, listo hoy',
      lead: 'Propiedades con filtros, ficha propia por inmueble y solicitudes de visita que llegan a tu WhatsApp con la propiedad ya elegida.',
      meta: 'Sitio web para inmobiliarias y asesores con propiedades, filtros, ficha por inmueble y visitas por WhatsApp. Listo en minutos.',
      includes: ['Lista de propiedades con filtros (operación, tipo, recámaras)', 'Ficha propia por propiedad con galería', 'Estado: disponible, apartada o vendida', 'Solicitud de visita con la propiedad elegida', 'Perfil del asesor', 'Mapa y datos de contacto'],
      tag: 'Bienes raíces', btns: ['Ver propiedades', 'Pedir visita', 'WhatsApp'],
      faq: [{ q: '¿Cada propiedad tiene su propio enlace?', a: 'Sí. Cada inmueble tiene su ficha y su enlace para compartirlo en redes o por mensaje.' }, { q: '¿Cuántas propiedades puedo publicar?', a: 'Hasta 12 por lista, y puedes poner varias listas; las vendidas se marcan sin borrarlas.' }],
    },
    en: {
      h1: 'Your real estate site, ready today',
      lead: 'Listings with filters, a page per property and visit requests that reach your WhatsApp with the property already chosen.',
      meta: 'A website for real estate agencies and agents with listings, filters, a page per property and visits by WhatsApp. Ready in minutes.',
      includes: ['Property list with filters (deal, type, bedrooms)', 'A page per property with a gallery', 'Status: available, reserved or sold', 'Visit request with the chosen property', 'Agent profile', 'Map and contact details'],
      tag: 'Real estate', btns: ['See properties', 'Request a visit', 'WhatsApp'],
      faq: [{ q: 'Does each property get its own link?', a: 'Yes. Every listing has its own page and link to share on social media or in a message.' }, { q: 'How many properties can I publish?', a: 'Up to 12 per list, and you can add several lists; sold ones are marked without deleting them.' }],
    },
  },
  fitness: {
    'es-MX': {
      h1: 'El sitio de tu gimnasio o estudio, listo hoy',
      lead: 'Programas, horario semanal de clases y reservaciones de clase muestra por WhatsApp. Tus alumnos ven qué hay hoy sin preguntar.',
      meta: 'Sitio web para gimnasios y estudios fitness con programas, horario de clases y clase muestra por WhatsApp. Listo en minutos.',
      includes: ['Programas con nivel, duración y precio', 'Horario semanal de clases con instructor y cupo', 'Reservar clase muestra por WhatsApp', 'Instructores y equipo', 'Videos de las clases', 'Mapa y horario del estudio'],
      tag: 'Entrenamiento', btns: ['Clase muestra', 'Horario', 'Programas'],
      faq: [{ q: '¿Puedo mostrar el horario de toda la semana?', a: 'Sí, por día, con instructor y cupo. Lo cambias cuando se mueva una clase.' }, { q: '¿Cobran los pagos de mensualidad?', a: 'No. El sitio te trae a los alumnos por WhatsApp; el cobro lo manejas como hoy.' }],
    },
    en: {
      h1: 'Your gym or studio site, ready today',
      lead: 'Programs, a weekly class schedule and trial-class requests on WhatsApp. Members see what is on today without asking.',
      meta: 'A website for gyms and fitness studios with programs, class schedule and trial class by WhatsApp. Ready in minutes.',
      includes: ['Programs with level, length and price', 'Weekly class schedule with instructor and spots', 'Trial class booking by WhatsApp', 'Instructors and team', 'Class videos', 'Map and studio hours'],
      tag: 'Training', btns: ['Trial class', 'Schedule', 'Programs'],
      faq: [{ q: 'Can I show the whole week?', a: 'Yes, by day, with instructor and spots. Change it whenever a class moves.' }, { q: 'Do you handle membership payments?', a: 'No. The site brings people to you on WhatsApp; you handle payment as you do today.' }],
    },
  },
  servicios: {
    'es-MX': {
      h1: 'El sitio de tu negocio de servicios, listo hoy',
      lead: 'Plomeros, electricistas, abogados, contadores: servicios con precio de referencia y cotizaciones guiadas que llegan a tu WhatsApp.',
      meta: 'Sitio web para oficios y servicios profesionales con servicios, cobertura y cotización guiada por WhatsApp. Listo en minutos.',
      includes: ['Lista de servicios con precio de referencia', 'Cotización guiada: tu cliente describe lo que necesita', 'Zona de cobertura', 'Línea de confianza y garantías', 'Portafolio con tus trabajos', 'Llamada o WhatsApp en un toque'],
      tag: 'Servicios profesionales', btns: ['Pedir cotización', 'Servicios', 'Zona de cobertura'],
      faq: [{ q: '¿Mis clientes pueden pedir presupuesto sin llamar?', a: 'Sí: llenan un breve formulario y te llega por WhatsApp listo para contestar.' }, { q: '¿Sirve si trabajo solo?', a: 'Es justo para eso: un solo enlace que puedes poner en tu tarjeta, tu camioneta o tu perfil.' }],
    },
    en: {
      h1: 'Your trade or professional services site, ready today',
      lead: 'Plumbers, electricians, lawyers, accountants: services with reference prices and guided quote requests on your WhatsApp.',
      meta: 'A website for trades and professional services with services, coverage area and guided quotes by WhatsApp. Ready in minutes.',
      includes: ['Service list with reference prices', 'Guided quote: your client describes what they need', 'Coverage area', 'Trust line and guarantees', 'Portfolio of your work', 'Call or WhatsApp in one tap'],
      tag: 'Professional services', btns: ['Request a quote', 'Services', 'Coverage area'],
      faq: [{ q: 'Can clients ask for a quote without calling?', a: 'Yes: they fill a short form and it reaches you on WhatsApp ready to answer.' }, { q: 'Does it work if I work alone?', a: 'That is exactly the use: one link for your business card, your van or your profile.' }],
    },
  },
}
