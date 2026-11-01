import type { Giro } from '../minisitio/giros.ts'

/** Contenido de las páginas por giro (design, 1-nov-2026, bloque 1). El `h1` lleva un solo marcatextos: <span class="hl-…"> es HTML nuestro, no de usuarios.
 *  `etiqueta`: verde = incluido, rosa = nuevo, azul = información o categoría. El inglés no se diseñó: es traducción directa. */
export type GiroCard = { t: string; d: string; chip: 'verde' | 'rosa' | 'azul'; chipText: string }
export type GiroSite = { chip: string; h1: string; lead: string; cards: GiroCard[]; faq: { q: string; a: string }[] }

export const GIRO_SITE: Record<Giro, Record<'es-MX' | 'en', GiroSite>> = {
  restaurante: {
    'es-MX': {
      chip: "Para restaurantes",
      h1: "Que te pidan directo, <span class=\"hl-verde\">sin comisión</span>.",
      lead: "Un menú que se lee en el celular, botones para pedir y un mapa con horarios. Sin pagar comisión por pedido.",
      cards: [
        { t: "Pide directo", d: "Botón principal a tu WhatsApp, teléfono o tienda en línea.", chip: "verde", chipText: "Incluido" },
        { t: "Menú con precios", d: "Platillos, descripción y precio. Lo editas tú o te lo cambiamos.", chip: "verde", chipText: "Incluido" },
        { t: "Plataformas de reparto", d: "Enlaces a Uber Eats y Rappi, por si el cliente prefiere.", chip: "verde", chipText: "Incluido" },
        { t: "QR de mesa", d: "Un código por mesa que abre tu menú.", chip: "rosa", chipText: "Nuevo" },
        { t: "Mapa y horarios", d: "Con «abierto ahora» y cómo llegar.", chip: "verde", chipText: "Incluido" },
        { t: "Estadísticas", d: "Cuántos abren tu menú y qué botón tocan.", chip: "verde", chipText: "Incluido" },
      ],
      faq: [
        { q: "¿Puedo cambiar el menú yo mismo?", a: "Sí. Desde tu panel editas platillos y precios, y el cambio se ve al instante." },
        { q: "¿Cobran comisión por pedido?", a: "No. Los pedidos llegan directo a tu WhatsApp o teléfono." },
        { q: "¿Sirve si ya tengo Instagram?", a: "Sí. Tu liga va en la biografía y lleva a todo lo demás." },
      ],
    },
    en: {
      chip: "For restaurants",
      h1: "Get orders <span class=\"hl-verde\">direct, no fees</span>.",
      lead: "A menu that reads well on a phone, order buttons and a map with opening hours. No commission per order.",
      cards: [
        { t: "Order direct", d: "Main button to your WhatsApp, phone or online store.", chip: "verde", chipText: "Included" },
        { t: "Menu with prices", d: "Dishes, description and price. You edit it, or we do.", chip: "verde", chipText: "Included" },
        { t: "Delivery platforms", d: "Links to Uber Eats and Rappi, in case customers prefer them.", chip: "verde", chipText: "Included" },
        { t: "Table QR", d: "One code per table that opens your menu.", chip: "rosa", chipText: "New" },
        { t: "Map and hours", d: "With «open now» and directions.", chip: "verde", chipText: "Included" },
        { t: "Statistics", d: "How many open your menu and which button they tap.", chip: "verde", chipText: "Included" },
      ],
      faq: [
        { q: "Can I change the menu myself?", a: "Yes. Edit dishes and prices from your panel and the change shows instantly." },
        { q: "Do you charge a fee per order?", a: "No. Orders reach your WhatsApp or phone directly." },
        { q: "Is it useful if I already have Instagram?", a: "Yes. Your link goes in your bio and leads to everything else." },
      ],
    },
  },
  belleza: {
    'es-MX': {
      chip: "Para salones y estudios",
      h1: "Que tu agenda se llene <span class=\"hl-rosa\">sola</span>.",
      lead: "Servicios con precio, galería de tus trabajos y un botón para agendar cita. Se ve como tu salón: tranquilo y cuidado.",
      cards: [
        { t: "Agendar cita", d: "Botón a tu WhatsApp o a tu calendario de citas.", chip: "verde", chipText: "Incluido" },
        { t: "Servicios con precio", d: "Manicure, pestañas, corte. Con duración y precio.", chip: "verde", chipText: "Incluido" },
        { t: "Galería de trabajos", d: "Antes y después, en cuadrícula o carrusel.", chip: "verde", chipText: "Incluido" },
        { t: "Promoción del mes", d: "Una franja con tu oferta y fecha límite.", chip: "rosa", chipText: "Nuevo" },
        { t: "Tarjeta de contacto", d: "Tus datos para guardar en el celular en un toque.", chip: "verde", chipText: "Incluido" },
        { t: "Reseñas", d: "Testimonios reales con nombre.", chip: "verde", chipText: "Incluido" },
      ],
      faq: [
        { q: "¿Puedo mostrar fotos de mis clientas?", a: "Sí, con su permiso. Te ayudamos a pedirlo." },
        { q: "¿Se conecta con mi agenda?", a: "Con tu WhatsApp o con un calendario de citas externo." },
        { q: "¿Y si cambio de precios?", a: "Los editas en tu panel y se actualiza al momento." },
      ],
    },
    en: {
      chip: "For salons and studios",
      h1: "Let your calendar <span class=\"hl-rosa\">fill itself</span>.",
      lead: "Services with prices, a gallery of your work and a button to book. It looks like your salon: calm and cared for.",
      cards: [
        { t: "Book an appointment", d: "Button to your WhatsApp or your booking calendar.", chip: "verde", chipText: "Included" },
        { t: "Services with prices", d: "Manicure, lashes, haircut. With duration and price.", chip: "verde", chipText: "Included" },
        { t: "Gallery of your work", d: "Before and after, in a grid or a carousel.", chip: "verde", chipText: "Included" },
        { t: "Promotion of the month", d: "A strip with your offer and deadline.", chip: "rosa", chipText: "New" },
        { t: "Contact card", d: "Your details, saved to the phone in one tap.", chip: "verde", chipText: "Included" },
        { t: "Reviews", d: "Real testimonials with names.", chip: "verde", chipText: "Included" },
      ],
      faq: [
        { q: "Can I show photos of my clients?", a: "Yes, with their permission. We help you ask for it." },
        { q: "Does it connect to my calendar?", a: "With your WhatsApp or an external booking calendar." },
        { q: "What if I change my prices?", a: "Edit them in your panel and they update right away." },
      ],
    },
  },
  salud: {
    'es-MX': {
      chip: "Para consultorios y clínicas",
      h1: "Pacientes que ya saben <span class=\"hl-azul\">a dónde ir</span>.",
      lead: "Tu perfil profesional, tus tratamientos explicados con claridad y un botón para agendar consulta. Con cédula y aviso de privacidad.",
      cards: [
        { t: "Agendar valoración", d: "WhatsApp, teléfono o enlace a tu agenda.", chip: "verde", chipText: "Incluido" },
        { t: "Tratamientos explicados", d: "Una tarjeta por área, con lo que incluye.", chip: "verde", chipText: "Incluido" },
        { t: "Perfil de la doctora o doctor", d: "Formación, cédulas y certificaciones visibles.", chip: "verde", chipText: "Incluido" },
        { t: "Aviso de privacidad", d: "Texto base para consultorio, listo para firmar.", chip: "azul", chipText: "Información" },
        { t: "Ubicación y horarios", d: "Mapa, consultorio y días de atención.", chip: "verde", chipText: "Incluido" },
        { t: "Videos y preguntas", d: "Respuestas breves a lo que más preguntan.", chip: "verde", chipText: "Incluido" },
      ],
      faq: [
        { q: "¿Puedo mostrar mi cédula?", a: "Sí, y es lo que más confianza da. Hay un bloque para eso." },
        { q: "¿Cumple con la ley de datos?", a: "Incluye un aviso de privacidad base. Revísalo con tu asesor legal." },
        { q: "¿Pueden agendar sin llamar?", a: "Sí, por WhatsApp o con el enlace a tu agenda." },
      ],
    },
    en: {
      chip: "For practices and clinics",
      h1: "Patients who know <span class=\"hl-azul\">where to go</span>.",
      lead: "Your professional profile, your treatments explained clearly and a button to book a visit. With license number and privacy notice.",
      cards: [
        { t: "Book an assessment", d: "WhatsApp, phone or a link to your calendar.", chip: "verde", chipText: "Included" },
        { t: "Treatments explained", d: "One card per area, with what it includes.", chip: "verde", chipText: "Included" },
        { t: "Doctor profile", d: "Training, licenses and certifications in plain sight.", chip: "verde", chipText: "Included" },
        { t: "Privacy notice", d: "A base text for practices, ready to sign.", chip: "azul", chipText: "Info" },
        { t: "Location and hours", d: "Map, office and opening days.", chip: "verde", chipText: "Included" },
        { t: "Videos and questions", d: "Short answers to what people ask most.", chip: "verde", chipText: "Included" },
      ],
      faq: [
        { q: "Can I show my license number?", a: "Yes, and it builds the most trust. There is a block for it." },
        { q: "Does it comply with data law?", a: "It includes a base privacy notice. Review it with your legal advisor." },
        { q: "Can people book without calling?", a: "Yes, by WhatsApp or with the link to your calendar." },
      ],
    },
  },
  inmobiliaria: {
    'es-MX': {
      chip: "Para asesores y agencias",
      h1: "Tus propiedades, <span class=\"hl-lima\">listas para compartir</span>.",
      lead: "Tarjetas de propiedad con precio, medidas y fotos. Una liga por asesor y botón directo a tu WhatsApp.",
      cards: [
        { t: "Propiedades", d: "Tarjetas con precio, recámaras, baños y m².", chip: "verde", chipText: "Incluido" },
        { t: "Una liga por asesor", d: "Cada asesor con su perfil y su WhatsApp.", chip: "verde", chipText: "Incluido" },
        { t: "Estado de la propiedad", d: "Venta, renta o apartada, con etiqueta.", chip: "azul", chipText: "Categoría" },
        { t: "Nueva propiedad", d: "Avisa a quienes se suscribieron.", chip: "rosa", chipText: "Nuevo" },
        { t: "Agendar visita", d: "Botón con mensaje prellenado.", chip: "verde", chipText: "Incluido" },
        { t: "Mapa de la oficina", d: "Con cómo llegar.", chip: "verde", chipText: "Incluido" },
      ],
      faq: [
        { q: "¿Cuántas propiedades puedo poner?", a: "Las que necesites. Se ordenan arrastrando." },
        { q: "¿Puedo marcar una propiedad como vendida?", a: "Sí. Cambia la etiqueta y deja de aparecer como disponible." },
        { q: "¿Cada asesor tiene su liga?", a: "Sí, y todas llevan tu marca." },
      ],
    },
    en: {
      chip: "For agents and agencies",
      h1: "Your properties, <span class=\"hl-lima\">ready to share</span>.",
      lead: "Property cards with price, size and photos. One link per agent and a direct button to your WhatsApp.",
      cards: [
        { t: "Properties", d: "Cards with price, bedrooms, bathrooms and m².", chip: "verde", chipText: "Included" },
        { t: "One link per agent", d: "Each agent with their own profile and WhatsApp.", chip: "verde", chipText: "Included" },
        { t: "Property status", d: "Sale, rent or reserved, with a label.", chip: "azul", chipText: "Category" },
        { t: "New property", d: "Notify the people who subscribed.", chip: "rosa", chipText: "New" },
        { t: "Book a viewing", d: "A button with a prefilled message.", chip: "verde", chipText: "Included" },
        { t: "Office map", d: "With directions.", chip: "verde", chipText: "Included" },
      ],
      faq: [
        { q: "How many properties can I add?", a: "As many as you need. Drag to reorder." },
        { q: "Can I mark a property as sold?", a: "Yes. Change the label and it stops showing as available." },
        { q: "Does each agent get their own link?", a: "Yes, and all of them carry your brand." },
      ],
    },
  },
  fitness: {
    'es-MX': {
      chip: "Para gimnasios y estudios",
      h1: "Que reserven su clase de <span class=\"hl-azul\">prueba</span>.",
      lead: "Clases de la semana con cupo, planes con precio y un botón para reservar. Pensado para quien entrena y para quien apenas empieza.",
      cards: [
        { t: "Clase de prueba", d: "Un botón para reservar la primera clase.", chip: "verde", chipText: "Incluido" },
        { t: "Horario de clases", d: "Días, horas y cupos disponibles.", chip: "verde", chipText: "Incluido" },
        { t: "Planes y precios", d: "Suelta, mensual y trimestral.", chip: "verde", chipText: "Incluido" },
        { t: "Reto del mes", d: "Una promoción con fecha de cierre.", chip: "rosa", chipText: "Nuevo" },
        { t: "Entrenadores", d: "Foto y especialidad de cada uno.", chip: "verde", chipText: "Incluido" },
        { t: "Estudio en el mapa", d: "Con horario y cómo llegar.", chip: "verde", chipText: "Incluido" },
      ],
      faq: [
        { q: "¿Pueden ver cuántos lugares quedan?", a: "Sí, lo actualizas desde tu panel." },
        { q: "¿Cobran por la clase de prueba?", a: "Eso lo decides tú; el botón puede decir «gratis» o el precio." },
        { q: "¿Sirve para varias sucursales?", a: "Sí, una liga por sucursal con su mapa." },
      ],
    },
    en: {
      chip: "For gyms and studios",
      h1: "Let them book their <span class=\"hl-azul\">trial class</span>.",
      lead: "This week’s classes with spots left, plans with prices and a button to book. Made for people who train and people just starting.",
      cards: [
        { t: "Trial class", d: "A button to book the first class.", chip: "verde", chipText: "Included" },
        { t: "Class schedule", d: "Days, times and spots available.", chip: "verde", chipText: "Included" },
        { t: "Plans and prices", d: "Drop-in, monthly and quarterly.", chip: "verde", chipText: "Included" },
        { t: "Challenge of the month", d: "A promotion with a closing date.", chip: "rosa", chipText: "New" },
        { t: "Trainers", d: "Photo and specialty for each one.", chip: "verde", chipText: "Included" },
        { t: "Studio on the map", d: "With hours and directions.", chip: "verde", chipText: "Included" },
      ],
      faq: [
        { q: "Can people see how many spots are left?", a: "Yes, you update it from your panel." },
        { q: "Do you charge for the trial class?", a: "You decide; the button can say «free» or show the price." },
        { q: "Does it work for several locations?", a: "Yes, one link per location with its own map." },
      ],
    },
  },
  servicios: {
    'es-MX': {
      chip: "Para despachos y consultores",
      h1: "Que te encuentren y te <span class=\"hl-rosa\">cotizen</span>.",
      lead: "Lo que haces, cómo trabajas y un botón para pedir cotización. Para contadores, abogados, arquitectos y consultores.",
      cards: [
        { t: "Pedir cotización", d: "Formulario corto o botón a WhatsApp.", chip: "verde", chipText: "Incluido" },
        { t: "Servicios explicados", d: "Lista numerada, con una línea por servicio.", chip: "verde", chipText: "Incluido" },
        { t: "Cómo trabajamos", d: "Tres pasos para que el cliente sepa qué sigue.", chip: "verde", chipText: "Incluido" },
        { t: "Promoción de arranque", d: "Descuento por tiempo limitado.", chip: "rosa", chipText: "Nuevo" },
        { t: "Preguntas frecuentes", d: "Respuestas a lo que siempre preguntan.", chip: "verde", chipText: "Incluido" },
        { t: "Oficina y horarios", d: "Con cita previa, mapa y cómo llegar.", chip: "verde", chipText: "Incluido" },
      ],
      faq: [
        { q: "¿Puedo recibir solicitudes por correo?", a: "Sí, el formulario te las manda a tu correo y a tu panel." },
        { q: "¿Puedo poner mis casos?", a: "Sí, con un bloque de testimonios o de proyectos." },
        { q: "¿Atienden clientes fuera de mi ciudad?", a: "Tú decides: puedes marcar que todo es en línea." },
      ],
    },
    en: {
      chip: "For firms and consultants",
      h1: "Be found and <span class=\"hl-rosa\">get quoted</span>.",
      lead: "What you do, how you work and a button to request a quote. For accountants, lawyers, architects and consultants.",
      cards: [
        { t: "Request a quote", d: "A short form or a WhatsApp button.", chip: "verde", chipText: "Included" },
        { t: "Services explained", d: "A numbered list, one line per service.", chip: "verde", chipText: "Included" },
        { t: "How we work", d: "Three steps so the client knows what comes next.", chip: "verde", chipText: "Included" },
        { t: "Launch promotion", d: "A limited-time discount.", chip: "rosa", chipText: "New" },
        { t: "Frequently asked questions", d: "Answers to what people always ask.", chip: "verde", chipText: "Included" },
        { t: "Office and hours", d: "By appointment, with map and directions.", chip: "verde", chipText: "Included" },
      ],
      faq: [
        { q: "Can I receive requests by email?", a: "Yes, the form sends them to your email and your panel." },
        { q: "Can I show my cases?", a: "Yes, with a testimonials or projects block." },
        { q: "Do you serve clients outside my city?", a: "You decide: you can mark everything as online." },
      ],
    },
  },
}
