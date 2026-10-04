import { defineMessages } from '@/i18n/define'

export const pricingMessages = defineMessages(
  {
    title: 'Pricing',
    description: (monthly: string, yearly: string) => `Scout is free forever. Pro Prospect is ${monthly} or ${yearly} with video analysis, college matching and unlimited logging.`,
    lead: 'Start free. Upgrade when you want deeper analysis. The price you see is the price you pay, and you can cancel any time in one step.',
    errors: {
      'rate-limited': 'Too many checkout attempts. Wait a few minutes and try again.',
      unavailable: 'Checkout is temporarily unavailable. No payment was taken. Try again later.',
      'checkout-failed': 'We could not start checkout. No payment was taken. Try again in a moment.',
      'invalid-plan': 'Choose a monthly or yearly plan.',
    } as Record<string, string>,
    features: { 'video-analysis': 'Video analysis is part of Pro.', matchmaker: 'The College Matchmaker is part of Pro.' } as Record<string, string>,
    canceled: 'Checkout canceled. You have not been charged.',
    freeForever: 'free forever',
    createProfile: 'Create free profile',
    perMonthOr: (yearly: string, savings: number) => `per month, or ${yearly} (save $${savings})`,
    createToUpgrade: 'Create a profile to upgrade',
    taxNote: 'Prices are in US dollars. If sales tax applies where you live, it is shown at checkout before you pay. Athletes under 18 need a parent or guardian to approve and complete the purchase.',
    refundPolicy: 'Refund Policy',
  },
  {
    title: 'Precios',
    description: (monthly: string, yearly: string) => `Scout es gratis para siempre. Pro Prospect cuesta ${monthly} o ${yearly} e incluye análisis de video, coincidencias con universidades y registro ilimitado.`,
    lead: 'Empieza gratis. Mejora tu plan cuando quieras un análisis más profundo. El precio que ves es el que pagas, y puedes cancelar en cualquier momento en un solo paso.',
    errors: {
      'rate-limited': 'Demasiados intentos de pago. Espera unos minutos e inténtalo de nuevo.',
      unavailable: 'El pago no está disponible por el momento. No se hizo ningún cargo. Inténtalo más tarde.',
      'checkout-failed': 'No pudimos iniciar el pago. No se hizo ningún cargo. Inténtalo de nuevo en un momento.',
      'invalid-plan': 'Elige un plan mensual o anual.',
    },
    features: { 'video-analysis': 'El análisis de video es parte de Pro.', matchmaker: 'El College Matchmaker es parte de Pro.' },
    canceled: 'Pago cancelado. No se te hizo ningún cargo.',
    freeForever: 'gratis para siempre',
    createProfile: 'Crear perfil gratis',
    perMonthOr: (yearly: string, savings: number) => `al mes, o ${yearly} (ahorras $${savings})`,
    createToUpgrade: 'Crea un perfil para mejorar tu plan',
    taxNote: 'Los precios están en dólares estadounidenses. Si en tu estado aplica impuesto sobre las ventas, se muestra en el pago antes de que pagues. Los atletas menores de 18 años necesitan que su padre, madre o tutor apruebe y complete la compra.',
    refundPolicy: 'Política de reembolsos',
  },
)

export const faqPageMessages = defineMessages(
  {
    title: 'Frequently asked questions',
    description: 'How percentiles are calculated, who can see your data, how accurate video analysis is, what the College Matchmaker does, and how billing works.',
    crumb: 'FAQ',
    lead: 'Straight answers about how KineticScout works. Still stuck?',
    contactUs: 'Contact us',
    reply: 'and we will reply within 2 business days.',
  },
  {
    title: 'Preguntas frecuentes',
    description: 'Cómo se calculan los percentiles, quién puede ver tus datos, qué tan preciso es el análisis de video, qué hace el College Matchmaker y cómo funcionan los pagos.',
    crumb: 'Preguntas frecuentes',
    lead: 'Respuestas claras sobre cómo funciona KineticScout. ¿Sigues con dudas?',
    contactUs: 'Contáctanos',
    reply: 'y te responderemos en un plazo de 2 días hábiles.',
  },
)
