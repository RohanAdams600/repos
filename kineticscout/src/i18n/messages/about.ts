import { defineMessages } from '@/i18n/define'

export const aboutMessages = defineMessages(
  {
    title: 'About',
    description: 'Who runs KineticScout, what we believe about athlete data, and how to reach us.',
    h1: 'About KineticScout',
    lead: 'KineticScout gives high school athletes and their families a clear picture of their measurables: where they stand in their class, what is holding their mechanics back, and which programs recruit athletes with numbers like theirs.',
    howWeWork: 'How we work',
    principles: [
      ['Your data is yours', 'Profiles start private. We never sell personal information or use it for advertising.'],
      ['Minors are protected by default', 'No accounts under 13. Teens need a parent or guardian to approve anything public or paid.'],
      ['Numbers you can trace', 'Every published statistic comes from anonymized groups of at least 25 athletes, with the method shown.'],
      ['No promises we cannot keep', 'We show how measurables compare. We never claim to guarantee a roster spot, offer or scholarship.'],
    ] as [string, string][],
    team: 'The team',
    contactTitle: 'Contact and location',
    directions: 'Get directions (opens Google Maps)',
    fastest: 'The fastest way to reach us is the',
    contactPage: 'contact page',
    reply: 'We reply within 2 business days.',
  },
  {
    title: 'Quiénes somos',
    description: 'Quién está detrás de KineticScout, qué pensamos sobre los datos de los atletas y cómo contactarnos.',
    h1: 'Sobre KineticScout',
    lead: 'KineticScout les da a los atletas de high school y a sus familias una imagen clara de sus mediciones: dónde están dentro de su clase, qué está frenando su mecánica y qué programas reclutan atletas con números como los suyos.',
    howWeWork: 'Cómo trabajamos',
    principles: [
      ['Tus datos son tuyos', 'Los perfiles empiezan siendo privados. Nunca vendemos información personal ni la usamos para publicidad.'],
      ['Los menores están protegidos desde el inicio', 'No hay cuentas para menores de 13 años. Los adolescentes necesitan que su padre, madre o tutor apruebe todo lo que sea público o de pago.'],
      ['Números que puedes comprobar', 'Cada estadística publicada sale de grupos anónimos de al menos 25 atletas, y mostramos el método.'],
      ['No prometemos lo que no podemos cumplir', 'Mostramos cómo se comparan las mediciones. Nunca decimos garantizar un lugar en el plantel, una oferta o una beca.'],
    ],
    team: 'El equipo',
    contactTitle: 'Contacto y ubicación',
    directions: 'Cómo llegar (abre Google Maps)',
    fastest: 'La forma más rápida de contactarnos es la',
    contactPage: 'página de contacto',
    reply: 'Respondemos en un plazo de 2 días hábiles.',
  },
)
