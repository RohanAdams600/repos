import { PRO_PRICES } from '@/lib/billing/plans'

export type Faq = { id: string; question: string; answer: string[] }

/**
 * The five questions families ask most. Every statement here describes how the product actually
 * works; keep it in sync with the code it describes (noted in each entry).
 */
export const FAQS: readonly Faq[] = [
  {
    id: 'percentiles',
    question: 'How is my percentile calculated?',
    // src/lib/metrics/service.ts, worker/agents/seo/percentiles.ts
    answer: [
      'Every Sunday we rebuild the reference groups from KineticScout athletes. Each athlete counts once per metric, using their best value from the previous 12 months, so someone who logs every day does not outweigh someone who logs once.',
      'Your percentile compares your best value from the last 18 months with the athletes in your graduating class. A 75th percentile exit velocity means you are ahead of about 75% of your class on KineticScout. For timed events such as the 60-yard dash, a faster time ranks higher.',
      'Groups with fewer than 25 athletes are never shown, so no single athlete can be identified from a percentile. The comparison is with athletes on KineticScout, not every player in the country.',
    ],
  },
  {
    id: 'privacy',
    question: 'Who can see my profile and my numbers?',
    // src/lib/auth/permissions.ts, docs/COMPLIANCE.md
    answer: [
      'Profiles are private when you create them. Nothing is visible to coaches or the public until you choose to make your profile public.',
      'Athletes under 18 need a parent or guardian to approve by email before their profile can go public, before any message to a coach, and before a purchase. Children under 13 cannot create an account.',
      'We never sell personal information and do not share it for advertising. Aggregate statistics we publish always describe groups of at least 25 athletes.',
    ],
  },
  {
    id: 'video-analysis',
    question: 'How does the video analysis work, and how accurate is it?',
    // src/lib/biomechanics/kinematics.ts
    answer: [
      'You upload a short clip of one swing or pitch. Google Cloud Video Intelligence detects body landmarks in every frame, and our analysis measures when your hips, trunk, arm and hand each reach peak rotational speed. Efficient athletes fire in that order, each segment slightly after the one before.',
      'The report shows the order and spacing of those peaks, hip and shoulder separation when the front foot lands, and the sequencing problems they point to, with a skeleton drawn over your video.',
      'It works from a single 2D camera view, so treat speeds as estimates and use the report to compare your own clips over time. For the best results, film from directly in front of your chest at hip height, with your whole body in frame, in slow motion (120 or 240 frames per second). It is not medical advice or a replacement for a qualified coach.',
    ],
  },
  {
    id: 'matchmaker',
    question: 'Does the College Matchmaker tell me which schools will offer me?',
    // src/lib/matchmaker/score.ts
    answer: [
      "No. It compares your best numbers with each program's typical recent recruit, weighted for your position: pitch velocity for pitchers; exit velocity, arm strength and speed for position players.",
      'Programs are grouped as a strong fit, a realistic target, a reach or a long shot, and the fit score is highest where your numbers sit at or slightly above the typical recruit. If your GPA is below a program’s listed minimum, that program is shown as a reach at best.',
      'Coaches weigh many things we cannot measure, from game performance to character, so use the matches to decide where to focus your outreach, not as a prediction.',
    ],
  },
  {
    id: 'billing',
    question: 'How do billing, cancellation and refunds work?',
    // src/lib/billing/*, /legal/refunds
    answer: [
      `Scout is free forever and includes 3 metric entries a month. Pro Prospect costs ${PRO_PRICES.monthly.label} or ${PRO_PRICES.yearly.label}, and the price on the pricing page is exactly what you are charged.`,
      'You can cancel any time from your billing page in one step, with no cancellation fee. Pro stays active until the end of the period you paid for.',
      'If Pro is not for you, email us within 14 days of your first payment, or of a yearly renewal, for a full refund. If two subscriptions are ever started on one account, the extra one is cancelled and refunded automatically. Athletes under 18 need a parent or guardian to approve and complete the purchase.',
    ],
  },
]

/** The same answers in Spanish. Keep both in sync with the code each entry describes. */
export const FAQS_ES: readonly Faq[] = [
  {
    id: 'percentiles',
    question: '¿Cómo se calcula mi percentil?',
    answer: [
      'Cada domingo reconstruimos los grupos de referencia con los atletas de KineticScout. Cada atleta cuenta una sola vez por medición, con su mejor valor de los 12 meses anteriores, así que alguien que registra todos los días no pesa más que alguien que registra una vez.',
      'Tu percentil compara tu mejor valor de los últimos 18 meses con los atletas de tu clase de graduación. Un percentil 75 en velocidad de salida significa que superas a cerca del 75% de tu clase en KineticScout. En pruebas cronometradas, como la carrera de 60 yardas, un tiempo más rápido ocupa un lugar más alto.',
      'Nunca mostramos grupos de menos de 25 atletas, para que nadie pueda ser identificado por un percentil. La comparación es con atletas de KineticScout, no con todos los jugadores del país.',
    ],
  },
  {
    id: 'privacy',
    question: '¿Quién puede ver mi perfil y mis números?',
    answer: [
      'Los perfiles son privados cuando los creas. Nada es visible para entrenadores ni para el público hasta que decidas hacer público tu perfil.',
      'Los atletas menores de 18 años necesitan que su padre, madre o tutor lo apruebe por correo antes de que su perfil sea público, antes de cualquier mensaje a un entrenador y antes de una compra. Los menores de 13 años no pueden crear una cuenta.',
      'Nunca vendemos información personal ni la compartimos para publicidad. Las estadísticas que publicamos siempre describen grupos de al menos 25 atletas.',
    ],
  },
  {
    id: 'video-analysis',
    question: '¿Cómo funciona el análisis de video y qué tan preciso es?',
    answer: [
      'Subes un video corto de un swing o un lanzamiento. Google Cloud Video Intelligence detecta los puntos del cuerpo en cada cuadro, y nuestro análisis mide cuándo tus caderas, tronco, brazo y mano alcanzan su máxima velocidad de rotación. Los atletas eficientes los activan en ese orden, cada segmento un poco después del anterior.',
      'El informe muestra el orden y el espacio entre esos picos, la separación entre caderas y hombros cuando aterriza el pie delantero y los problemas de secuencia que indican, con un esqueleto dibujado sobre tu video.',
      'Funciona con una sola cámara en 2D, así que toma las velocidades como estimaciones y usa el informe para comparar tus propios videos con el tiempo. Para mejores resultados, graba justo frente a tu pecho a la altura de la cadera, con todo el cuerpo en el cuadro, en cámara lenta (120 o 240 cuadros por segundo). No es un consejo médico ni reemplaza a un entrenador calificado.',
    ],
  },
  {
    id: 'matchmaker',
    question: '¿El College Matchmaker me dice qué escuelas me harán una oferta?',
    answer: [
      'No. Compara tus mejores números con el recluta típico reciente de cada programa, ponderados según tu posición: velocidad de lanzamiento para los lanzadores; velocidad de salida, fuerza de brazo y velocidad de carrera para los jugadores de posición.',
      'Los programas se agrupan como muy buena opción, objetivo realista, opción difícil u opción muy difícil, y la puntuación es más alta donde tus números están en el nivel del recluta típico o un poco por encima. Si tu GPA está por debajo del mínimo que publica un programa, ese programa aparece como opción difícil en el mejor de los casos.',
      'Los entrenadores consideran muchas cosas que no podemos medir, desde el rendimiento en los juegos hasta el carácter, así que usa las coincidencias para decidir dónde enfocar tus mensajes, no como una predicción.',
    ],
  },
  {
    id: 'billing',
    question: '¿Cómo funcionan los pagos, las cancelaciones y los reembolsos?',
    answer: [
      `Scout es gratis para siempre e incluye 3 registros de mediciones al mes. Pro Prospect cuesta ${PRO_PRICES.monthly.label.replace(' per month', ' al mes')} o ${PRO_PRICES.yearly.label.replace(' per year', ' al año')}, y el precio de la página de precios es exactamente lo que se cobra.`,
      'Puedes cancelar en cualquier momento desde tu página de facturación en un solo paso, sin cargo por cancelación. Pro sigue activo hasta el final del periodo que pagaste.',
      'Si Pro no es para ti, escríbenos dentro de los 14 días posteriores a tu primer pago, o a una renovación anual, para un reembolso completo. Si alguna vez se inician dos suscripciones en una cuenta, la adicional se cancela y se reembolsa automáticamente. Los atletas menores de 18 años necesitan que su padre, madre o tutor apruebe y complete la compra.',
    ],
  },
]

export function faqsFor(locale: 'en' | 'es'): readonly Faq[] {
  return locale === 'es' ? FAQS_ES : FAQS
}

export function faqJsonLd(faqs: readonly Faq[] = FAQS): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer.join(' ') },
    })),
  }
}
