import 'server-only'
import { env } from '@/lib/env'
import { businessDetails } from '@/lib/legal'

/** schema.org Organization with the real business address, or null until the details are configured. */
export function organizationJsonLd(): Record<string, unknown> | null {
  const b = businessDetails()
  if (!b.complete) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'KineticScout',
    legalName: b.legalName,
    url: env().APP_URL,
    logo: `${env().APP_URL}/icon.svg`,
    email: b.supportEmail,
    ...(b.phone ? { telephone: b.phone } : {}),
    address: { '@type': 'PostalAddress', streetAddress: b.postalAddress },
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: b.supportEmail, availableLanguage: 'English' },
  }
}
