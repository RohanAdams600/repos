/**
 * Plan catalogue. The displayed prices here are checked against the live Stripe Price before
 * every checkout (see assertPriceMatchesDisplay), so a customer is never charged an amount
 * different from the one shown on the pricing page.
 */

export type BillingPeriod = 'monthly' | 'yearly'

export const PRO_PRICES: Record<BillingPeriod, { amountCents: number; currency: 'usd'; interval: 'month' | 'year'; label: string }> = {
  monthly: { amountCents: 1499, currency: 'usd', interval: 'month', label: '$14.99 per month' },
  yearly: { amountCents: 12900, currency: 'usd', interval: 'year', label: '$129 per year' },
}

export const FREE_FEATURES = [
  'Public profile link and one-page PDF for recruiters',
  'Log up to 3 metrics per month',
  'Percentiles against your graduating class and athletes your size',
  'Verified badges for measurements backed by video',
] as const

export const PRO_FEATURES = [
  'Unlimited metric logging with progression charts',
  'AI biomechanics video analysis with skeletal overlay',
  'Side-by-side comparison synced at foot strike',
  'College Matchmaker against program recruiting averages',
  'Recruiting assistant: coaching-change and roster-need alerts with AI-drafted outreach',
  'Training plans built from your video analysis, with drills from our staff coaches',
] as const

export const FREE_FEATURES_ES: readonly string[] = [
  'Enlace a tu perfil público y un PDF de una página para reclutadores',
  'Registra hasta 3 mediciones al mes',
  'Percentiles frente a tu clase de graduación y atletas de tu tamaño',
  'Insignias de verificación para mediciones respaldadas con video',
]

export const PRO_FEATURES_ES: readonly string[] = [
  'Registro ilimitado de mediciones con gráficas de progreso',
  'Análisis biomecánico de video con IA y esqueleto superpuesto',
  'Comparación lado a lado sincronizada en el apoyo del pie',
  'College Matchmaker frente a los promedios de reclutamiento de cada programa',
  'Asistente de reclutamiento: alertas de cambios de entrenador y necesidades de plantel, con borradores de mensajes escritos con IA',
  'Planes de entrenamiento creados a partir de tu análisis de video, con ejercicios de nuestros entrenadores',
]

export function planFeatures(locale: 'en' | 'es'): { free: readonly string[]; pro: readonly string[] } {
  return locale === 'es' ? { free: FREE_FEATURES_ES, pro: PRO_FEATURES_ES } : { free: FREE_FEATURES, pro: PRO_FEATURES }
}

/** Price labels as shown, for example "$14.99 per month" or "$14.99 al mes". */
export function priceLabel(period: BillingPeriod, locale: 'en' | 'es'): string {
  const amount = formatUsd(PRO_PRICES[period].amountCents)
  if (locale === 'es') return `${amount} ${period === 'monthly' ? 'al mes' : 'al año'}`
  return `${amount} ${period === 'monthly' ? 'per month' : 'per year'}`
}

/** Yearly savings versus twelve monthly payments, in whole dollars, for honest comparison copy. */
export function yearlySavingsDollars(): number {
  return Math.round((PRO_PRICES.monthly.amountCents * 12 - PRO_PRICES.yearly.amountCents) / 100)
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)
}
