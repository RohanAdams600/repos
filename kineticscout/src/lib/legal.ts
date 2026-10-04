import 'server-only'
import { env } from '@/lib/env'

/** Bump when the Terms of Service or Privacy Policy change materially; users re-accept on next sign-in. */
export const CURRENT_TERMS_VERSION = '2026-10-04'
export const LEGAL_LAST_UPDATED = 'October 4, 2026'

export type BusinessDetails = {
  legalName: string
  postalAddress: string
  supportEmail: string
  phone: string | null
  governingLaw: string
  /** True when every required detail is configured. Legal pages refuse to render otherwise in deployed environments. */
  complete: boolean
}

/**
 * Business identity comes from configuration, never from hard-coded sample values, so the legal
 * pages can only ever show the operator's real details.
 */
export function businessDetails(): BusinessDetails {
  const e = env()
  const legalName = e.BUSINESS_LEGAL_NAME
  const postalAddress = e.BUSINESS_POSTAL_ADDRESS
  const supportEmail = e.BUSINESS_SUPPORT_EMAIL
  const governingLaw = e.BUSINESS_GOVERNING_LAW
  return {
    legalName: legalName ?? 'the operator of KineticScout',
    postalAddress: postalAddress ?? 'Not configured',
    supportEmail: supportEmail ?? 'Not configured',
    phone: e.BUSINESS_PHONE ?? null,
    governingLaw: governingLaw ?? 'Not configured',
    complete: Boolean(legalName && postalAddress && supportEmail && governingLaw),
  }
}
